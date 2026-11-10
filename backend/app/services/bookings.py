"""Booking domain service: validation, conflict detection, recurrence, audit + realtime events.

Concurrency: an app-level overlap query gives friendly errors, but the authoritative guard is the
PostgreSQL exclusion constraint `bookings_no_overlap`. Two simultaneous requests for the same slot
can both pass the app check; exactly one INSERT succeeds and the other gets a 409.
"""
import uuid
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BookingConflict, Forbidden, NotFound, ValidationFailed
from app.core.timeutils import now_utc, parse_hhmm, to_local
from app.models import Booking, BookingSeries, BookingStatus, Department, MeetingRoom, User
from app.models.booking import NO_OVERLAP_CONSTRAINT
from app.permissions.codes import P
from app.permissions.policy import Principal, can_book_for, can_manage_booking
from app.repositories.bookings import BookingRepository
from app.schemas.bookings import (
    BookingCreate,
    BookingUpdate,
    RecurringBookingCreate,
    SeriesUpdate,
    SkippedOccurrence,
)
from app.services import audit, outbox, recurrence, system_settings
from app.services.schedule_rules import (
    BookingLimits,
    RoomRules,
    SlotProblem,
    effective_status,
    find_overlapping,
    overlaps,
    validate_slot,
)
from app.services.serializers import conflict_item

AUDIT_FIELDS = ["room_id", "organizer_id", "department_id", "title", "description", "meeting_type",
                "start_at", "end_at", "attendee_count", "status", "notes", "series_id", "source"]


SERIES_WIDE_PROBLEMS = {"room_inactive", "room_maintenance", "capacity_exceeded", "duration_too_short",
                        "duration_too_long", "invalid_time_range"}


def is_exclusion_violation(e: IntegrityError) -> bool:
    orig = getattr(e, "orig", None)
    code = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return code == "23P01" or NO_OVERLAP_CONSTRAINT in str(e)


def _raise_problems(problems: list[SlotProblem]) -> None:
    if problems:
        first = problems[0]
        raise ValidationFailed(first.message, code=first.code, details={
            "fields": [{"loc": ["body", p.field] if p.field else ["body"], "msg": p.message, "code": p.code}
                       for p in problems]})


