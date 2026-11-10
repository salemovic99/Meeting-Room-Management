from datetime import date, time

import pytest

from app.core.timeutils import combine_local, to_local
from app.schemas.bookings import Recurrence
from app.services.recurrence import MAX_OCCURRENCES, RecurrenceTooLong, expand

START = combine_local(date(2026, 11, 15), time(9))  # Sunday 09:00 Riyadh
END = combine_local(date(2026, 11, 15), time(10))


def test_daily_includes_start_and_end_dates():
    _, occ = expand(Recurrence(frequency="daily", end_date=date(2026, 11, 19)), START, END)
    assert len(occ) == 5
    assert all(to_local(s).time() == time(9) and (e - s).seconds == 3600 for s, e in occ)


def test_weekly_selected_weekdays():
    # Mon(0) and Wed(2) for two weeks
    rec = Recurrence(frequency="weekly", weekdays=[0, 2], end_date=date(2026, 11, 28))
    _, occ = expand(rec, START, END)
    assert [to_local(s).date().weekday() for s, _ in occ] == [0, 2, 0, 2]


def test_weekly_defaults_to_start_weekday_with_interval():
    _, occ = expand(Recurrence(frequency="weekly", interval=2, end_date=date(2026, 12, 31)), START, END)
    assert all(to_local(s).weekday() == 6 for s, _ in occ)
    assert (occ[1][0] - occ[0][0]).days == 14


def test_monthly_same_day():
    _, occ = expand(Recurrence(frequency="monthly", end_date=date(2027, 2, 28)), START, END)
    assert [to_local(s).day for s, _ in occ] == [15, 15, 15, 15]


def test_end_date_before_start_rejected():
    with pytest.raises(ValueError):
        expand(Recurrence(frequency="daily", end_date=date(2026, 11, 1)), START, END)


def test_too_many_occurrences():
    with pytest.raises(RecurrenceTooLong):
        expand(Recurrence(frequency="daily", end_date=date(2028, 1, 1)), START, END)
    assert MAX_OCCURRENCES == 366
