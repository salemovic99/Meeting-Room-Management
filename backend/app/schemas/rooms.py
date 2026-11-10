import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.timeutils import WEEKDAY_KEYS
from app.schemas.common import ORMModel

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def validate_operating_hours(v: dict | None) -> dict | None:
    if v is None:
        return None
    out: dict[str, dict | None] = {}
    for key in WEEKDAY_KEYS:
        day = v.get(key)
        if day is None:
            out[key] = None
            continue
        o, c = day.get("open"), day.get("close")
        if not (isinstance(o, str) and isinstance(c, str) and _HHMM.match(o) and _HHMM.match(c)):
            raise ValueError(f"operating_hours.{key} must be {{open:'HH:MM', close:'HH:MM'}} or null")
        if o >= c:
            raise ValueError(f"operating_hours.{key}: open must be before close")
        out[key] = {"open": o, "close": c}
    unknown = set(v) - set(WEEKDAY_KEYS)
    if unknown:
        raise ValueError(f"unknown operating_hours keys: {sorted(unknown)}")
    return out


class RoomOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    display_slug: str
    location: str | None
    floor: str | None
    capacity: int
    description: str | None
    equipment: list[str]
    operating_hours: dict | None
    is_active: bool
    maintenance_mode: bool
    maintenance_message: str | None
    display_url: str = ""
    created_at: datetime
    updated_at: datetime


class RoomUpdated(RoomOut):
    affected_future_bookings: int = 0


_SLUG = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    display_slug: str = Field(min_length=1, max_length=64, pattern=_SLUG)
    location: str | None = None
    floor: str | None = None
    capacity: int = Field(gt=0, le=10000)
    description: str | None = None
    equipment: list[str] = Field(default_factory=list)
    operating_hours: dict | None = None

    @field_validator("operating_hours")
    @classmethod
    def validate_oh(cls, v):
        return validate_operating_hours(v)


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    display_slug: str | None = Field(default=None, min_length=1, max_length=64, pattern=_SLUG)
    location: str | None = None
    floor: str | None = None
    capacity: int | None = Field(default=None, gt=0, le=10000)
    description: str | None = None
    equipment: list[str] | None = None
    operating_hours: dict | None = None
    is_active: bool | None = None
    maintenance_mode: bool | None = None
    maintenance_message: str | None = None

    @field_validator("operating_hours")
    @classmethod
    def validate_oh(cls, v):
        return validate_operating_hours(v)


class BookingBrief(BaseModel):
    id: uuid.UUID
    title: str
    organizer_name: str | None
    department_name: str | None
    start_at: datetime
    end_at: datetime


RoomState = Literal["available", "upcoming", "occupied", "maintenance", "unavailable"]


class Availability(BaseModel):
    room_id: uuid.UUID
    room_name: str
    room_code: str
    capacity: int
    location: str | None
    status: RoomState
    current_booking: BookingBrief | None
    next_booking: BookingBrief | None
    next_available_at: datetime | None
    free_until: datetime | None
    server_time: datetime


_COLOR = r"^#[0-9A-Fa-f]{6}$"


class DisplaySettingsOut(ORMModel):
    room_id: uuid.UUID
    display_mode: str
    theme: str
    primary_color: str
    secondary_color: str
    background_color: str
    logo_url: str | None
    show_clock: bool
    show_date: bool
    show_organizer: bool
    show_department: bool
    show_announcements: bool
    show_qr_code: bool
    qr_code_url: str | None
    upcoming_meetings_limit: int
    refresh_interval_seconds: int
    idle_behavior: str
    language: str
    announcement_text: str | None
    updated_at: datetime


class DisplaySettingsUpdate(BaseModel):
    display_mode: Literal["full_schedule", "current_meeting", "availability", "announcement",
                          "maintenance"] | None = None
    theme: Literal["light", "dark"] | None = None
    primary_color: str | None = Field(default=None, pattern=_COLOR)
    secondary_color: str | None = Field(default=None, pattern=_COLOR)
    background_color: str | None = Field(default=None, pattern=_COLOR)
    logo_url: str | None = Field(default=None, max_length=2000)
    show_clock: bool | None = None
    show_date: bool | None = None
    show_organizer: bool | None = None
    show_department: bool | None = None
    show_announcements: bool | None = None
    show_qr_code: bool | None = None
    qr_code_url: str | None = Field(default=None, max_length=2000)
    upcoming_meetings_limit: int | None = Field(default=None, ge=0, le=20)
    refresh_interval_seconds: int | None = Field(default=None, ge=15, le=3600)
    idle_behavior: Literal["show_availability", "show_announcement", "dim"] | None = None
    language: Literal["en", "ar"] | None = None
    announcement_text: str | None = Field(default=None, max_length=2000)
