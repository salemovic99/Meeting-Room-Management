import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator

from app.models.booking import MeetingType
from app.schemas.common import ORMModel, Ref
from app.schemas.rooms import Availability, RoomOut

_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class OrganizerRef(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str | None


class BookingOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    room: Ref
    organizer_id: uuid.UUID
    organizer: OrganizerRef
    department_id: uuid.UUID
    department: Ref
    series_id: uuid.UUID | None
    is_series_exception: bool
    title: str
    description: str | None
    meeting_type: str
    start_at: datetime
    end_at: datetime
    attendee_count: int
    status: str
    effective_status: str
    source: str
    notes: str | None
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    cancelled_at: datetime | None
    cancellation_reason: str | None
    can_manage: bool
    redacted: bool


class BookingBase(BaseModel):
    room_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    meeting_type: MeetingType
    start_at: AwareDatetime
    end_at: AwareDatetime
    attendee_count: int = Field(gt=0, le=10000)
    organizer_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)
    override_capacity: bool = False

    @field_validator("title")
    @classmethod
    def validate_strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be blank")
        return v

    @model_validator(mode="after")
    def validate_order(self):
        if self.start_at >= self.end_at:
            raise ValueError("start_at must be earlier than end_at")
        return self


class BookingCreate(BookingBase):
    source: Literal["dashboard", "qr"] = "dashboard"


class BookingUpdate(BaseModel):
    room_id: uuid.UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    meeting_type: MeetingType | None = None
    start_at: AwareDatetime | None = None
    end_at: AwareDatetime | None = None
    attendee_count: int | None = Field(default=None, gt=0, le=10000)
    organizer_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)
    override_capacity: bool = False


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class Recurrence(BaseModel):
    frequency: Literal["daily", "weekly", "monthly"]
    interval: int = Field(default=1, ge=1, le=12)
    weekdays: list[int] | None = Field(default=None, description="0=Mon..6=Sun, weekly only")
    end_date: date

    @field_validator("weekdays")
    @classmethod
    def validate_wd(cls, v):
        if v is not None:
            if not v or any(d < 0 or d > 6 for d in v):
                raise ValueError("weekdays must be a non-empty list of 0..6")
            return sorted(set(v))
        return v


class RecurringBookingCreate(BookingBase):
    recurrence: Recurrence
    skip_conflicts: bool = False


class SeriesOut(ORMModel):
    id: uuid.UUID
    organizer_id: uuid.UUID
    recurrence_rule: str
    series_start_date: date
    series_end_date: date
    created_at: datetime
    updated_at: datetime


class SkippedOccurrence(BaseModel):
    start_at: datetime
    end_at: datetime
    reason: str


class RecurringResult(BaseModel):
    series: SeriesOut
    created: list[BookingOut]
    skipped: list[SkippedOccurrence]


class SeriesDetail(BaseModel):
    series: SeriesOut
    occurrences: list[BookingOut]


class SeriesUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    meeting_type: MeetingType | None = None
    attendee_count: int | None = Field(default=None, gt=0, le=10000)
    notes: str | None = None
    room_id: uuid.UUID | None = None
    start_time: str | None = Field(default=None, pattern=_HHMM)
    end_time: str | None = Field(default=None, pattern=_HHMM)
    override_capacity: bool = False


class SeriesCancelled(BaseModel):
    series: SeriesOut
    cancelled_count: int


class ConflictItem(BaseModel):
    id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime


class ConflictCheck(BaseModel):
    has_conflict: bool
    conflicts: list[ConflictItem]


class CalendarOut(BaseModel):
    items: list[BookingOut]


class TimeSlot(BaseModel):
    start_at: datetime
    end_at: datetime


class QuickBookOption(TimeSlot):
    minutes: int


class QuickBookInfo(BaseModel):
    """Everything the QR walk-up page needs in one request (phones on flaky Wi-Fi)."""
    server_time: datetime
    room: RoomOut
    availability: Availability
    can_book: bool
    # Why booking isn't possible: no_permission | inactive | maintenance | closed | None
    reason: str | None
    min_duration_minutes: int
    max_duration_minutes: int
    now_options: list[QuickBookOption]
    free_slots: list[TimeSlot]
    todays_bookings: list[BookingOut]
