import uuid
from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.schemas.common import UserRef
from app.schemas.rooms import DisplaySettingsOut


class DeviceRoomRef(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    display_slug: str


class DeviceOut(BaseModel):
    id: uuid.UUID
    device_name: str
    room_id: uuid.UUID
    room: DeviceRoomRef
    status: Literal["online", "offline", "unknown", "disabled"]
    is_active: bool
    last_heartbeat_at: datetime | None
    last_connected_at: datetime | None
    browser_info: str | None
    firmware_info: str | None
    display_url: str
    created_at: datetime
    updated_at: datetime


class DeviceRegister(BaseModel):
    device_name: str = Field(min_length=1, max_length=200)
    room_id: uuid.UUID


class DeviceUpdate(BaseModel):
    device_name: str | None = Field(default=None, min_length=1, max_length=200)
    room_id: uuid.UUID | None = None
    is_active: bool | None = None


class DeviceCredential(BaseModel):
    device: DeviceOut
    device_token: str
    pairing_url: str


class DisplayBootstrap(BaseModel):
    room_name: str
    display_slug: str
    company_name: str


class DisplaySessionIn(BaseModel):
    browser_info: str | None = Field(default=None, max_length=1000)
    firmware_info: str | None = Field(default=None, max_length=500)


class DisplaySessionOut(BaseModel):
    access_token: str
    expires_in: int
    room_slug: str
    device_id: uuid.UUID


class HeartbeatIn(BaseModel):
    browser_info: str | None = Field(default=None, max_length=1000)


class DisplayBooking(BaseModel):
    id: uuid.UUID
    title: str
    organizer_name: str | None
    department_name: str | None
    start_at: datetime
    end_at: datetime
    status: str


class DisplayRoom(BaseModel):
    name: str
    code: str
    location: str | None
    capacity: int
    maintenance_mode: bool
    maintenance_message: str | None


class DisplayStatus(BaseModel):
    state: str
    current: DisplayBooking | None
    next: DisplayBooking | None
    next_available_at: datetime | None
    free_until: datetime | None


class DisplayAnnouncement(BaseModel):
    id: uuid.UUID
    title: str
    message: str
    priority: str


class CompanyInfo(BaseModel):
    name: str
    logo_url: str | None


class DisplaySchedule(BaseModel):
    server_time: datetime
    timezone: str
    upcoming_threshold_minutes: int
    room: DisplayRoom
    status: DisplayStatus
    upcoming: list[DisplayBooking]
    announcements: list[DisplayAnnouncement]
    settings: DisplaySettingsOut
    company: CompanyInfo
    qr_target_url: str  # settings.qr_code_url if set, else this room's walk-up booking page


# ---- Announcements ---------------------------------------------------------------------------

Priority = Literal["low", "normal", "high", "critical"]


class AnnouncementOut(BaseModel):
    id: uuid.UUID
    title: str
    message: str
    priority: str
    start_at: datetime
    end_at: datetime
    is_active: bool
    room_ids: list[uuid.UUID]
    state: Literal["scheduled", "active", "expired", "inactive"]
    created_by: UserRef | None
    created_at: datetime
    updated_at: datetime


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=2000)
    priority: Priority = "normal"
    start_at: AwareDatetime
    end_at: AwareDatetime
    is_active: bool = True
    room_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_order(self):
        if self.start_at >= self.end_at:
            raise ValueError("start_at must be earlier than end_at")
        return self


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    message: str | None = Field(default=None, min_length=1, max_length=2000)
    priority: Priority | None = None
    start_at: AwareDatetime | None = None
    end_at: AwareDatetime | None = None
    is_active: bool | None = None
    room_ids: list[uuid.UUID] | None = None
