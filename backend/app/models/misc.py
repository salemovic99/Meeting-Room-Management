"""Announcements, audit log, system settings, outbox."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPk, utcnow
from app.models.room import MeetingRoom
from app.models.user import User

announcement_rooms = Table(
    "announcement_rooms",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column("announcement_id", UUID(as_uuid=True), ForeignKey("announcements.id", ondelete="CASCADE"),
           nullable=False, index=True),
    Column("room_id", UUID(as_uuid=True), ForeignKey("meeting_rooms.id", ondelete="CASCADE"),
           nullable=False, index=True),
    UniqueConstraint("announcement_id", "room_id", name="uq_announcement_rooms_pair"),
)


class Announcement(UUIDPk, Timestamps, Base):
    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    creator: Mapped[User | None] = relationship(foreign_keys=[created_by], lazy="selectin")
    # Empty list == all rooms.
    rooms: Mapped[list[MeetingRoom]] = relationship(secondary=announcement_rooms, lazy="selectin")


class AuditLog(UUIDPk, Base):
    """Append-only: a DB trigger rejects UPDATE/DELETE (see migration 0001)."""

    __tablename__ = "audit_logs"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    actor_device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("display_devices.id")
    )
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    old_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    new_values: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    actor_user: Mapped[User | None] = relationship(foreign_keys=[actor_user_id], lazy="selectin")


class SystemSetting(UUIDPk, Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), unique=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OutboxEvent(UUIDPk, Base):
    """Transactional outbox. Rows are written in the same transaction as the business change and
    published to WebSocket clients by app.workers.outbox_dispatcher only after commit."""

    __tablename__ = "outbox_events"

    event_type: Mapped[str] = mapped_column(String(64))
    aggregate_type: Mapped[str] = mapped_column(String(64))
    aggregate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
