from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, Current, client_ip
from app.core.config import settings
from app.models import Role, User
from app.schemas.users import ChangePasswordIn, LoginIn, Me, TokenResponse, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "mrm_refresh"
COOKIE_PATH = "/api/v1/auth"


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(COOKIE, token, max_age=settings.refresh_token_expire_days * 86400, httponly=True,
                        secure=settings.cookie_secure, samesite="strict", path=COOKIE_PATH)


async def me_for(session, user_id) -> Me:
    user = (await session.execute(select(User).where(User.id == user_id).execution_options(
        populate_existing=True).options(selectinload(User.roles).selectinload(Role.permissions)))).scalar_one()
    perms = sorted({p.code for r in user.roles for p in r.permissions})
    return Me(**UserOut.model_validate(user).model_dump(), permissions=perms)


async def _token_response(session, issued, response: Response) -> TokenResponse:
    _set_cookie(response, issued.refresh_token)
    return TokenResponse(access_token=issued.access_token, expires_in=settings.access_token_expire_minutes * 60,
                         user=await me_for(session, issued.user.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginIn, request: Request, response: Response, session: DB):
    issued = await auth_service.login(session, body.email, body.password, client_ip(request),
                                      request.headers.get("user-agent"))
    return await _token_response(session, issued, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, session: DB):
    issued = await auth_service.refresh(session, request.cookies.get(COOKIE))
    return await _token_response(session, issued, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, session: DB):
    await auth_service.logout(session, request.cookies.get(COOKIE), ip=client_ip(request))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE, path=COOKIE_PATH)
    return response


@router.get("/me", response_model=Me)
async def me(current: Current, session: DB):
    return await me_for(session, current.user.id)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordIn, current: Current, session: DB):
    await auth_service.change_password(session, current.user, body.current_password, body.new_password,
                                       current.ip, keep_session_id=current.principal.session_id)
