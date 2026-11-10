"""Room status is derived from the clock + bookings — never stored."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Generic, Protocol, TypeVar

from app.core.timeutils import to_local
from app.services.schedule_rules import day_window, is_open_at, next_opening


class _B(Protocol):
    start_at: datetime
    end_at: datetime


B = TypeVar("B", bound=_B)


@dataclass
class RoomStatus(Generic[B]):
    state: str  # available | upcoming | occupied | maintenance | unavailable
    current: B | None
    next: B | None
    next_available_at: datetime | None
    free_until: datetime | None


def compute_room_status(
    *,
    is_active: bool,
    maintenance_mode: bool,
    operating_hours: dict | None,
    bookings: list[B],
    now: datetime,
    upcoming_threshold_minutes: int,
) -> RoomStatus[B]:
    """`bookings` must be non-cancelled bookings ending after `now`, sorted by start_at."""
    active = sorted((b for b in bookings if b.end_at > now), key=lambda b: b.start_at)
    current = next((b for b in active if b.start_at <= now < b.end_at), None)
    upcoming = next((b for b in active if b.start_at > now), None)

    if not is_active:
        return RoomStatus("unavailable", None, upcoming, None, None)
    if maintenance_mode:
        return RoomStatus("maintenance", current, upcoming, None, None)

    if current is not None:
        # Walk back-to-back meetings to find when the room actually frees up.
        free_at = current.end_at
        for b in active:
            if b.start_at > free_at:
                break
            free_at = max(free_at, b.end_at)
        return RoomStatus("occupied", current, upcoming, free_at, None)

    if not is_open_at(operating_hours, now):
        return RoomStatus("unavailable", None, upcoming, next_opening(operating_hours, now), None)

    window = day_window(operating_hours, to_local(now).date())
    closing = window[1] if window else None
    free_until = min(filter(None, [upcoming.start_at if upcoming else None, closing]), default=None)

    if upcoming is not None and upcoming.start_at - now <= timedelta(minutes=upcoming_threshold_minutes):
        return RoomStatus("upcoming", None, upcoming, now, free_until)
    return RoomStatus("available", None, upcoming, now, free_until)
