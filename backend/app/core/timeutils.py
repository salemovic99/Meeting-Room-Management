"""Timezone helpers. Everything is stored in UTC; business rules (operating hours, "today",
recurrence) are evaluated in the configured local timezone (Asia/Riyadh)."""
from datetime import UTC, date, datetime, time, timedelta

from app.core.config import settings

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]  # index == date.weekday()


def now_utc() -> datetime:
    return datetime.now(UTC)


def to_local(dt: datetime) -> datetime:
    return dt.astimezone(settings.tz)


def local_today(now: datetime | None = None) -> date:
    return to_local(now or now_utc()).date()


def combine_local(d: date, t: time) -> datetime:
    """Local wall-clock date+time -> aware UTC datetime."""
    return datetime.combine(d, t, tzinfo=settings.tz).astimezone(UTC)


def local_day_bounds(d: date) -> tuple[datetime, datetime]:
    return combine_local(d, time(0)), combine_local(d + timedelta(days=1), time(0))


def local_range_bounds(start: date, end_inclusive: date) -> tuple[datetime, datetime]:
    return combine_local(start, time(0)), combine_local(end_inclusive + timedelta(days=1), time(0))


def parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("datetime must include a timezone offset")
    return dt.astimezone(UTC)
