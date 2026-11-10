import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import DB, CurrentUser, require
from app.core.timeutils import ensure_aware_utc, local_range_bounds, local_today, now_utc
from app.permissions.codes import P
from app.repositories.bookings import BookingRepository
from app.repositories.rooms import RoomRepository
from app.core.errors import NotFound
from app.schemas.bookings import BookingOut, QuickBookInfo
from app.schemas.rooms import (
    Availability,
    DisplaySettingsOut,
    DisplaySettingsUpdate,
    RoomCreate,
    RoomOut,
    RoomUpdate,
    RoomUpdated,
)
from app.services.rooms import RoomService, availability_for, quick_book_info
from app.services.serializers import booking_out, room_out

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomOut])
async def list_rooms(session: DB, current: CurrentUser = require(P.ROOMS_READ), include_inactive: bool = False):
    return [room_out(r) for r in await RoomRepository(session).list(include_inactive)]


@router.post("", response_model=RoomOut, status_code=201)
async def create_room(body: RoomCreate, session: DB, current: CurrentUser = require(P.ROOMS_MANAGE)):
    return room_out(await RoomService(session, current.principal, current.ip).create(body))


@router.get("/availability", response_model=list[Availability])
async def all_availability(session: DB, current: CurrentUser = require(P.ROOMS_READ)):
    rooms = await RoomRepository(session).list()
    return await availability_for(session, rooms, current.principal)


@router.get("/by-slug/{slug}/quick-book", response_model=QuickBookInfo)
async def quick_book(slug: str, session: DB, current: CurrentUser = require(P.ROOMS_READ)):
    """Data for the QR walk-up booking page (/book/{slug}). Booking itself uses POST /bookings
    with source="qr", so all normal validation and conflict protection apply."""
    room = await RoomRepository(session).by_slug(slug)
    if room is None:
        raise NotFound("Room not found")
    return await quick_book_info(session, current.principal, room)


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(room_id: uuid.UUID, session: DB, current: CurrentUser = require(P.ROOMS_READ)):
    return room_out(await RoomService(session, current.principal, current.ip).get(room_id))


@router.patch("/{room_id}", response_model=RoomUpdated)
async def update_room(room_id: uuid.UUID, body: RoomUpdate, session: DB,
                      current: CurrentUser = require(P.ROOMS_MANAGE)):
    room, affected = await RoomService(session, current.principal, current.ip).update(room_id, body)
    return RoomUpdated(**room_out(room).model_dump(), affected_future_bookings=affected)


@router.get("/{room_id}/availability", response_model=Availability)
async def room_availability(room_id: uuid.UUID, session: DB, current: CurrentUser = require(P.ROOMS_READ)):
    room = await RoomService(session, current.principal, current.ip).get(room_id)
    return (await availability_for(session, [room], current.principal))[0]


@router.get("/{room_id}/bookings", response_model=list[BookingOut])
async def room_bookings(room_id: uuid.UUID, session: DB, current: CurrentUser = require(P.ROOMS_READ),
                        from_: datetime | None = Query(None, alias="from"), to: datetime | None = None):
    await RoomService(session, current.principal, current.ip).get(room_id)
    if from_ is None or to is None:
        from_, to = local_range_bounds(local_today(), local_today())
    items = await BookingRepository(session).calendar(ensure_aware_utc(from_), ensure_aware_utc(to),
                                                      room_id, None, False)
    now = now_utc()
    return [booking_out(b, current.principal, now) for b in items]


@router.get("/{room_id}/display-settings", response_model=DisplaySettingsOut)
async def get_display_settings(room_id: uuid.UUID, session: DB, current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return await RoomService(session, current.principal, current.ip).get_display_settings(room_id)


@router.put("/{room_id}/display-settings", response_model=DisplaySettingsOut)
async def put_display_settings(room_id: uuid.UUID, body: DisplaySettingsUpdate, session: DB,
                               current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return await RoomService(session, current.principal, current.ip).update_display_settings(room_id, body)
