from dataclasses import dataclass
from datetime import date, datetime, time

from app.core.timeutils import combine_local
from app.services.availability import compute_room_status

D = date(2026, 11, 15)  # Sunday
HOURS = {d: {"open": "08:00", "close": "17:00"} for d in ("sun", "mon", "tue", "wed", "thu")} | {
    "fri": None, "sat": None}


def at(h, m=0):
    return combine_local(D, time(h, m))


@dataclass
class B:
    start_at: datetime
    end_at: datetime


def status(bookings, now, **kw):
    return compute_room_status(**({"is_active": True, "maintenance_mode": False, "operating_hours": HOURS,
                                   "bookings": bookings, "now": now, "upcoming_threshold_minutes": 15} | kw))


def test_available_with_free_until_next_meeting():
    st = status([B(at(11), at(12))], at(9))
    assert st.state == "available"
    assert st.free_until == at(11)
    assert st.next.start_at == at(11)


def test_upcoming_within_threshold():
    assert status([B(at(9, 10), at(10))], at(9)).state == "upcoming"


def test_occupied_and_back_to_back_next_available():
    st = status([B(at(9), at(10)), B(at(10), at(11)), B(at(13), at(14))], at(9, 30))
    assert st.state == "occupied"
    assert st.current.start_at == at(9)
    assert st.next_available_at == at(11)


def test_maintenance_overrides_bookings():
    assert status([B(at(9), at(10))], at(9, 30), maintenance_mode=True).state == "maintenance"


def test_outside_operating_hours_is_unavailable():
    st = status([], at(18))
    assert st.state == "unavailable"
    assert st.next_available_at == combine_local(date(2026, 11, 16), time(8))


def test_inactive_room():
    assert status([], at(9), is_active=False).state == "unavailable"
