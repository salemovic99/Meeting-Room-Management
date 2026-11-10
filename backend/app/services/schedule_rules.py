"""Pure booking/scheduling rules (no DB access) — the booking domain service's core logic.

The DB exclusion constraint `bookings_no_overlap` is the final guarantee against double-booking;
these checks exist to give users precise errors before hitting it.
"""
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Protocol

from app.core.timeutils import WEEKDAY_KEYS, combine_local, parse_hhmm, to_local
from app.models.booking import BookingStatus

START_GRACE = timedelta(minutes=5)  # allow "book now" requests that arrive a little late


class Interval(Protocol):
    start_at: datetime
    end_at: datetime


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Half-open [start, end) intervals: back-to-back meetings do not conflict."""
    return a_start < b_end and a_end > b_start


def find_overlapping(items: Iterable[Interval], start: datetime, end: datetime) -> list:
    return [b for b in items if overlaps(b.start_at, b.end_at, start, end)]


def effective_status(stored: str, start: datetime, end: datetime, now: datetime) -> str:
    if stored == BookingStatus.CANCELLED:
        return BookingStatus.CANCELLED.value
    if now >= end:
        return BookingStatus.COMPLETED.value
    if start <= now:
        return BookingStatus.IN_PROGRESS.value
    return BookingStatus.CONFIRMED.value


# ---- Operating hours ----------------------------------------------------------------------------

def day_window(operating_hours: dict | None, d: date) -> tuple[datetime, datetime] | None:
    """UTC [open, close) window for local date `d`; None when closed. 24h when hours unset."""
    if operating_hours is None:
        return combine_local(d, time(0)), combine_local(d + timedelta(days=1), time(0))
    day = operating_hours.get(WEEKDAY_KEYS[d.weekday()])
    if not day:
        return None
    return combine_local(d, parse_hhmm(day["open"])), combine_local(d, parse_hhmm(day["close"]))


def within_operating_hours(operating_hours: dict | None, start: datetime, end: datetime) -> bool:
    if operating_hours is None:
        return True
    window = day_window(operating_hours, to_local(start).date())
    return window is not None and window[0] <= start and end <= window[1]


def is_open_at(operating_hours: dict | None, at: datetime) -> bool:
    window = day_window(operating_hours, to_local(at).date())
    return window is not None and window[0] <= at < window[1]


def next_opening(operating_hours: dict | None, after: datetime) -> datetime | None:
    if is_open_at(operating_hours, after):
        return after
    d = to_local(after).date()
    for i in range(0, 8):
        w = day_window(operating_hours, d + timedelta(days=i))
        if w and w[0] >= after:
            return w[0]
    return None


def operating_hours_between(operating_hours: dict | None, start: datetime, end: datetime) -> float:
    """Total open hours within [start, end) — the utilization denominator."""
    total = 0.0
    d = to_local(start).date()
    last = to_local(end).date()
    while d <= last:
        w = day_window(operating_hours, d)
        if w:
            s, e = max(w[0], start), min(w[1], end)
            if e > s:
                total += (e - s).total_seconds() / 3600
        d += timedelta(days=1)
    return total


# ---- Slot validation ----------------------------------------------------------------------------

@dataclass
class RoomRules:
    is_active: bool
    maintenance_mode: bool
    capacity: int
    operating_hours: dict | None


@dataclass
class BookingLimits:
    min_minutes: int
    max_minutes: int
    advance_days: int


@dataclass
class SlotProblem:
    code: str
    message: str
    field: str | None = None


def validate_slot(
    room: RoomRules,
    start: datetime,
    end: datetime,
    attendees: int,
    limits: BookingLimits,
    now: datetime,
    *,
    allow_capacity_override: bool,
    check_start_in_past: bool = True,
) -> list[SlotProblem]:
    problems: list[SlotProblem] = []
    if start >= end:
        problems.append(SlotProblem("invalid_time_range", "Start time must be earlier than end time",
                                    "end_at"))
        return problems
    if not room.is_active:
        problems.append(SlotProblem("room_inactive", "This room is not available for booking", "room_id"))
    if room.maintenance_mode:
        problems.append(SlotProblem("room_maintenance", "This room is under maintenance", "room_id"))
    minutes = (end - start).total_seconds() / 60
    if minutes < limits.min_minutes:
        problems.append(SlotProblem("duration_too_short",
                                    f"Meetings must be at least {limits.min_minutes} minutes", "end_at"))
    if minutes > limits.max_minutes:
        problems.append(SlotProblem("duration_too_long",
                                    f"Meetings cannot exceed {limits.max_minutes} minutes", "end_at"))
    if check_start_in_past and start < now - START_GRACE:
        problems.append(SlotProblem("start_in_past", "Meetings cannot start in the past", "start_at"))
    if start > now + timedelta(days=limits.advance_days):
        problems.append(SlotProblem("too_far_in_advance",
                                    f"Bookings can be made at most {limits.advance_days} days ahead",
                                    "start_at"))
    if not within_operating_hours(room.operating_hours, start, end):
        problems.append(SlotProblem("outside_operating_hours",
                                    "The meeting is outside the room's operating hours", "start_at"))
    if attendees > room.capacity and not allow_capacity_override:
        problems.append(SlotProblem("capacity_exceeded",
                                    f"Attendee count exceeds room capacity ({room.capacity})",
                                    "attendee_count"))
    return problems