class BookingService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s = session
        self.p = principal
        self.ip = ip
        self.repo = BookingRepository(session)

    # ---- helpers --------------------------------------------------------------------------------

    async def _limits(self) -> BookingLimits:
        cfg = await system_settings.get_all(self.s)
        return BookingLimits(cfg["booking.min_duration_minutes"], cfg["booking.max_duration_minutes"],
                             cfg["booking.advance_days"])

    async def _room(self, room_id: uuid.UUID) -> MeetingRoom:
        room = await self.s.get(MeetingRoom, room_id)
        if room is None:
            raise ValidationFailed("Room not found", code="room_not_found",
                                   details={"fields": [{"loc": ["body", "room_id"], "msg": "Room not found"}]})
        return room

    @staticmethod
    def _rules(room: MeetingRoom) -> RoomRules:
        return RoomRules(room.is_active, room.maintenance_mode, room.capacity, room.operating_hours)

    def _can_override_capacity(self, requested: bool) -> bool:
        return requested and self.p.has(P.BOOKINGS_OVERRIDE_CAPACITY)

    async def _resolve_organizer(self, organizer_id: uuid.UUID | None,
                                 department_id: uuid.UUID | None) -> tuple[User, Department]:
        organizer = await self.s.get(User, organizer_id or self.p.user_id)
        if organizer is None or not organizer.is_active:
            raise ValidationFailed("Organizer must be an active employee", code="organizer_inactive")
        if not can_book_for(self.p, organizer.id, organizer.department_id):
            raise Forbidden("You cannot book on behalf of this employee")
        dept_id = department_id or organizer.department_id
        if dept_id is None:
            raise ValidationFailed("A department is required", code="department_required",
                                   details={"fields": [{"loc": ["body", "department_id"],
                                                        "msg": "Organizer has no department"}]})
        dept = await self.s.get(Department, dept_id)
        if dept is None or not dept.is_active:
            raise ValidationFailed("Department must be active", code="department_inactive")
        if (dept.id != organizer.department_id and not self.p.has(P.BOOKINGS_MANAGE_ALL)
                and dept.id != self.p.department_id):
            raise Forbidden("You cannot book for this department")
        return organizer, dept

    async def _assert_no_conflicts(self, room_id: uuid.UUID, start: datetime, end: datetime,
                                   exclude: list[uuid.UUID]) -> None:
        clashes = await self.repo.overlapping(room_id, start, end, exclude)
        if clashes:
            raise BookingConflict("The room is already booked for part of this time", details={
                "conflicts": [conflict_item(b, self.p).model_dump(mode="json") for b in clashes]})

    async def _flush_or_conflict(self, room_id: uuid.UUID, start: datetime, end: datetime) -> None:
        try:
            await self.s.flush()
        except IntegrityError as e:
            await self.s.rollback()
            if is_exclusion_violation(e):
                # Lost a race with a concurrent request; report what we collided with.
                clashes = await self.repo.overlapping(room_id, start, end)
                raise BookingConflict("The room was just booked by someone else", details={
                    "conflicts": [conflict_item(b, self.p).model_dump(mode="json") for b in clashes]}) from e
            raise

    async def _load_manageable(self, booking_id: uuid.UUID) -> Booking:
        b = await self.repo.get(booking_id, for_update=True)
        if b is None:
            raise NotFound("Booking not found")
        if not can_manage_booking(self.p, b):
            raise Forbidden("You are not allowed to modify this booking")
        return b

    def _event(self, event_type: str, b: Booking, room_ids: list[uuid.UUID] | None = None) -> None:
        outbox.enqueue(self.s, event_type, "booking", b.id, room_ids=room_ids or [b.room_id],
                       data={"booking_id": str(b.id), "room_id": str(b.room_id)})

    # ---- single bookings ------------------------------------------------------------------------

    async def create(self, data: BookingCreate) -> Booking:
        now = now_utc()
        room = await self._room(data.room_id)
        organizer, dept = await self._resolve_organizer(data.organizer_id, data.department_id)
        start, end = data.start_at, data.end_at
        _raise_problems(validate_slot(self._rules(room), start, end, data.attendee_count,
                                      await self._limits(), now,
                                      allow_capacity_override=self._can_override_capacity(
                                          data.override_capacity)))
        await self._assert_no_conflicts(room.id, start, end, [])

        b = Booking(room_id=room.id, organizer_id=organizer.id, department_id=dept.id, title=data.title,
                    description=data.description, meeting_type=data.meeting_type.value, start_at=start,
                    end_at=end, attendee_count=data.attendee_count, notes=data.notes,
                    created_by_id=self.p.user_id, source=data.source,
                    status=effective_status(BookingStatus.CONFIRMED, start, end, now))
        self.s.add(b)
        await self._flush_or_conflict(room.id, start, end)
        audit.record(self.s, action="booking.created", entity_type="booking", entity_id=b.id,
                     actor_user_id=self.p.user_id, new_values=audit.snapshot(b, AUDIT_FIELDS), ip_address=self.ip)
        self._event("booking.created", b)
        await outbox.commit(self.s)
        return await self.repo.get(b.id)  # type: ignore[return-value]

    async def update(self, booking_id: uuid.UUID, data: BookingUpdate) -> Booking:
        now = now_utc()
        b = await self._load_manageable(booking_id)
        if b.status == BookingStatus.CANCELLED:
            raise ValidationFailed("Cancelled bookings cannot be modified", code="booking_cancelled")
        if b.end_at <= now and not self.p.has(P.BOOKINGS_MANAGE_ALL):
            raise ValidationFailed("Past bookings cannot be modified", code="booking_in_past")

        old = audit.snapshot(b, AUDIT_FIELDS)
        changes = data.model_dump(exclude_unset=True, exclude={"override_capacity"})
        room = await self._room(changes.get("room_id") or b.room_id)

        if "organizer_id" in changes or "department_id" in changes:
            organizer, dept = await self._resolve_organizer(changes.get("organizer_id") or b.organizer_id,
                                                            changes.get("department_id") or b.department_id)
            b.organizer_id, b.department_id = organizer.id, dept.id

        start = changes.get("start_at") or b.start_at
        end = changes.get("end_at") or b.end_at
        attendees = changes.get("attendee_count") or b.attendee_count
        if start >= end:
            raise ValidationFailed("Start time must be earlier than end time", code="invalid_time_range")
        slot_changed = start != b.start_at or end != b.end_at or room.id != b.room_id
        if slot_changed or "attendee_count" in changes:
            problems = validate_slot(
                self._rules(room), start, end, attendees, await self._limits(), now,
                allow_capacity_override=self._can_override_capacity(data.override_capacity),
                # Extending a running meeting keeps its (past) start time.
                check_start_in_past=start != b.start_at,
            )
            if not slot_changed:  # only attendee count changed: skip time-based rules
                problems = [p for p in problems if p.code == "capacity_exceeded"]
            if slot_changed and end <= now:
                problems.append(SlotProblem("end_in_past", "End time must be in the future", "end_at"))
            _raise_problems(problems)
        if slot_changed:
            await self._assert_no_conflicts(room.id, start, end, [b.id])

        for field in ("title", "attendee_count"):
            if changes.get(field) is not None:
                setattr(b, field, changes[field])
        for field in ("description", "notes"):  # nullable
            if field in changes:
                setattr(b, field, changes[field])
        if changes.get("meeting_type"):
            b.meeting_type = changes["meeting_type"].value
        old_room = b.room_id
        b.room_id, b.start_at, b.end_at = room.id, start, end
        b.status = effective_status(BookingStatus.CONFIRMED, start, end, now)
        if b.series_id and slot_changed:
            b.is_series_exception = True

        await self._flush_or_conflict(room.id, start, end)
        o, n = audit.diff(old, audit.snapshot(b, AUDIT_FIELDS))
        audit.record(self.s, action="booking.updated", entity_type="booking", entity_id=b.id,
                     actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
        self._event("booking.updated", b, room_ids=[old_room, b.room_id])
        await outbox.commit(self.s)
        return await self.repo.get(b.id)  # type: ignore[return-value]

    async def cancel(self, booking_id: uuid.UUID, reason: str | None) -> Booking:
        now = now_utc()
        b = await self._load_manageable(booking_id)
        if b.status == BookingStatus.CANCELLED:
            return b
        if b.end_at <= now:
            raise ValidationFailed("Completed bookings cannot be cancelled", code="booking_in_past")
        old_status = b.status
        b.status, b.cancelled_at, b.cancellation_reason = BookingStatus.CANCELLED.value, now, reason
        audit.record(self.s, action="booking.cancelled", entity_type="booking", entity_id=b.id,
                     actor_user_id=self.p.user_id, old_values={"status": old_status},
                     new_values={"status": b.status, "reason": reason}, ip_address=self.ip)
        self._event("booking.cancelled", b)
        await outbox.commit(self.s)
        return await self.repo.get(b.id)  # type: ignore[return-value]

    async def conflicts(self, room_id: uuid.UUID, start: datetime, end: datetime,
                        exclude: uuid.UUID | None) -> list[Booking]:
        return await self.repo.overlapping(room_id, start, end, [exclude] if exclude else [])

    # ---- recurring series -----------------------------------------------------------------------

    async def create_recurring(self, data: RecurringBookingCreate) -> tuple[BookingSeries, list[Booking],
                                                                             list[SkippedOccurrence]]:
        now = now_utc()
        room = await self._room(data.room_id)
        organizer, dept = await self._resolve_organizer(data.organizer_id, data.department_id)
        try:
            rule, occurrences = recurrence.expand(data.recurrence, data.start_at, data.end_at)
        except ValueError as e:
            raise ValidationFailed(str(e), code="invalid_recurrence") from e
        if not occurrences:
            raise ValidationFailed("The recurrence produces no meetings", code="invalid_recurrence")

        limits = await self._limits()
        override = self._can_override_capacity(data.override_capacity)
        existing = await self.repo.overlapping(room.id, occurrences[0][0], occurrences[-1][1])

        problems: list[dict] = []
        accepted: list[tuple[datetime, datetime]] = []
        skipped: list[SkippedOccurrence] = []
        for start, end in occurrences:
            slot = validate_slot(self._rules(room), start, end, data.attendee_count, limits, now,
                                 allow_capacity_override=override)
            # Problems that apply to every occurrence fail the whole request; per-date problems
            # (conflicts, closed days, booking horizon) are reported/skipped individually.
            series_wide = [p for p in slot if p.code in SERIES_WIDE_PROBLEMS]
            _raise_problems(series_wide)
            clash = find_overlapping(existing, start, end)
            reason = "conflict" if clash else (slot[0].code if slot else None)
            if reason:
                problems.append({"start_at": start.isoformat(), "end_at": end.isoformat(), "reason": reason,
                                 "conflicting_booking_id": str(clash[0].id) if clash else None})
                skipped.append(SkippedOccurrence(start_at=start, end_at=end, reason=reason))
            else:
                accepted.append((start, end))

        if problems and not data.skip_conflicts:
            raise BookingConflict(
                f"{len(problems)} of {len(occurrences)} occurrences cannot be booked",
                details={"conflicts": problems})
        if not accepted:
            raise BookingConflict("None of the occurrences can be booked", details={"conflicts": problems})

        first_d, last_d = recurrence.occurrence_dates(occurrences)
        series = BookingSeries(organizer_id=organizer.id, room_id=room.id,
                               recurrence_rule=recurrence.rule_string(rule),
                               series_start_date=first_d, series_end_date=last_d)
        self.s.add(series)
        await self.s.flush()
        bookings = [
            Booking(room_id=room.id, organizer_id=organizer.id, department_id=dept.id, series_id=series.id,
                    title=data.title, description=data.description, meeting_type=data.meeting_type.value,
                    start_at=s, end_at=e, attendee_count=data.attendee_count, notes=data.notes,
                    created_by_id=self.p.user_id,
                    status=effective_status(BookingStatus.CONFIRMED, s, e, now))
            for s, e in accepted
        ]
        self.s.add_all(bookings)
        await self._flush_or_conflict(room.id, accepted[0][0], accepted[-1][1])
        audit.record(self.s, action="booking_series.created", entity_type="booking_series",
                     entity_id=series.id, actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={"rule": series.recurrence_rule, "room_id": room.id, "title": data.title,
                                 "occurrences": len(bookings), "skipped": len(skipped)})
        outbox.enqueue(self.s, "booking.created", "booking_series", series.id, room_ids=[room.id],
                       data={"series_id": str(series.id), "count": len(bookings)})
        await outbox.commit(self.s)
        created = await self.repo.series_occurrences(series.id)
        return series, created, skipped

    async def _load_series(self, series_id: uuid.UUID) -> tuple[BookingSeries, list[Booking]]:
        series = await self.repo.get_series(series_id)
        if series is None:
            raise NotFound("Series not found")
        future = await self.repo.series_occurrences(series_id, future_after=now_utc(), for_update=True)
        manageable = [b for b in future if can_manage_booking(self.p, b)]
        if future and len(manageable) != len(future):
            raise Forbidden("You are not allowed to modify this series")
        if not future:
            any_occ = await self.repo.series_occurrences(series_id)
            if any_occ and not can_manage_booking(self.p, any_occ[0]):
                raise Forbidden("You are not allowed to modify this series")
        return series, future

    async def update_series(self, series_id: uuid.UUID, data: SeriesUpdate) -> BookingSeries:
        now = now_utc()
        series, future = await self._load_series(series_id)
        if not future:
            raise ValidationFailed("The series has no upcoming meetings to modify", code="series_finished")
        changes = data.model_dump(exclude_unset=True, exclude={"override_capacity"})
        room = await self._room(changes.get("room_id", series.room_id))
        limits = await self._limits()
        override = self._can_override_capacity(data.override_capacity)

        new_slots: dict[uuid.UUID, tuple[datetime, datetime]] = {}
        for b in future:
            s, e = b.start_at, b.end_at
            if "start_time" in changes or "end_time" in changes:
                st = parse_hhmm(changes["start_time"]) if "start_time" in changes else None
                et = parse_hhmm(changes["end_time"]) if "end_time" in changes else None
                st = st or to_local(b.start_at).time()
                et = et or to_local(b.end_at).time()
                if et <= st:
                    raise ValidationFailed("End time must be after start time", code="invalid_time_range")
                s, e = recurrence.shift_to_times(b.start_at, st, et)
            new_slots[b.id] = (s, e)

        ids = [b.id for b in future]
        problems = []
        for b in future:
            s, e = new_slots[b.id]
            attendees = changes.get("attendee_count", b.attendee_count)
            slot = validate_slot(self._rules(room), s, e, attendees, limits, now,
                                 allow_capacity_override=override)
            clash = await self.repo.overlapping(room.id, s, e, ids)
            # occurrences of this same series moving onto each other
            clash_internal = [o for o in future if o.id != b.id and overlaps(*new_slots[o.id], s, e)]
            if slot or clash or clash_internal:
                problems.append({"start_at": s.isoformat(), "end_at": e.isoformat(),
                                 "reason": "conflict" if (clash or clash_internal) else slot[0].code,
                                 "conflicting_booking_id": str(clash[0].id) if clash else None})
        if problems:
            raise BookingConflict(f"{len(problems)} occurrences cannot be updated",
                                  details={"conflicts": problems})

        for b in future:
            for field in ("title", "description", "notes", "attendee_count"):
                if field in changes:
                    setattr(b, field, changes[field])
            if "meeting_type" in changes:
                b.meeting_type = changes["meeting_type"].value
            b.room_id = room.id
            b.start_at, b.end_at = new_slots[b.id]
        series.room_id = room.id
        await self._flush_or_conflict(room.id, min(s for s, _ in new_slots.values()),
                                      max(e for _, e in new_slots.values()))
        audit.record(self.s, action="booking_series.updated", entity_type="booking_series",
                     entity_id=series.id, actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={**changes, "occurrences_affected": len(future)})
        outbox.enqueue(self.s, "booking.updated", "booking_series", series.id,
                       room_ids=list({room.id, *(b.room_id for b in future)}),
                       data={"series_id": str(series.id)})
        await outbox.commit(self.s)
        return series

    async def cancel_series(self, series_id: uuid.UUID, reason: str | None) -> tuple[BookingSeries, int]:
        now = now_utc()
        series, future = await self._load_series(series_id)
        for b in future:
            b.status, b.cancelled_at, b.cancellation_reason = BookingStatus.CANCELLED.value, now, reason
        audit.record(self.s, action="booking_series.cancelled", entity_type="booking_series",
                     entity_id=series.id, actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={"cancelled_count": len(future), "reason": reason})
        if future:
            outbox.enqueue(self.s, "booking.cancelled", "booking_series", series.id,
                           room_ids=list({b.room_id for b in future}), data={"series_id": str(series.id)})
        await outbox.commit(self.s)
        return series, len(future)
