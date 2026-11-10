"""Analytics are computed in Python over the period's bookings. Volumes for an internal deployment
(a handful of rooms) are small; move aggregations to SQL if that ever changes.

Utilization = booked hours inside operating hours / operating hours, over the requested period.
"""
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, ValidationFailed
from app.core.timeutils import local_range_bounds, local_today, now_utc, to_local
from app.models import Booking, BookingStatus, Department, MeetingRoom
from app.permissions.codes import P
from app.permissions.policy import Principal
from app.repositories.bookings import BookingRepository
from app.services.schedule_rules import day_window, operating_hours_between

MAX_PERIOD_DAYS = 400


@dataclass
class Scope:
    start_date: date
    end_date: date
    start: datetime
    end: datetime
    department_id: uuid.UUID | None

    @property
    def period(self) -> dict:
        return {"from": self.start_date.isoformat(), "to": self.end_date.isoformat()}


def resolve_scope(p: Principal, from_: date | None, to: date | None) -> Scope:
    if p.has(P.ANALYTICS_VIEW):
        dept = None
    elif p.has(P.ANALYTICS_VIEW_DEPARTMENT):
        if p.department_id is None:
            raise Forbidden("You are not assigned to a department")
        dept = p.department_id
    else:
        raise Forbidden("You do not have permission to view analytics")
    to = to or local_today()
    from_ = from_ or (to - timedelta(days=29))
    if from_ > to:
        raise ValidationFailed("'from' must be on or before 'to'")
    if (to - from_).days > MAX_PERIOD_DAYS:
        raise ValidationFailed(f"Period cannot exceed {MAX_PERIOD_DAYS} days")
    start, end = local_range_bounds(from_, to)
    return Scope(from_, to, start, end, dept)


def _hours(a: datetime, b: datetime) -> float:
    return max(0.0, (b - a).total_seconds() / 3600)


def booked_hours_in_operating_hours(b: Booking, oh: dict | None, start: datetime, end: datetime) -> float:
    s, e = max(b.start_at, start), min(b.end_at, end)
    if e <= s:
        return 0.0
    total = 0.0
    d = to_local(s).date()
    while d <= to_local(e).date():
        w = day_window(oh, d)
        if w:
            total += _hours(max(s, w[0]), min(e, w[1]))
        d += timedelta(days=1)
    return total


