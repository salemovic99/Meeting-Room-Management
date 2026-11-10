import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingSeries, BookingStatus, User

NOT_CANCELLED = Booking.status != BookingStatus.CANCELLED.value


@dataclass
class BookingFilters:
    room_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    organizer_id: uuid.UUID | None = None
    status: str | None = None
    start: datetime | None = None   # bookings ending after
    end: datetime | None = None     # bookings starting before
    q: str | None = None
    mine_user_id: uuid.UUID | None = None


class BookingRepository:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def get(self, booking_id: uuid.UUID, *, for_update: bool = False) -> Booking | None:
        stmt = select(Booking).where(Booking.id == booking_id).execution_options(populate_existing=True)
        if for_update:
            stmt = stmt.with_for_update(of=Booking)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def overlapping(self, room_id: uuid.UUID, start: datetime, end: datetime,
                          exclude_ids: Sequence[uuid.UUID] = ()) -> list[Booking]:
        stmt = select(Booking).where(
            Booking.room_id == room_id, NOT_CANCELLED, Booking.start_at < end, Booking.end_at > start
        ).order_by(Booking.start_at)
        if exclude_ids:
            stmt = stmt.where(Booking.id.not_in(list(exclude_ids)))
        return list((await self.s.execute(stmt)).scalars())

    def _filtered(self, f: BookingFilters) -> Select:
        stmt = select(Booking)
        if f.room_id:
            stmt = stmt.where(Booking.room_id == f.room_id)
        if f.department_id:
            stmt = stmt.where(Booking.department_id == f.department_id)
        if f.organizer_id:
            stmt = stmt.where(Booking.organizer_id == f.organizer_id)
        if f.status:
            stmt = stmt.where(Booking.status == f.status)
        if f.start:
            stmt = stmt.where(Booking.end_at > f.start)
        if f.end:
            stmt = stmt.where(Booking.start_at < f.end)
        if f.mine_user_id:
            stmt = stmt.where(or_(Booking.organizer_id == f.mine_user_id,
                                  Booking.created_by_id == f.mine_user_id))
        if f.q:
            like = f"%{f.q.strip()}%"
            stmt = stmt.join(User, User.id == Booking.organizer_id).where(
                or_(Booking.title.ilike(like), User.full_name.ilike(like)))
        return stmt

    async def search(self, f: BookingFilters, offset: int, limit: int,
                     visible_to_user: uuid.UUID | None = None) -> tuple[list[Booking], int]:
        stmt = self._filtered(f)
        total = (await self.s.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (await self.s.execute(
            stmt.order_by(Booking.start_at.desc()).offset(offset).limit(limit))).scalars().all()
        return list(rows), int(total)

    async def calendar(self, start: datetime, end: datetime, room_id: uuid.UUID | None,
                       department_id: uuid.UUID | None, include_cancelled: bool) -> list[Booking]:
        stmt = self._filtered(BookingFilters(room_id=room_id, department_id=department_id,
                                             start=start, end=end))
        if not include_cancelled:
            stmt = stmt.where(NOT_CANCELLED)
        return list((await self.s.execute(stmt.order_by(Booking.start_at))).scalars())

    async def active_for_rooms(self, room_ids: Sequence[uuid.UUID], now: datetime,
                               until: datetime) -> dict[uuid.UUID, list[Booking]]:
        out: dict[uuid.UUID, list[Booking]] = {r: [] for r in room_ids}
        if not room_ids:
            return out
        stmt = select(Booking).where(
            Booking.room_id.in_(list(room_ids)), NOT_CANCELLED, Booking.end_at > now, Booking.start_at < until
        ).order_by(Booking.start_at)
        for b in (await self.s.execute(stmt)).scalars():
            out[b.room_id].append(b)
        return out

    async def in_period(self, start: datetime, end: datetime,
                        department_id: uuid.UUID | None = None) -> list[Booking]:
        stmt = select(Booking).where(Booking.start_at < end, Booking.end_at > start)
        if department_id:
            stmt = stmt.where(Booking.department_id == department_id)
        return list((await self.s.execute(stmt.order_by(Booking.start_at))).scalars())

    async def count_future(self, *, room_id: uuid.UUID | None = None,
                           organizer_id: uuid.UUID | None = None, now: datetime) -> int:
        stmt = select(func.count()).select_from(Booking).where(NOT_CANCELLED, Booking.start_at > now)
        if room_id:
            stmt = stmt.where(Booking.room_id == room_id)
        if organizer_id:
            stmt = stmt.where(Booking.organizer_id == organizer_id)
        return int((await self.s.execute(stmt)).scalar_one())

    async def get_series(self, series_id: uuid.UUID) -> BookingSeries | None:
        return await self.s.get(BookingSeries, series_id)

    async def series_occurrences(self, series_id: uuid.UUID, *, future_after: datetime | None = None,
                                 for_update: bool = False) -> list[Booking]:
        stmt = select(Booking).where(Booking.series_id == series_id).order_by(Booking.start_at)
        if future_after is not None:
            stmt = stmt.where(Booking.start_at > future_after, NOT_CANCELLED)
        if for_update:
            stmt = stmt.with_for_update(of=Booking)
        return list((await self.s.execute(stmt.execution_options(populate_existing=True))).scalars())
