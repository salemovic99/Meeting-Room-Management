"""Model -> response conversion, including privacy redaction."""
from datetime import datetime

from app.core.config import settings
from app.models import Booking, DisplayDevice, MeetingRoom
from app.permissions.policy import Principal, can_manage_booking, can_view_booking_details
from app.schemas.bookings import BookingOut, ConflictItem, OrganizerRef
from app.schemas.common import Ref
from app.schemas.rooms import BookingBrief, RoomOut
from app.services.schedule_rules import effective_status

REDACTED_TITLE = "Reserved"


def display_url(room: MeetingRoom) -> str:
    return f"{settings.app_url.rstrip('/')}/display/{room.display_slug}"


def booking_page_url(room: MeetingRoom) -> str:
    """Walk-up booking page encoded in the TV's QR code. Contains no secret: users sign in."""
    return f"{settings.app_url.rstrip('/')}/book/{room.display_slug}"


def room_out(room: MeetingRoom) -> RoomOut:
    out = RoomOut.model_validate(room)
    out.display_url = display_url(room)
    return out


def booking_out(b: Booking, p: Principal, now: datetime) -> BookingOut:
    visible = can_view_booking_details(p, b)
    return BookingOut(
        id=b.id, room_id=b.room_id, room=Ref(id=b.room.id, name=b.room.name, code=b.room.code),
        organizer_id=b.organizer_id,
        organizer=OrganizerRef(id=b.organizer.id, full_name=b.organizer.full_name,
                               email=b.organizer.email if visible else None),
        department_id=b.department_id,
        department=Ref(id=b.department.id, name=b.department.name, code=b.department.code),
        series_id=b.series_id, is_series_exception=b.is_series_exception,
        title=b.title if visible else REDACTED_TITLE,
        description=b.description if visible else None,
        meeting_type=b.meeting_type, start_at=b.start_at, end_at=b.end_at,
        attendee_count=b.attendee_count, status=b.status,
        effective_status=effective_status(b.status, b.start_at, b.end_at, now), source=b.source,
        notes=b.notes if visible else None, created_by_id=b.created_by_id,
        created_at=b.created_at, updated_at=b.updated_at, cancelled_at=b.cancelled_at,
        cancellation_reason=b.cancellation_reason if visible else None,
        can_manage=can_manage_booking(p, b), redacted=not visible,
    )


def booking_brief(b: Booking | None, p: Principal | None) -> BookingBrief | None:
    """p=None means public context (e.g. availability for everyone with rooms.read)."""
    if b is None:
        return None
    visible = p is not None and can_view_booking_details(p, b)
    return BookingBrief(
        id=b.id, title=b.title if visible else REDACTED_TITLE,
        organizer_name=b.organizer.full_name if visible else None,
        department_name=b.department.name if visible else None,
        start_at=b.start_at, end_at=b.end_at,
    )


def conflict_item(b: Booking, p: Principal) -> ConflictItem:
    return ConflictItem(id=b.id, title=b.title if can_view_booking_details(p, b) else REDACTED_TITLE,
                        start_at=b.start_at, end_at=b.end_at)


def device_status(device: DisplayDevice, connected: bool, now: datetime) -> str:
    if not device.is_active:
        return "disabled"
    if connected:
        return "online"
    if device.last_heartbeat_at is None:
        return "unknown"
    return "online" if (now - device.last_heartbeat_at).total_seconds() < 90 else "offline"
