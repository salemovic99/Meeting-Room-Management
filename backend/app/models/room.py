from sqlalchemy import Boolean, CheckConstraint, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamps, UUIDPk


class MeetingRoom(UUIDPk, Timestamps, Base):
    __tablename__ = "meeting_rooms"
    __table_args__ = (CheckConstraint("capacity > 0", name="ck_meeting_rooms_capacity_positive"),)

    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(32), unique=True)  # e.g. MR-001
    display_slug: Mapped[str] = mapped_column(String(64), unique=True)  # e.g. room-01 -> /display/room-01
    location: Mapped[str | None] = mapped_column(String(200))
    floor: Mapped[str | None] = mapped_column(String(50))
    capacity: Mapped[int] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    equipment: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # {"mon": {"open": "08:00", "close": "17:00"}, "fri": null, ...}; NULL column = open 24/7
    operating_hours: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    maintenance_message: Mapped[str | None] = mapped_column(Text)
