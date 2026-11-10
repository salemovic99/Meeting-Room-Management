"""Time-driven transitions: confirmed -> in_progress -> completed, announcement start/expiry,
and outbox housekeeping. Emits booking.started / booking.ended so displays and dashboards refresh
exactly when a meeting begins or ends (TVs also recompute status locally every second)."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, or_, select, update

from app.core.database import SessionLocal
from app.core.timeutils import now_utc
from app.models import Announcement, Booking, BookingStatus, OutboxEvent
from app.services import outbox

log = logging.getLogger(__name__)
TICK_SECONDS = 20
OUTBOX_RETENTION = timedelta(days=7)


async def tick(last_run) -> None:
    now = now_utc()
    async with SessionLocal() as session:
        started = (await session.execute(
            update(Booking).where(Booking.status == BookingStatus.CONFIRMED.value, Booking.start_at <= now,
                                  Booking.end_at > now)
            .values(status=BookingStatus.IN_PROGRESS.value, updated_at=now)
            .returning(Booking.id, Booking.room_id))).all()
        ended = (await session.execute(
            update(Booking).where(Booking.status.in_([BookingStatus.CONFIRMED.value,
                                                      BookingStatus.IN_PROGRESS.value]),
                                  Booking.end_at <= now)
            .values(status=BookingStatus.COMPLETED.value, updated_at=now)
            .returning(Booking.id, Booking.room_id))).all()
        for event, rows in (("booking.started", started), ("booking.ended", ended)):
            for booking_id, room_id in rows:
                outbox.enqueue(session, event, "booking", booking_id, room_ids=[room_id],
                               data={"booking_id": str(booking_id), "room_id": str(room_id)})

        # Announcements that became active or expired since the last tick.
        changed = (await session.execute(select(Announcement).where(
            Announcement.is_active.is_(True),
            or_(Announcement.start_at.between(last_run, now), Announcement.end_at.between(last_run, now))
        ))).scalars().all()
        for a in changed:
            room_ids = [r.id for r in a.rooms]
            outbox.enqueue(session, "display.announcement_updated", "announcement", a.id, room_ids=room_ids,
                           all_rooms=not room_ids, data={"announcement_id": str(a.id)})

        await session.execute(delete(OutboxEvent).where(OutboxEvent.published_at < now - OUTBOX_RETENTION))
        await outbox.commit(session)
    return None


async def run_lifecycle(stop: asyncio.Event) -> None:
    log.info("booking lifecycle worker started")
    last_run = now_utc() - timedelta(seconds=TICK_SECONDS)
    while not stop.is_set():
        current = now_utc()
        try:
            await tick(last_run)
            last_run = current
        except Exception:  # noqa: BLE001
            log.exception("lifecycle tick failed")
        try:
            await asyncio.wait_for(stop.wait(), TICK_SECONDS)
        except TimeoutError:
            pass
