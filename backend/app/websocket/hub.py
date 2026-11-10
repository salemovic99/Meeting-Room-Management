"""In-process WebSocket fan-out.

Channels: "room:<room_id>" (TV displays), "device:<device_id>" (one TV), "dashboard" (staff UIs).
The backend runs as ONE process, so this in-memory registry is the whole picture. Scaling to
several processes would require a shared bus (e.g. PostgreSQL LISTEN/NOTIFY) — see CLAUDE.md.
"""
import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)
SEND_TIMEOUT = 5.0


class Hub:
    def __init__(self) -> None:
        self._channels: dict[str, set[WebSocket]] = defaultdict(set)
        self._device_sockets: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)
        self._room_channels: set[str] = set()

    def join(self, ws: WebSocket, *channels: str) -> None:
        for c in channels:
            self._channels[c].add(ws)
            if c.startswith("room:"):
                self._room_channels.add(c)

    def leave(self, ws: WebSocket) -> None:
        for members in self._channels.values():
            members.discard(ws)
        for socks in self._device_sockets.values():
            socks.discard(ws)

    def register_device(self, device_id: uuid.UUID, ws: WebSocket) -> None:
        self._device_sockets[device_id].add(ws)

    def is_device_connected(self, device_id: uuid.UUID) -> bool:
        return bool(self._device_sockets.get(device_id))

    async def disconnect_device(self, device_id: uuid.UUID, code: int = 4401) -> None:
        for ws in list(self._device_sockets.get(device_id, ())):
            try:
                await ws.close(code=code)
            except Exception:  # noqa: BLE001 - socket may already be gone
                pass
            self.leave(ws)

    async def _send(self, ws: WebSocket, message: dict[str, Any]) -> None:
        try:
            await asyncio.wait_for(ws.send_json(message), SEND_TIMEOUT)
        except Exception:  # noqa: BLE001
            log.info("Dropping unresponsive websocket")
            self.leave(ws)

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        targets: set[WebSocket] = set(self._channels.get("dashboard", ()))
        device_ids = payload.get("device_ids") or []
        if device_ids:
            for d in device_ids:
                targets |= self._channels.get(f"device:{d}", set())
        elif payload.get("all_rooms"):
            for c in self._room_channels:
                targets |= self._channels.get(c, set())
        else:
            for r in payload.get("room_ids") or []:
                targets |= self._channels.get(f"room:{r}", set())
        room_ids = payload.get("room_ids") or []
        message = {"type": event_type, "room_id": room_ids[0] if len(room_ids) == 1 else None,
                   "room_ids": room_ids, "data": payload.get("data", {}),
                   "ts": datetime.now(UTC).isoformat()}
        if targets:
            await asyncio.gather(*(self._send(ws, message) for ws in targets))


hub = Hub()
