from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.core.timeutils import combine_local
from app.services.schedule_rules import (
    BookingLimits,
    RoomRules,
    effective_status,
    operating_hours_between,
    overlaps,
    validate_slot,
    within_operating_hours,
)

HOURS = {d: {"open": "08:00", "close": "17:00"} for d in ("sun", "mon", "tue", "wed", "thu")} | {
    "fri": None, "sat": None}
LIMITS = BookingLimits(min_minutes=15, max_minutes=480, advance_days=90)
# 2026-11-15 is a Sunday.
SUNDAY = date(2026, 11, 15)
NOW = combine_local(SUNDAY, time(7, 0))


def at(h: int, m: int = 0, d: date = SUNDAY) -> datetime:
    return combine_local(d, time(h, m))


def room(**kw) -> RoomRules:
    return RoomRules(**({"is_active": True, "maintenance_mode": False, "capacity": 8,
                         "operating_hours": HOURS} | kw))


@pytest.mark.parametrize("a,b,expected", [
    ((9, 10), (10, 11), False),   # back-to-back is fine
    ((9, 10), (9, 10), True),
    ((9, 11), (10, 12), True),
    ((10, 11), (9, 12), True),    # contained
    ((9, 10), (11, 12), False),
])
def test_overlap_is_half_open(a, b, expected):
    assert overlaps(at(a[0]), at(a[1]), at(b[0]), at(b[1])) is expected


def test_valid_slot_has_no_problems():
    assert validate_slot(room(), at(9), at(10), 5, LIMITS, NOW, allow_capacity_override=False) == []


def codes(problems):
    return {p.code for p in problems}


def test_capacity_and_override():
    assert "capacity_exceeded" in codes(validate_slot(room(), at(9), at(10), 9, LIMITS, NOW,
                                                      allow_capacity_override=False))
    assert validate_slot(room(), at(9), at(10), 9, LIMITS, NOW, allow_capacity_override=True) == []


def test_inactive_and_maintenance_rooms_rejected():
    assert "room_inactive" in codes(validate_slot(room(is_active=False), at(9), at(10), 1, LIMITS, NOW,
                                                  allow_capacity_override=False))
    assert "room_maintenance" in codes(validate_slot(room(maintenance_mode=True), at(9), at(10), 1, LIMITS,
                                                     NOW, allow_capacity_override=False))


def test_duration_limits():
    assert "duration_too_short" in codes(validate_slot(room(), at(9), at(9, 10), 1, LIMITS, NOW,
                                                       allow_capacity_override=False))
    assert "duration_too_long" in codes(validate_slot(room(operating_hours=None), at(8), at(17), 1, LIMITS,
                                                      NOW, allow_capacity_override=False))


def test_past_and_advance_limits():
    later = NOW + timedelta(hours=5)
    assert "start_in_past" in codes(validate_slot(room(), at(9), at(10), 1, LIMITS, later,
                                                  allow_capacity_override=False))
    far = SUNDAY + timedelta(days=91)
    assert "too_far_in_advance" in codes(validate_slot(room(operating_hours=None), at(9, d=far),
                                                       at(10, d=far), 1, LIMITS, NOW,
                                                       allow_capacity_override=False))


def test_operating_hours():
    assert within_operating_hours(HOURS, at(8), at(17))
    assert not within_operating_hours(HOURS, at(7, 30), at(9))
    friday = SUNDAY + timedelta(days=5)
    assert not within_operating_hours(HOURS, at(9, d=friday), at(10, d=friday))
    assert within_operating_hours(None, at(2), at(3))


def test_operating_hours_between_counts_only_open_time():
    start = combine_local(SUNDAY, time(0))
    end = combine_local(SUNDAY + timedelta(days=7), time(0))
    assert operating_hours_between(HOURS, start, end) == pytest.approx(5 * 9)


def test_effective_status():
    s, e = at(9), at(10)
    assert effective_status("confirmed", s, e, at(8)) == "confirmed"
    assert effective_status("confirmed", s, e, at(9, 30)) == "in_progress"
    assert effective_status("in_progress", s, e, at(10)) == "completed"
    assert effective_status("cancelled", s, e, at(9, 30)) == "cancelled"


def test_local_times_are_riyadh():
    # 09:00 in Riyadh (UTC+3) is 06:00 UTC.
    assert at(9).astimezone(UTC).hour == 6
