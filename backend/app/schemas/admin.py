import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.bookings import BookingOut
from app.schemas.common import UserRef
from app.schemas.rooms import Availability


class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    actor_user: UserRef | None
    actor_device_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class Overview(BaseModel):
    total_rooms: int
    available_rooms: int
    occupied_rooms: int
    upcoming_meetings: int
    todays_bookings: int
    cancelled_today: int
    booked_hours_today: float
    utilization_today_pct: float
    rooms: list[Availability]
    todays_schedule: list[BookingOut]
    recent_activity: list[AuditLogOut]
