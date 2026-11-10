import uuid
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

SENSITIVE_KEYS = {"password", "password_hash", "device_token", "device_token_hash", "token_hash"}


def _clean(values: dict[str, Any] | None) -> dict[str, Any] | None:
    if values is None:
        return None
    return jsonable_encoder({k: v for k, v in values.items() if k not in SENSITIVE_KEYS})


def snapshot(obj: Any, fields: list[str]) -> dict[str, Any]:
    return {f: getattr(obj, f) for f in fields}


def diff(old: dict[str, Any], new: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    changed = [k for k in new if old.get(k) != new.get(k)]
    return {k: old.get(k) for k in changed}, {k: new.get(k) for k in changed}


def record(
    session: AsyncSession,
    *,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
    actor_device_id: uuid.UUID | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    """Adds an audit row to the current transaction (committed with the business change)."""
    session.add(AuditLog(
        action=action, entity_type=entity_type, entity_id=entity_id, actor_user_id=actor_user_id,
        actor_device_id=actor_device_id, old_values=_clean(old_values), new_values=_clean(new_values),
        ip_address=ip_address,
    ))
