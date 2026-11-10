import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_token
from app.core.timeutils import now_utc
from app.models import DisplayDevice, RefreshSession, Role, User
from app.permissions.policy import Principal

DB = Annotated[AsyncSession, Depends(get_session)]

_bearer = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str | None:
    # Nginx sets X-Real-IP; the backend is only reachable through Nginx.
    return request.headers.get("x-real-ip") or (request.client.host if request.client else None)


async def load_principal(session: AsyncSession, token: str) -> tuple[Principal, User]:
    claims = decode_token(token, "access")
    try:
        user_id, session_id = uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])
    except (KeyError, ValueError) as e:
        raise Unauthorized("Invalid token") from e

    sess = await session.get(RefreshSession, session_id)
    if sess is None or sess.revoked_at is not None or sess.user_id != user_id or sess.expires_at <= now_utc():
        raise Unauthorized("Session has been revoked", code="session_revoked")

    user = (await session.execute(
        select(User).where(User.id == user_id).options(selectinload(User.roles).selectinload(Role.permissions))
    )).scalar_one_or_none()
    if user is None or not user.is_active:
        raise Unauthorized("Account is inactive", code="account_inactive")

    perms = frozenset(p.code for r in user.roles for p in r.permissions)
    principal = Principal(user_id=user.id, department_id=user.department_id, permissions=perms,
                          role_names=frozenset(r.name for r in user.roles), session_id=session_id)
    return principal, user


@dataclass
class CurrentUser:
    principal: Principal
    user: User
    ip: str | None


async def get_current(
    request: Request,
    session: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthorized("Not authenticated")
    principal, user = await load_principal(session, creds.credentials)
    return CurrentUser(principal=principal, user=user, ip=client_ip(request))


Current = Annotated[CurrentUser, Depends(get_current)]


def require(*codes: str):
    """Dependency: the caller must hold ANY of `codes`."""

    async def _dep(current: Current) -> CurrentUser:
        if not current.principal.has(*codes):
            raise Forbidden("You do not have permission to perform this action")
        return current

    return Depends(_dep)


# ---- Display devices ----------------------------------------------------------------------------

async def load_display_device(session: AsyncSession, token: str) -> DisplayDevice:
    claims = decode_token(token, "display")
    try:
        device_id = uuid.UUID(claims["sub"])
    except (KeyError, ValueError) as e:
        raise Unauthorized("Invalid token") from e
    device = await session.get(DisplayDevice, device_id)
    if (device is None or not device.is_active or device.token_version != claims.get("ver")
            or str(device.room_id) != claims.get("room")):
        raise Unauthorized("Display credentials revoked", code="device_revoked")
    return device


async def get_display_device(
    session: DB,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> DisplayDevice:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthorized("Not authenticated")
    return await load_display_device(session, creds.credentials)


CurrentDevice = Annotated[DisplayDevice, Depends(get_display_device)]
