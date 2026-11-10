from dataclasses import dataclass
from datetime import date, datetime, time

from app.core.timeutils import combine_local
from app.services.quick_book import free_slots_today, now_options

D = date(2026, 11, 15)  # Sunday
HOURS = {d: {"open": "08:00", "close": "17:00"} for d in ("sun", "mon", "tue", "wed", "thu")} | {
    "fri": None, "sat": None}


def at(h, m=0, s=0):
    return combine_local(D, time(h, m, s))


@dataclass
class B:
    start_at: datetime
    end_at: datetime


def test_free_slots_between_meetings_until_close():
    slots = free_slots_today(HOURS, [B(at(10), at(11)), B(at(13), at(14))], at(9, 2, 30), 15)
    assert [(s.start_at, s.end_at) for s in slots] == [
        (at(9, 2), at(10)), (at(11), at(13)), (at(14), at(17))]


def test_slots_skip_short_gaps_and_round_starts():
    slots = free_slots_today(HOURS, [B(at(9), at(10, 2)), B(at(10, 10), at(11))], at(8, 50), 15)
    # 08:50-09:00 (10m) dropped; 10:02-10:10 dropped; then 11:00-17:00
    assert [(s.start_at, s.end_at) for s in slots] == [(at(11), at(17))]


def test_closed_day_has_no_slots():
    friday = combine_local(date(2026, 11, 20), time(10))
    assert free_slots_today(HOURS, [], friday, 15) == []


def test_now_options_limited_by_next_meeting():
    now = at(9, 0, 40)
    slots = free_slots_today(HOURS, [B(at(9, 40), at(10))], now, 15)
    opts = now_options(slots, now, 15, 480)
    assert [o.minutes for o in opts] == [15, 30, 40]   # 40 = "until the next meeting"
    assert opts[0].start_at == at(9)


def test_no_now_options_while_occupied():
    now = at(10, 30)
    slots = free_slots_today(HOURS, [B(at(10), at(11))], now, 15)
    assert now_options(slots, now, 15, 480) == []
