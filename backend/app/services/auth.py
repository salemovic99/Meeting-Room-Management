from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import RateLimited, Unauthorized, ValidationFailed
from app.core.rate_limit import login_limiter
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.core.timeutils import now_utc
from app.models import RefreshSession, User
from app.repositories.users import UserRepository
from app.services import audit


class IssuedTokens:
    def __init__(self, access_token: str, refresh_token: str, user: User):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.user = user


async def login(session: AsyncSession, email: str, password: str, ip: str | None,
                user_agent: str | None) -> IssuedTokens:
    email = email.lower()
    if login_limiter.is_blocked(ip, email):
        audit.record(session, action="auth.login_blocked", entity_type="user", ip_address=ip,
                     new_values={"email": email})
        await session.commit()
        raise RateLimited("Too many failed login attempts. Try again later.")

    user = await UserRepository(session).by_email(email)
    ok = verify_password(password, user.password_hash if user else None)
    if not ok or user is None or not user.is_active:
        login_limiter.record_failure(ip, email)
        audit.record(session, action="auth.login_failed", entity_type="user",
                     entity_id=user.id if user else None, ip_address=ip,
                     new_values={"email": email, "reason": "inactive" if ok and user else "bad_credentials"})
        await session.commit()
        raise Unauthorized("Invalid email or password", code="invalid_credentials")

    login_limiter.reset(ip, email)
    if user.password_hash and password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    refresh = new_refresh_token()
    sess = RefreshSession(user_id=user.id, token_hash=hash_refresh_token(refresh),
                          expires_at=now_utc() + timedelta(days=settings.refresh_token_expire_days),
                          ip_address=ip, user_agent=(user_agent or "")[:500])
    session.add(sess)
    await session.flush()
    audit.record(session, action="auth.login", entity_type="user", entity_id=user.id,
                 actor_user_id=user.id, ip_address=ip)
    await session.commit()
    return IssuedTokens(create_access_token(user.id, sess.id), refresh, user)


async def refresh(session: AsyncSession, refresh_token: str | None) -> IssuedTokens:
    if not refresh_token:
        raise Unauthorized("No refresh token")
    sess = (await session.execute(
        select(RefreshSession).where(RefreshSession.token_hash == hash_refresh_token(refresh_token))
        .with_for_update())).scalar_one_or_none()
    now = now_utc()
    if sess is None or sess.revoked_at is not None or sess.expires_at <= now:
        raise Unauthorized("Session expired", code="session_expired")
    user = await UserRepository(session).get(sess.user_id)
    if user is None or not user.is_active:
        sess.revoked_at = now
        await session.commit()
        raise Unauthorized("Account is inactive", code="account_inactive")

    new_token = new_refresh_token()  # rotate in place
    sess.token_hash = hash_refresh_token(new_token)
    sess.last_used_at = now
    await session.commit()
    return IssuedTokens(create_access_token(user.id, sess.id), new_token, user)


async def logout(session: AsyncSession, refresh_token: str | None, user_id=None, ip=None) -> None:
    if refresh_token:
        await session.execute(
            update(RefreshSession).where(RefreshSession.token_hash == hash_refresh_token(refresh_token),
                                         RefreshSession.revoked_at.is_(None))
            .values(revoked_at=now_utc()))
    if user_id:
        audit.record(session, action="auth.logout", entity_type="user", entity_id=user_id,
                     actor_user_id=user_id, ip_address=ip)
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, user_id) -> None:
    await session.execute(update(RefreshSession).where(RefreshSession.user_id == user_id,
                                                       RefreshSession.revoked_at.is_(None))
                          .values(revoked_at=now_utc()))


async def change_password(session: AsyncSession, user: User, current: str, new: str, ip: str | None,
                          keep_session_id=None) -> None:
    if not verify_password(current, user.password_hash):
        raise ValidationFailed("Current password is incorrect", code="invalid_password")
    if current == new:
        raise ValidationFailed("New password must differ from the current one", code="password_unchanged")
    user.password_hash = hash_password(new)
    # Sign out every other session.
    await session.execute(update(RefreshSession).where(
        RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None),
        RefreshSession.id != keep_session_id).values(revoked_at=now_utc()))
    audit.record(session, action="auth.password_changed", entity_type="user", entity_id=user.id,
                 actor_user_id=user.id, ip_address=ip)
    await session.commit()
