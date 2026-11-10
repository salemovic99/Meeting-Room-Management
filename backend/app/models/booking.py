import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPk
from app.models.department import Department
from app.models.room import MeetingRoom
from app.models.user import User


class BookingStatus(enum.StrEnum):
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MeetingType(enum.StrEnum):
    INTERNAL = "internal"
    EXTERNAL = "external"
    MANAGEMENT = "management"
    INTERVIEW = "interview"
    TRAINING = "training"
    PROJECT = "project"
    OTHER = "other"


# Name of the PostgreSQL exclusion constraint that makes double-booking impossible.
# Defined in the Alembic migration (EXCLUDE USING gist ... WHERE status <> 'cancelled').
NO_OVERLAP_CONSTRAINT = "bookings_no_overlap"


class BookingSeries(UUIDPk, Timestamps, Base):
    __tablename__ = "booking_series"

    organizer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("meeting_rooms.id"))
    recurrence_rule: Mapped[str] = mapped_column(Text)  # RFC 5545 RRULE, evaluated in local tz
    series_start_date: Mapped[date] = mapped_column(Date)
    series_end_date: Mapped[date] = mapped_column(Date)


class Booking(UUIDPk, Timestamps, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_bookings_time_order"),
        CheckConstraint("attendee_count > 0", name="ck_bookings_attendees_positive"),
        CheckConstraint(
            "status IN ('confirmed','in_progress','completed','cancelled')", name="ck_bookings_status"
        ),
        CheckConstraint(
            "meeting_type IN ('internal','external','management','interview','training','project','other')",
            name="ck_bookings_meeting_type",
        ),
        CheckConstraint("source IN ('dashboard','qr')", name="ck_bookings_source"),
        Index("ix_bookings_room_time", "room_id", "start_at", "end_at"),
    )

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meeting_rooms.id"), index=True
    )
    organizer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), index=True
    )
    series_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("booking_series.id"), index=True
    )
    is_series_exception: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    meeting_type: Mapped[str] = mapped_column(String(32))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attendee_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default=BookingStatus.CONFIRMED.value, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    # Where the booking was made: "dashboard" or "qr" (walk-up via the TV's QR code).
    source: Mapped[str] = mapped_column(String(16), default="dashboard")

    room: Mapped[MeetingRoom] = relationship(lazy="selectin")
    organizer: Mapped[User] = relationship(foreign_keys=[organizer_id], lazy="selectin")
    department: Mapped[Department] = relationship(lazy="selectin")