class AnalyticsService:
    def __init__(self, session: AsyncSession, principal: Principal):
        self.s, self.p = session, principal
        self.repo = BookingRepository(session)

    async def _rooms(self) -> list[MeetingRoom]:
        return list((await self.s.execute(select(MeetingRoom).order_by(MeetingRoom.name))).scalars())

    async def _bookings(self, sc: Scope) -> list[Booking]:
        return await self.repo.in_period(sc.start, sc.end, sc.department_id)

    async def utilization(self, sc: Scope) -> dict:
        rooms = await self._rooms()
        bookings = [b for b in await self._bookings(sc) if b.status != BookingStatus.CANCELLED]
        per_room: dict[uuid.UUID, list[Booking]] = defaultdict(list)
        for b in bookings:
            per_room[b.room_id].append(b)
        rows = []
        for r in rooms:
            if not r.is_active and not per_room[r.id]:
                continue
            available = operating_hours_between(r.operating_hours, sc.start, sc.end)
            booked = sum(booked_hours_in_operating_hours(b, r.operating_hours, sc.start, sc.end)
                         for b in per_room[r.id])
            rows.append({"room_id": r.id, "room_name": r.name, "booking_count": len(per_room[r.id]),
                         "booked_hours": round(booked, 2), "available_hours": round(available, 2),
                         "utilization_pct": round(100 * booked / available, 1) if available else 0.0})
        most_used = max(rows, key=lambda x: x["booked_hours"], default=None)
        return {"period": sc.period, "rooms": rows,
                "most_used_room_id": most_used["room_id"] if most_used and most_used["booked_hours"] else None}

    async def departments(self, sc: Scope) -> dict:
        bookings = [b for b in await self._bookings(sc) if b.status != BookingStatus.CANCELLED]
        hours: dict[uuid.UUID, float] = defaultdict(float)
        counts: Counter[uuid.UUID] = Counter()
        for b in bookings:
            hours[b.department_id] += _hours(max(b.start_at, sc.start), min(b.end_at, sc.end))
            counts[b.department_id] += 1
        names = {d.id: d.name for d in (await self.s.execute(select(Department))).scalars()}
        total = sum(hours.values()) or 1.0
        rows = sorted(({"department_id": d, "name": names.get(d, "Unknown"), "booking_count": counts[d],
                        "booked_hours": round(h, 2), "share_pct": round(100 * h / total, 1)}
                       for d, h in hours.items()), key=lambda x: -x["booked_hours"])
        return {"period": sc.period, "departments": rows}

    async def cancellations(self, sc: Scope) -> dict:
        bookings = await self._bookings(sc)
        cancelled = [b for b in bookings if b.status == BookingStatus.CANCELLED]
        by_room = Counter(b.room_id for b in cancelled)
        by_dept = Counter(b.department_id for b in cancelled)
        room_names = {b.room_id: b.room.name for b in bookings}
        dept_names = {b.department_id: b.department.name for b in bookings}
        return {
            "period": sc.period, "total_bookings": len(bookings), "cancelled": len(cancelled),
            "cancellation_rate_pct": round(100 * len(cancelled) / len(bookings), 1) if bookings else 0.0,
            "by_room": [{"room_id": r, "room_name": room_names[r], "cancelled": n} for r, n in by_room.most_common()],
            "by_department": [{"department_id": d, "name": dept_names[d], "cancelled": n}
                              for d, n in by_dept.most_common()],
        }

    async def peak_hours(self, sc: Scope) -> dict:
        bookings = [b for b in await self._bookings(sc) if b.status != BookingStatus.CANCELLED]
        hours = {h: {"hour": h, "booking_count": 0, "booked_hours": 0.0} for h in range(24)}
        weekdays = Counter()
        for b in bookings:
            local_start = to_local(b.start_at)
            weekdays[local_start.weekday()] += 1
            # Spread each meeting over the local clock hours it covers.
            t = max(b.start_at, sc.start)
            end = min(b.end_at, sc.end)
            seen = set()
            while t < end:
                lt = to_local(t)
                slot_end = min(end, t + timedelta(minutes=60 - lt.minute, seconds=-lt.second))
                hours[lt.hour]["booked_hours"] += _hours(t, slot_end)
                if lt.hour not in seen:
                    hours[lt.hour]["booking_count"] += 1
                    seen.add(lt.hour)
                t = slot_end
        for h in hours.values():
            h["booked_hours"] = round(h["booked_hours"], 2)
        return {"period": sc.period, "hours": list(hours.values()),
                "weekdays": [{"weekday": d, "booking_count": weekdays[d]} for d in range(7)]}

    async def organizer_activity(self, sc: Scope) -> list[dict]:
        bookings = await self._bookings(sc)
        agg: dict[uuid.UUID, dict] = {}
        for b in bookings:
            row = agg.setdefault(b.organizer_id, {"organizer": b.organizer.full_name, "email": b.organizer.email,
                                                  "department": b.department.name, "bookings": 0,
                                                  "cancelled": 0, "booked_hours": 0.0})
            row["bookings"] += 1
            if b.status == BookingStatus.CANCELLED:
                row["cancelled"] += 1
            else:
                row["booked_hours"] += _hours(b.start_at, b.end_at)
        rows = sorted(agg.values(), key=lambda r: -r["bookings"])
        for r in rows:
            r["booked_hours"] = round(r["booked_hours"], 2)
        return rows

    async def bookings_rows(self, sc: Scope) -> list[Booking]:
        return await self._bookings(sc)


async def today_summary(session: AsyncSession) -> dict:
    """Counts for the overview cards (all rooms, today in local time)."""
    now = now_utc()
    start, end = local_range_bounds(local_today(now), local_today(now))
    bookings = await BookingRepository(session).in_period(start, end)
    rooms = {r.id: r for r in (await session.execute(
        select(MeetingRoom).where(MeetingRoom.is_active.is_(True)))).scalars()}
    live = [b for b in bookings if b.status != BookingStatus.CANCELLED]
    available = sum(operating_hours_between(r.operating_hours, start, end) for r in rooms.values())
    booked = sum(booked_hours_in_operating_hours(b, rooms[b.room_id].operating_hours, start, end)
                 for b in live if b.room_id in rooms)
    return {
        "todays_bookings": len(live),
        "cancelled_today": len(bookings) - len(live),
        "upcoming_meetings": sum(1 for b in live if b.start_at > now),
        "booked_hours_today": round(booked, 2),
        "utilization_today_pct": round(100 * booked / available, 1) if available else 0.0,
        "bookings": live,
    }
