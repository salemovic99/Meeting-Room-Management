import uuid
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Forbidden, NotFound, Unauthorized, ValidationFailed
from app.core.security import (
    constant_time_equals,
    create_display_token,
    device_id_from_token,
    hash_device_token,
    new_device_token,
)
from app.core.timeutils import local_day_bounds, local_today, now_utc
from app.models import Announcement, Booking, DisplayDevice, MeetingRoom, announcement_rooms
from app.permissions.policy import Principal
from app.repositories.bookings import BookingRepository
from app.repositories.rooms import RoomRepository
from app.schemas.display import (
    CompanyInfo,
    DeviceCredential,
    DeviceOut,
    DeviceRoomRef,
    DeviceUpdate,
    DisplayAnnouncement,
    DisplayBooking,
    DisplayRoom,
    DisplaySchedule,
    DisplayStatus,
)
from app.schemas.rooms import DisplaySettingsOut
from app.services import audit, outbox, system_settings
from app.services.availability import compute_room_status
from app.services.schedule_rules import effective_status
from app.services.serializers import booking_page_url, device_status, display_url
from app.websocket.hub import hub

PRIORITY_ORDER = {"critical": 0, "high": 1, "normal": 2, "low": 3}


def device_out(d: DisplayDevice) -> DeviceOut:
    return DeviceOut(
        id=d.id, device_name=d.device_name, room_id=d.room_id,
        room=DeviceRoomRef(id=d.room.id, name=d.room.name, code=d.room.code, display_slug=d.room.display_slug),
        status=device_status(d, hub.is_device_connected(d.id), now_utc()),  # type: ignore[arg-type]
        is_active=d.is_active, last_heartbeat_at=d.last_heartbeat_at, last_connected_at=d.last_connected_at,
        browser_info=d.browser_info, firmware_info=d.firmware_info, display_url=display_url(d.room),
        created_at=d.created_at, updated_at=d.updated_at)


def _pairing_url(room: MeetingRoom, token: str) -> str:
    # Token travels in the URL *fragment*, which browsers never send to servers or proxies.
    return f"{display_url(room)}#token={token}"


class DeviceAdminService:
    def __init__(self, session: AsyncSession, principal: Principal, ip: str | None):
        self.s, self.p, self.ip = session, principal, ip

    async def _get(self, device_id: uuid.UUID) -> DisplayDevice:
        d = (await self.s.execute(select(DisplayDevice).where(DisplayDevice.id == device_id)
                                  .execution_options(populate_existing=True))).scalar_one_or_none()
        if d is None:
            raise NotFound("Display device not found")
        return d

    async def _room(self, room_id: uuid.UUID) -> MeetingRoom:
        room = await self.s.get(MeetingRoom, room_id)
        if room is None:
            raise ValidationFailed("Room not found", code="room_not_found")
        return room

    async def list(self) -> list[DisplayDevice]:
        return list((await self.s.execute(select(DisplayDevice).order_by(DisplayDevice.device_name))).scalars())

    async def register(self, name: str, room_id: uuid.UUID) -> DeviceCredential:
        room = await self._room(room_id)
        device = DisplayDevice(id=uuid.uuid4(), room_id=room.id, device_name=name.strip(),
                               device_token_hash="pending")
        token = new_device_token(device.id)
        device.device_token_hash = hash_device_token(token)
        self.s.add(device)
        await self.s.flush()
        audit.record(self.s, action="device.registered", entity_type="display_device", entity_id=device.id,
                     actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={"device_name": device.device_name, "room_id": room.id})
        await self.s.commit()
        device = await self._get(device.id)
        return DeviceCredential(device=device_out(device), device_token=token, pairing_url=_pairing_url(room, token))

    async def rotate(self, device_id: uuid.UUID) -> DeviceCredential:
        device = await self._get(device_id)
        token = new_device_token(device.id)
        device.device_token_hash = hash_device_token(token)
        device.token_version += 1
        audit.record(self.s, action="device.credential_revoked", entity_type="display_device",
                     entity_id=device.id, actor_user_id=self.p.user_id, ip_address=self.ip,
                     new_values={"token_version": device.token_version, "rotated": True})
        await self.s.commit()
        await hub.disconnect_device(device.id)
        return DeviceCredential(device=device_out(device), device_token=token,
                                pairing_url=_pairing_url(device.room, token))

    async def update(self, device_id: uuid.UUID, data: DeviceUpdate) -> DisplayDevice:
        device = await self._get(device_id)
        old = audit.snapshot(device, ["device_name", "room_id", "is_active"])
        changes = data.model_dump(exclude_unset=True)
        kick = False
        if changes.get("device_name"):
            device.device_name = changes["device_name"].strip()
        if changes.get("room_id") and changes["room_id"] != device.room_id:
            await self._room(changes["room_id"])
            device.room_id = changes["room_id"]
            device.token_version += 1  # display JWTs are room-bound; force a new session
            kick = True
        if changes.get("is_active") is not None and changes["is_active"] != device.is_active:
            device.is_active = changes["is_active"]
            if not device.is_active:
                device.token_version += 1
                device.device_status = "disabled"
                kick = True
        o, n = audit.diff(old, audit.snapshot(device, ["device_name", "room_id", "is_active"]))
        if n:
            audit.record(self.s, action="device.updated", entity_type="display_device", entity_id=device.id,
                         actor_user_id=self.p.user_id, old_values=o, new_values=n, ip_address=self.ip)
        await self.s.commit()
        if kick:
            await hub.disconnect_device(device.id)
        return await self._get(device.id)

    async def refresh(self, device_id: uuid.UUID) -> None:
        device = await self._get(device_id)
        audit.record(self.s, action="device.refresh_requested", entity_type="display_device",
                     entity_id=device.id, actor_user_id=self.p.user_id, ip_address=self.ip)
        outbox.enqueue(self.s, "display.refresh", "display_device", device.id,
                       room_ids=[device.room_id], device_ids=[device.id])
        await outbox.commit(self.s)


