from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationFailed
from app.models import SystemSetting


def _int_range(lo: int, hi: int):
    def check(v: Any) -> int:
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
            raise ValueError(f"must be an integer between {lo} and {hi}")
        return v
    return check


def _str_or_none(max_len: int):
    def check(v: Any) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str) or len(v) > max_len:
            raise ValueError(f"must be a string up to {max_len} characters")
        return v
    return check


def _str(max_len: int):
    inner = _str_or_none(max_len)

    def check(v: Any) -> str:
        if v is None or not str(v).strip():
            raise ValueError("must not be empty")
        return inner(v)  # type: ignore[return-value]
    return check


DEFAULTS: dict[str, Any] = {
    "company.name": "Company",
    "company.logo_url": None,
    "booking.min_duration_minutes": 15,
    "booking.max_duration_minutes": 480,
    "booking.advance_days": 90,
    "availability.upcoming_threshold_minutes": 15,
}

VALIDATORS = {
    "company.name": _str(200),
    "company.logo_url": _str_or_none(2000),
    "booking.min_duration_minutes": _int_range(5, 1440),
    "booking.max_duration_minutes": _int_range(5, 1440),
    "booking.advance_days": _int_range(1, 730),
    "availability.upcoming_threshold_minutes": _int_range(0, 240),
}


async def get_all(session: AsyncSession) -> dict[str, Any]:
    rows = (await session.execute(select(SystemSetting))).scalars().all()
    values = dict(DEFAULTS)
    values.update({r.key: r.value for r in rows if r.key in DEFAULTS})
    return values


async def update(session: AsyncSession, changes: dict[str, Any]) -> tuple[dict, dict]:
    """Validates and stages changes; returns (old, new) of changed keys. Caller commits."""
    errors = []
    clean: dict[str, Any] = {}
    for key, value in changes.items():
        if key not in VALIDATORS:
            errors.append({"loc": [key], "msg": "unknown setting"})
            continue
        try:
            clean[key] = VALIDATORS[key](value)
        except ValueError as e:
            errors.append({"loc": [key], "msg": str(e)})
    current = await get_all(session)
    merged = {**current, **clean}
    if merged["booking.min_duration_minutes"] > merged["booking.max_duration_minutes"]:
        errors.append({"loc": ["booking.min_duration_minutes"], "msg": "must not exceed max duration"})
    if errors:
        raise ValidationFailed("Invalid settings", details={"fields": errors})

    existing = {r.key: r for r in (await session.execute(
        select(SystemSetting).where(SystemSetting.key.in_(list(clean))))).scalars()}
    for key, value in clean.items():
        if key in existing:
            existing[key].value = value
        else:
            session.add(SystemSetting(key=key, value=value))
    old = {k: current[k] for k in clean if current[k] != clean[k]}
    new = {k: clean[k] for k in old}
    return old, new
