"""Transactional outbox helpers.

Usage in a service:
    outbox.enqueue(session, "booking.created", "booking", booking.id, room_ids=[booking.room_id], data={...})
    await commit(session)   # commits, then wakes the dispatcher

Events are never broadcast before the transaction commits: the dispatcher only reads committed rows.
"""
import asyncio
import uuid
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OutboxEvent

_wakeup = asyncio.Event()


def enqueue(
    session: AsyncSession,
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID | None,
    *,
    room_ids: list[uuid.UUID] | None = None,
    all_rooms: bool = False,
    device_ids: list[uuid.UUID] | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Routing: `room_ids` -> those rooms' displays; `all_rooms` -> every display;
    `device_ids` -> only those devices. Every event also goes to dashboard sockets."""
    payload = jsonable_encoder({
        "room_ids": [str(r) for r in dict.fromkeys(room_ids or [])],
        "all_rooms": all_rooms,
        "device_ids": [str(d) for d in device_ids or []],
        "data": data or {},
    })
    session.add(OutboxEvent(event_type=event_type, aggregate_type=aggregate_type,
                            aggregate_id=aggregate_id, payload=payload))


def wake_dispatcher() -> None:
    _wakeup.set()


async def wait_for_events(timeout: float) -> None:
    try:
        await asyncio.wait_for(_wakeup.wait(), timeout)
    except TimeoutError:
        pass
    _wakeup.clear()


async def commit(session: AsyncSession) -> None:
    await session.commit()
    wake_dispatcher()
