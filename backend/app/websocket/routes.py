"""WebSocket endpoints. Auth is the first client message (never a query string):
    -> {"type": "auth", "token": "<jwt>"}      <- {"type": "auth.ok", "server_time": ...}
Clients send {"type": "ping"} every ~30s and may re-send "auth" with a fresh token at any time.
"""
import asyncio
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import load_display_device, load_principal
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.core.security import decode_token
from app.core.timeutils import now_utc
from app.models import DisplayDevice, MeetingRoom
from app.permissions.codes import P
from app.services import outbox
from app.services.displays import record_heartbeat
from app.websocket.hub import hub

log = logging.getLogger(__name__)
router = APIRouter()

AUTH_TIMEOUT = 10
IDLE_TIMEOUT = 90          # no message (ping) for this long -> drop
HEARTBEAT_WRITE_EVERY = 60  # throttle DB writes from pings


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


async def _first_auth(ws: WebSocket) -> str | None:
    try:
        msg = await asyncio.wait_for(ws.receive_json(), AUTH_TIMEOUT)
    except (TimeoutError, WebSocketDisconnect, ValueError):
        return None
    if not isinstance(msg, dict) or msg.get("type") != "auth" or not isinstance(msg.get("token"), str):
        return None
    return msg["token"]


def _token_exp(token: str, typ: str) -> float:
    return float(decode_token(token, typ)["exp"])


@router.websocket("/ws/display/{slug}")
async def display_socket(ws: WebSocket, slug: str):
    await ws.accept()
    token = await _first_auth(ws)
    if token is None:
        await ws.close(code=4401)
        return
    async with SessionLocal() as session:
        try:
            device = await load_display_device(session, token)
        except AppError:
            await ws.close(code=4401)
            return
        room = await session.get(MeetingRoom, device.room_id)
        if room is None or room.display_slug != slug:
            await ws.close(code=4403)
            return
        device_id, room_id = device.id, device.room_id
        await record_heartbeat(session, device, connected=True)

    exp = _token_exp(token, "display")
    hub.join(ws, f"room:{room_id}", f"device:{device_id}")
    hub.register_device(device_id, ws)
    await ws.send_json({"type": "auth.ok", "server_time": _now_iso()})
    last_write = now_utc()
    try:
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_json(), IDLE_TIMEOUT)
            except TimeoutError:
                await ws.close(code=4408)
                break
            if datetime.now(UTC).timestamp() >= exp and msg.get("type") != "auth":
                await ws.close(code=4401)  # client should reconnect with a fresh session token
                break
            if msg.get("type") == "auth" and isinstance(msg.get("token"), str):
                async with SessionLocal() as session:
                    try:
                        d = await load_display_device(session, msg["token"])
                        if d.id != device_id:
                            raise AppError("device mismatch")
                    except AppError:
                        await ws.close(code=4401)
                        break
                exp = _token_exp(msg["token"], "display")
                await ws.send_json({"type": "auth.ok", "server_time": _now_iso()})
            elif msg.get("type") == "ping":
                await ws.send_json({"type": "pong", "server_time": _now_iso()})
                if (now_utc() - last_write).total_seconds() >= HEARTBEAT_WRITE_EVERY:
                    last_write = now_utc()
                    async with SessionLocal() as session:
                        d = await session.get(DisplayDevice, device_id)
                        if d is None or not d.is_active:
                            await ws.close(code=4401)
                            break
                        await record_heartbeat(session, d)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.exception("display socket error")
    finally:
        hub.leave(ws)
        if not hub.is_device_connected(device_id):
            async with SessionLocal() as session:
                d = await session.get(DisplayDevice, device_id)
                if d is not None and d.is_active:
                    d.device_status = "offline"
                    outbox.enqueue(session, "display.device_status", "display_device", d.id,
                                   data={"device_id": str(d.id), "status": "offline"})
                    await outbox.commit(session)


@router.websocket("/ws/dashboard")
async def dashboard_socket(ws: WebSocket):
    await ws.accept()
    token = await _first_auth(ws)
    if token is None:
        await ws.close(code=4401)
        return
    async with SessionLocal() as session:
        try:
            principal, _ = await load_principal(session, token)
        except AppError:
            await ws.close(code=4401)
            return
    if not principal.has(P.ROOMS_READ):
        await ws.close(code=4403)
        return
    exp = _token_exp(token, "access")
    hub.join(ws, "dashboard")
    await ws.send_json({"type": "auth.ok", "server_time": _now_iso()})
    try:
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_json(), IDLE_TIMEOUT)
            except TimeoutError:
                await ws.close(code=4408)
                break
            if msg.get("type") == "auth" and isinstance(msg.get("token"), str):
                async with SessionLocal() as session:
                    try:
                        await load_principal(session, msg["token"])
                    except AppError:
                        await ws.close(code=4401)
                        break
                exp = _token_exp(msg["token"], "access")
                await ws.send_json({"type": "auth.ok", "server_time": _now_iso()})
            elif datetime.now(UTC).timestamp() >= exp:
                await ws.close(code=4401)
                break
            elif msg.get("type") == "ping":
                await ws.send_json({"type": "pong", "server_time": _now_iso()})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.exception("dashboard socket error")
    finally:
        hub.leave(ws)
