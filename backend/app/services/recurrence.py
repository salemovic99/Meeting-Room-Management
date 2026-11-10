"""Expands a recurrence spec into concrete occurrences (local wall-clock times -> UTC).

A series is stored as one booking_series row + one bookings row per occurrence (bounded by
MAX_OCCURRENCES), never as a single open-ended rule.
"""
from datetime import date, datetime, timedelta

from dateutil.rrule import DAILY, MONTHLY, WEEKLY, rrule

from app.core.timeutils import combine_local, to_local
from app.schemas.bookings import Recurrence

MAX_OCCURRENCES = 366
_FREQ = {"daily": DAILY, "weekly": WEEKLY, "monthly": MONTHLY}


class RecurrenceTooLong(ValueError):
    pass


def build_rule(rec: Recurrence, first_local: datetime) -> rrule:
    kwargs: dict = {"freq": _FREQ[rec.frequency], "interval": rec.interval, "dtstart": first_local,
                    "until": datetime.combine(rec.end_date, datetime.max.time())}
    if rec.frequency == "weekly":
        kwargs["byweekday"] = rec.weekdays if rec.weekdays else [first_local.weekday()]
    elif rec.frequency == "monthly":
        # Months without this day (e.g. the 31st) are skipped rather than shifted.
        kwargs["bymonthday"] = first_local.day
    return rrule(**kwargs)


def rule_string(rule: rrule) -> str:
    # str(rrule) is "DTSTART:...\nRRULE:FREQ=..." — keep only the RRULE line.
    return next((ln for ln in str(rule).splitlines() if ln.startswith("RRULE:")), str(rule))


def expand(rec: Recurrence, start_at: datetime, end_at: datetime) -> tuple[rrule, list[tuple[datetime, datetime]]]:
    """Returns (rule, [(start_utc, end_utc), ...]). Occurrences keep the same local wall-clock
    time on every date, so they stay correct across DST changes in other timezones."""
    local_start = to_local(start_at)
    if rec.end_date < local_start.date():
        raise ValueError("end_date must be on or after the first meeting date")
    duration = end_at - start_at
    naive_first = local_start.replace(tzinfo=None)
    rule = build_rule(rec, naive_first)
    out: list[tuple[datetime, datetime]] = []
    for occ in rule:
        if len(out) >= MAX_OCCURRENCES:
            raise RecurrenceTooLong(f"A series can have at most {MAX_OCCURRENCES} occurrences")
        s = combine_local(occ.date(), occ.time())
        out.append((s, s + duration))
    return rule, out


def occurrence_dates(occurrences: list[tuple[datetime, datetime]]) -> tuple[date, date]:
    return to_local(occurrences[0][0]).date(), to_local(occurrences[-1][0]).date()


def shift_to_times(start_at: datetime, new_start_local, new_end_local) -> tuple[datetime, datetime]:
    """Move an occurrence to new local times on the same local date (series edits)."""
    d = to_local(start_at).date()
    s = combine_local(d, new_start_local)
    e = combine_local(d, new_end_local)
    if e <= s:
        e += timedelta(days=1)
    return s, e
