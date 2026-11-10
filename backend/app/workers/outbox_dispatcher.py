"""Publishes committed outbox rows to WebSocket clients.

Woken immediately after each commit (outbox.wake_dispatcher) and also polls as a safety net, so
events survive transient failures and backend restarts. TVs additionally refetch on reconnect, so a
missed event can delay but never corrupt what a display shows.
"""
import asyncio
import logging

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.timeutils import now_utc
from app.models import OutboxEvent
from app.services import outbox
from app.websocket.hub import hub

log = logging.getLogger(__name__)
POLL_SECONDS = 2.0
BATCH = 100
MAX_RETRIES = 10


async def dispatch_once() -> int:
    async with SessionLocal() as session:
        rows = list((await session.execute(
            select(OutboxEvent).where(OutboxEvent.published_at.is_(None), OutboxEvent.retry_count < MAX_RETRIES)
            .order_by(OutboxEvent.created_at).limit(BATCH).with_for_update(skip_locked=True))).scalars())
        for ev in rows:
            try:
                await hub.publish(ev.event_type, ev.payload)
                ev.published_at = now_utc()
            except Exception as e:  # noqa: BLE001
                ev.retry_count += 1
                ev.last_error = str(e)[:1000]
                log.warning("outbox publish failed for %s: %s", ev.id, e)
        await session.commit()
        return len(rows)


async def run_dispatcher(stop: asyncio.Event) -> None:
    log.info("outbox dispatcher started")
    while not stop.is_set():
        try:
            while await dispatch_once() == BATCH:
                pass
        except Exception:  # noqa: BLE001
            log.exception("outbox dispatcher iteration failed")
        await outbox.wait_for_events(POLL_SECONDS)
