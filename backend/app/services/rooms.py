import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.timeutils import local_day_bounds, local_today, now_utc
from app.models import DisplaySettings, MeetingRoom
from app.permissions.policy import Principal
from app.repositories.bookings import BookingRepository
from app.repositories.rooms import RoomRepository
from app.schemas.rooms import Availability, DisplaySettingsUpdate, RoomCreate, RoomUpdate
from app.permissions.codes import P
from app.schemas.bookings import QuickBookInfo, QuickBookOption, TimeSlot
from app.services import audit, outbox, quick_book, system_settings
from app.services.availability import compute_room_status
from app.services.serializers import booking_brief, booking_out, room_out

ROOM_FIELDS = ["name", "code", "display_slug", "location", "floor", "capacity", "description", "equipment",
               "operating_hours", "is_active", "maintenance_mode", "maintenance_message"]
SETTINGS_FIELDS = list(DisplaySettingsUpdate.model_fields)
LOOKAHEAD = timedelta(days=8)
RESERVED_SLUGS = {"devices", "session"}  # collide with /api/v1/display/devices|session


def _check_slug(slug: str | None) -> None:
    if slug in RESERVED_SLUGS:
        raise ValidationFailed(f"'{slug}' is reserved and cannot be used as a display slug", code="slug_reserved")


class RoomService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s, self.p, self.ip = session, principal, ip
        self.repo = RoomRepository(session)

    async def get(self, room_id: uuid.UUID) -> MeetingRoom:
        room = await self.repo.get(room_id)
        if room is None:
            raise NotFound("Room not found")
        return room

    async def create(self, data: RoomCreate) -> MeetingRoom:
        _check_slug(data.display_slug)
        taken = await self.repo.code_or_slug_taken(data.code, data.display_slug)
        if taken:
            raise Conflict(f"Room {taken} already in use", code=f"{taken}_taken")
        room = MeetingRoom(**data.model_dump())
        self.s.add(room)
        await self.s.flush()
        self.s.add(DisplaySettings(room_id=room.id))
        audit.record(self.s, action="room.created", entity_type="room", entity_id=room.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values=audit.snapshot(room, ROOM_FIELDS))
        await outbox.commit(self.s)
        return room

    async def update(self, room_id: uuid.UUID, data: RoomUpdate) -> tuple[MeetingRoom, int]:
        room = await self.get(room_id)
        changes = data.model_dump(exclude_unset=True)
        _check_slug(changes.get("display_slug"))
        taken = await self.repo.code_or_slug_taken(changes.get("code"), changes.get("display_slug"), room.id)
        if taken:
            raise Conflict(f"Room {taken} already in use", code=f"{taken}_taken")
        old = audit.snapshot(room, ROOM_FIELDS)
        nullable = {"location", "floor", "description", "operating_hours", "maintenance_message"}
        for k, v in changes.items():
            if v is not None or k in nullable:
                setattr(room, k, v)
        o, n = audit.diff(old, audit.snapshot(room, ROOM_FIELDS))
        affected = 0
        if n:
            audit.record(self.s, action="room.updated", entity_type="room", entity_id=room.id,
                         actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
            status_keys = {"is_active", "maintenance_mode", "maintenance_message", "operating_hours", "name"}
            if status_keys & set(n):
                outbox.enqueue(self.s, "room.status_changed", "room", room.id, room_ids=[room.id],
                               data={"room_id": str(room.id)})
            if n.get("maintenance_mode") or n.get("is_active") is False:
                # Existing bookings are kept (admins decide); report how many are affected.
                affected = await BookingRepository(self.s).count_future(room_id=room.id, now=now_utc())
        await outbox.commit(self.s)
        return room, affected

    async def get_display_settings(self, room_id: uuid.UUID) -> DisplaySettings:
        await self.get(room_id)
        ds = await self.repo.display_settings(room_id)
        await self.s.commit()
        return ds

    async def update_display_settings(self, room_id: uuid.UUID, data: DisplaySettingsUpdate) -> DisplaySettings:
        await self.get(room_id)
        ds = await self.repo.display_settings(room_id)
        old = audit.snapshot(ds, SETTINGS_FIELDS)
        nullable = {"logo_url", "qr_code_url", "announcement_text"}
        for k, v in data.model_dump(exclude_unset=True).items():
            if v is not None or k in nullable:
                setattr(ds, k, v)
        o, n = audit.diff(old, audit.snapshot(ds, SETTINGS_FIELDS))
        if n:
            audit.record(self.s, action="display_settings.updated", entity_type="display_settings",
                         entity_id=ds.id, actor_user_id=self.p.user_id, old_values=o, new_values=n,
                         ip_address=self.ip)
            outbox.enqueue(self.s, "display.settings_updated", "room", room_id, room_ids=[room_id],
                           data={"room_id": str(room_id)})
        await outbox.commit(self.s)
        return ds


async def quick_book_info(session: AsyncSession, principal: Principal, room: MeetingRoom) -> QuickBookInfo:
    now = now_utc()
    cfg = await system_settings.get_all(session)
    min_m, max_m = cfg["booking.min_duration_minutes"], cfg["booking.max_duration_minutes"]
    start, end = local_day_bounds(local_today(now))
    todays = await BookingRepository(session).calendar(start, end, room.id, None, False)
    availability = (await availability_for(session, [room], principal))[0]

    reason = None
    if not principal.has(P.BOOKINGS_CREATE):
        reason = "no_permission"
    elif not room.is_active:
        reason = "inactive"
    elif room.maintenance_mode:
        reason = "maintenance"
    slots = [] if reason else quick_book.free_slots_today(room.operating_hours, todays, now, min_m)
    if reason is None and not slots:
        reason = "closed"
    options = quick_book.now_options(slots, now, min_m, max_m)
    return QuickBookInfo(
        server_time=now, room=room_out(room), availability=availability, can_book=reason is None,
        reason=reason, min_duration_minutes=min_m, max_duration_minutes=max_m,
        now_options=[QuickBookOption(minutes=o.minutes, start_at=o.start_at, end_at=o.end_at) for o in options],
        free_slots=[TimeSlot(start_at=s.start_at, end_at=s.end_at) for s in slots],
        todays_bookings=[booking_out(b, principal, now) for b in todays])


async def availability_for(session: AsyncSession, rooms: list[MeetingRoom],
                           principal: Principal | None) -> list[Availability]:
    now = now_utc()
    threshold = (await system_settings.get_all(session))["availability.upcoming_threshold_minutes"]
    by_room = await BookingRepository(session).active_for_rooms([r.id for r in rooms], now, now + LOOKAHEAD)
    out = []
    for r in rooms:
        st = compute_room_status(is_active=r.is_active, maintenance_mode=r.maintenance_mode,
                                 operating_hours=r.operating_hours, bookings=by_room[r.id], now=now,
                                 upcoming_threshold_minutes=threshold)
        out.append(Availability(
            room_id=r.id, room_name=r.name, room_code=r.code, capacity=r.capacity, location=r.location,
            status=st.state, current_booking=booking_brief(st.current, principal),
            next_booking=booking_brief(st.next, principal), next_available_at=st.next_available_at,
            free_until=st.free_until, server_time=now))
    return out
