import uuid

from fastapi import APIRouter, Header, Response, status

from app.api.deps import DB, CurrentDevice, CurrentUser, require
from app.core.config import settings
from app.core.errors import NotFound, Unauthorized
from app.permissions.codes import P
from app.repositories.rooms import RoomRepository
from app.schemas.display import (
    DeviceCredential,
    DeviceOut,
    DeviceRegister,
    DeviceUpdate,
    DisplayBootstrap,
    DisplaySchedule,
    DisplaySessionIn,
    DisplaySessionOut,
    HeartbeatIn,
)
from app.schemas.rooms import DisplaySettingsOut
from app.services import system_settings
from app.services.displays import (
    DeviceAdminService,
    assert_device_room,
    build_schedule,
    device_out,
    open_display_session,
    record_heartbeat,
)

router = APIRouter(prefix="/display", tags=["display"])


# ---- Admin: device management (registered before /{slug} routes so paths don't collide) --------

@router.get("/devices", response_model=list[DeviceOut])
async def list_devices(session: DB, current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return [device_out(d) for d in await DeviceAdminService(session, current.principal, current.ip).list()]


@router.post("/devices/register", response_model=DeviceCredential, status_code=201)
async def register_device(body: DeviceRegister, session: DB, current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return await DeviceAdminService(session, current.principal, current.ip).register(body.device_name, body.room_id)


@router.post("/devices/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(body: HeartbeatIn, device: CurrentDevice, session: DB):
    await record_heartbeat(session, device, body.browser_info)


@router.patch("/devices/{device_id}", response_model=DeviceOut)
async def update_device(device_id: uuid.UUID, body: DeviceUpdate, session: DB,
                        current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return device_out(await DeviceAdminService(session, current.principal, current.ip).update(device_id, body))


@router.post("/devices/{device_id}/rotate-token", response_model=DeviceCredential)
async def rotate_device_token(device_id: uuid.UUID, session: DB,
                              current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    return await DeviceAdminService(session, current.principal, current.ip).rotate(device_id)


@router.post("/devices/{device_id}/refresh", status_code=status.HTTP_202_ACCEPTED)
async def refresh_device(device_id: uuid.UUID, session: DB, current: CurrentUser = require(P.DISPLAYS_MANAGE)):
    await DeviceAdminService(session, current.principal, current.ip).refresh(device_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


# ---- TV client ----------------------------------------------------------------------------------

@router.post("/session", response_model=DisplaySessionOut)
async def display_session(body: DisplaySessionIn, session: DB,
                          authorization: str | None = Header(default=None)):
    """Exchange the long-lived device credential (sent in a header, never a URL) for a short-lived
    display JWT bound to the device's room."""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "device" or not token:
        raise Unauthorized("Device credentials required")
    jwt_token, device = await open_display_session(session, token.strip(), body.browser_info, body.firmware_info)
    return DisplaySessionOut(access_token=jwt_token, expires_in=settings.display_token_expire_minutes * 60,
                             room_slug=device.room.display_slug, device_id=device.id)


@router.get("/{slug}", response_model=DisplayBootstrap)
async def display_bootstrap(slug: str, session: DB):
    """Public: just enough to render the pairing screen. No schedule data."""
    room = await RoomRepository(session).by_slug(slug)
    if room is None:
        raise NotFound("Unknown display")
    cfg = await system_settings.get_all(session)
    return DisplayBootstrap(room_name=room.name, display_slug=room.display_slug, company_name=cfg["company.name"])


@router.get("/{slug}/schedule", response_model=DisplaySchedule)
async def display_schedule(slug: str, device: CurrentDevice, session: DB):
    room = await assert_device_room(session, device, slug)
    return await build_schedule(session, room)


@router.get("/{slug}/settings", response_model=DisplaySettingsOut)
async def display_settings(slug: str, device: CurrentDevice, session: DB):
    room = await assert_device_room(session, device, slug)
    ds = await RoomRepository(session).display_settings(room.id)
    await session.commit()
    return ds
