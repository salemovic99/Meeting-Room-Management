"""QR "walk-up" booking: what can be booked in this room right now / later today.

Pure functions (no DB) so the slot maths is unit-testable. The booking itself still goes through
POST /bookings (BookingService + the bookings_no_overlap constraint), so nothing here can bypass
validation — these are suggestions only.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.timeutils import to_local
from app.services.schedule_rules import day_window

NOW_DURATIONS = (15, 30, 45, 60, 90, 120)  # minutes offered as one-tap "book now" chips
SLOT_STEP_MINUTES = 5                       # later-today slots start on 5-minute boundaries


@dataclass
class Slot:
    start_at: datetime
    end_at: datetime


@dataclass
class NowOption:
    minutes: int
    start_at: datetime
    end_at: datetime


def floor_minute(dt: datetime) -> datetime:
    return dt.replace(second=0, microsecond=0)


def ceil_step(dt: datetime, step: int = SLOT_STEP_MINUTES) -> datetime:
    base = floor_minute(dt)
    if base < dt:
        base += timedelta(minutes=1)
    extra = (-base.minute) % step
    return base + timedelta(minutes=extra)


def free_slots_today(operating_hours: dict | None, bookings: list, now: datetime, min_minutes: int) -> list[Slot]:
    """Gaps between non-cancelled bookings from `now` until today's closing time (local day)."""
    window = day_window(operating_hours, to_local(now).date())
    if window is None:
        return []
    open_at, close_at = window
    cursor = max(open_at, floor_minute(now))
    slots: list[Slot] = []
    for b in sorted(bookings, key=lambda x: x.start_at):
        if b.end_at <= cursor or b.start_at >= close_at:
            continue
        if b.start_at > cursor:
            slots.append(Slot(cursor, min(b.start_at, close_at)))
        cursor = max(cursor, b.end_at)
        if cursor >= close_at:
            break
    if cursor < close_at:
        slots.append(Slot(cursor, close_at))
    # The first slot may start "now"; later ones start where a meeting ends. Round non-current
    # starts up so suggestions look tidy, and drop gaps shorter than the minimum duration.
    out = []
    for s in slots:
        start = s.start_at if s.start_at <= now else ceil_step(s.start_at)
        if (s.end_at - start) >= timedelta(minutes=min_minutes):
            out.append(Slot(start, s.end_at))
    return out


def now_options(slots: list[Slot], now: datetime, min_minutes: int, max_minutes: int) -> list[NowOption]:
    """One-tap durations starting now, limited by the free slot that contains `now`."""
    start = floor_minute(now)
    current = next((s for s in slots if s.start_at <= start < s.end_at), None)
    if current is None:
        return []
    room_left = (current.end_at - start).total_seconds() / 60
    opts = [NowOption(m, start, start + timedelta(minutes=m))
            for m in NOW_DURATIONS if min_minutes <= m <= max_minutes and m <= room_left]
    # Offer "until the next meeting" when it doesn't match a preset chip.
    until = int(room_left)
    if min_minutes <= until <= max_minutes and until not in NOW_DURATIONS and until < 240:
        opts.append(NowOption(until, start, current.end_at))
    return sorted(opts, key=lambda o: o.minutes)