# ---- TV-side ------------------------------------------------------------------------------------

async def authenticate_device_token(session: AsyncSession, raw_token: str) -> DisplayDevice:
    device_id = device_id_from_token(raw_token)
    device = await session.get(DisplayDevice, device_id) if device_id else None
    if device is None or not constant_time_equals(device.device_token_hash, hash_device_token(raw_token)):
        raise Unauthorized("Invalid display credentials", code="device_revoked")
    if not device.is_active:
        raise Unauthorized("This display has been disabled", code="device_disabled")
    return device


async def open_display_session(session: AsyncSession, raw_token: str, browser_info: str | None,
                               firmware_info: str | None) -> tuple[str, DisplayDevice]:
    device = await authenticate_device_token(session, raw_token)
    if browser_info:
        device.browser_info = browser_info
    if firmware_info:
        device.firmware_info = firmware_info
    await session.commit()
    return create_display_token(device.id, device.room_id, device.token_version), device


async def assert_device_room(session: AsyncSession, device: DisplayDevice, slug: str) -> MeetingRoom:
    room = await session.get(MeetingRoom, device.room_id)
    if room is None or room.display_slug != slug:
        raise Forbidden("This display is not assigned to this room", code="wrong_room")
    return room


async def record_heartbeat(session: AsyncSession, device: DisplayDevice, browser_info: str | None = None,
                           connected: bool = False) -> None:
    now = now_utc()
    was = device.device_status
    device.last_heartbeat_at = now
    if connected:
        device.last_connected_at = now
    if browser_info:
        device.browser_info = browser_info
    device.device_status = "online"
    if was != "online":
        outbox.enqueue(session, "display.device_status", "display_device", device.id,
                       data={"device_id": str(device.id), "status": "online"})
    await outbox.commit(session)


async def active_announcements(session: AsyncSession, room_id: uuid.UUID) -> list[Announcement]:
    now = now_utc()
    targeted = select(announcement_rooms.c.announcement_id).where(announcement_rooms.c.room_id == room_id)
    any_target = select(announcement_rooms.c.announcement_id).where(
        announcement_rooms.c.announcement_id == Announcement.id)
    stmt = select(Announcement).where(
        Announcement.is_active.is_(True), Announcement.start_at <= now, Announcement.end_at > now,
        or_(Announcement.id.in_(targeted), ~any_target.exists()))
    items = list((await session.execute(stmt)).scalars())
    return sorted(items, key=lambda a: (PRIORITY_ORDER.get(a.priority, 9), a.start_at))


async def build_schedule(session: AsyncSession, room: MeetingRoom) -> DisplaySchedule:
    """Everything a TV needs in one payload. Privacy: descriptions/notes are never included and
    organizer/department are omitted when the room's display settings hide them."""
    now = now_utc()
    cfg = await system_settings.get_all(session)
    ds = await RoomRepository(session).display_settings(room.id)
    await session.commit()  # persists self-healed settings row, if created

    _, end_of_today = local_day_bounds(local_today(now))
    bookings = (await BookingRepository(session).active_for_rooms(
        [room.id], now, now + timedelta(days=8)))[room.id]
    st = compute_room_status(is_active=room.is_active, maintenance_mode=room.maintenance_mode,
                             operating_hours=room.operating_hours, bookings=bookings, now=now,
                             upcoming_threshold_minutes=cfg["availability.upcoming_threshold_minutes"])

    def to_display(b: Booking | None) -> DisplayBooking | None:
        if b is None:
            return None
        return DisplayBooking(
            id=b.id, title=b.title, start_at=b.start_at, end_at=b.end_at,
            organizer_name=b.organizer.full_name if ds.show_organizer else None,
            department_name=b.department.name if ds.show_department else None,
            status=effective_status(b.status, b.start_at, b.end_at, now))

    todays = [b for b in bookings if b.start_at < end_of_today]
    # "Upcoming" excludes the meeting in progress (shown in the status section).
    upcoming = [to_display(b) for b in todays if b is not st.current][: ds.upcoming_meetings_limit]
    anns = await active_announcements(session, room.id) if ds.show_announcements else []

    return DisplaySchedule(
        server_time=now, timezone=settings.timezone,
        upcoming_threshold_minutes=cfg["availability.upcoming_threshold_minutes"],
        room=DisplayRoom(name=room.name, code=room.code, location=room.location, capacity=room.capacity,
                         maintenance_mode=room.maintenance_mode, maintenance_message=room.maintenance_message),
        status=DisplayStatus(state=st.state, current=to_display(st.current), next=to_display(st.next),
                             next_available_at=st.next_available_at, free_until=st.free_until),
        upcoming=[u for u in upcoming if u is not None],
        announcements=[DisplayAnnouncement(id=a.id, title=a.title, message=a.message, priority=a.priority)
                       for a in anns],
        settings=DisplaySettingsOut.model_validate(ds),
        company=CompanyInfo(name=cfg["company.name"], logo_url=ds.logo_url or cfg["company.logo_url"]),
        qr_target_url=ds.qr_code_url or booking_page_url(room),
    )
