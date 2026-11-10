import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPk, utcnow
from app.models.room import MeetingRoom


class DisplayDevice(UUIDPk, Timestamps, Base):
    __tablename__ = "display_devices"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meeting_rooms.id"), index=True
    )
    device_name: Mapped[str] = mapped_column(String(200))
    device_token_hash: Mapped[str] = mapped_column(String(128))
    # Bumped on rotation/disable; embedded in display JWTs so old sessions die immediately.
    token_version: Mapped[int] = mapped_column(Integer, default=1)
    device_status: Mapped[str] = mapped_column(String(16), default="unknown")  # last observed
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    browser_info: Mapped[str | None] = mapped_column(Text)
    firmware_info: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    room: Mapped[MeetingRoom] = relationship(lazy="selectin")


class DisplaySettings(UUIDPk, Base):
    __tablename__ = "display_settings"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meeting_rooms.id", ondelete="CASCADE"), unique=True
    )
    display_mode: Mapped[str] = mapped_column(String(32), default="full_schedule")
    theme: Mapped[str] = mapped_column(String(16), default="dark")
    primary_color: Mapped[str] = mapped_column(String(16), default="#00594F")
    secondary_color: Mapped[str] = mapped_column(String(16), default="#BB9D5A")
    background_color: Mapped[str] = mapped_column(String(16), default="#0B1F1C")
    logo_url: Mapped[str | None] = mapped_column(Text)
    show_clock: Mapped[bool] = mapped_column(Boolean, default=True)
    show_date: Mapped[bool] = mapped_column(Boolean, default=True)
    show_organizer: Mapped[bool] = mapped_column(Boolean, default=True)
    show_department: Mapped[bool] = mapped_column(Boolean, default=True)
    show_announcements: Mapped[bool] = mapped_column(Boolean, default=True)
    show_qr_code: Mapped[bool] = mapped_column(Boolean, default=False)
    qr_code_url: Mapped[str | None] = mapped_column(Text)
    upcoming_meetings_limit: Mapped[int] = mapped_column(Integer, default=5)
    refresh_interval_seconds: Mapped[int] = mapped_column(Integer, default=60)
    idle_behavior: Mapped[str] = mapped_column(String(32), default="show_availability")
    language: Mapped[str] = mapped_column(String(8), default="en")
    announcement_text: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
