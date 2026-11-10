import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import settings
from app.core.errors import Unauthorized

_hasher = PasswordHasher()  # Argon2id with library defaults

# Used to equalise timing when the email doesn't exist.
_DUMMY_HASH = _hasher.hash("timing-equaliser-not-a-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# ---- JWT --------------------------------------------------------------------------------------

def _encode(claims: dict[str, Any], minutes: int) -> str:
    now = datetime.now(UTC)
    payload = {**claims, "iat": now, "exp": now + timedelta(minutes=minutes), "jti": uuid.uuid4().hex}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    return _encode({"sub": str(user_id), "sid": str(session_id), "typ": "access"},
                   settings.access_token_expire_minutes)


def create_display_token(device_id: uuid.UUID, room_id: uuid.UUID, token_version: int) -> str:
    return _encode(
        {"sub": str(device_id), "room": str(room_id), "ver": token_version, "typ": "display"},
        settings.display_token_expire_minutes,
    )


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm],
                            options={"require": ["exp", "iat", "sub", "typ"]})
    except jwt.ExpiredSignatureError as e:
        raise Unauthorized("Token expired", code="token_expired") from e
    except jwt.PyJWTError as e:
        raise Unauthorized("Invalid token") from e
    if claims.get("typ") != expected_type:
        raise Unauthorized("Invalid token type")
    return claims


# ---- Opaque tokens ----------------------------------------------------------------------------

def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_device_token(device_id: uuid.UUID) -> str:
    """Device token format: <device-id-hex>.<random secret>. Only an HMAC of it is stored."""
    return f"{device_id.hex}.{secrets.token_urlsafe(32)}"


def hash_device_token(token: str) -> str:
    return hmac.new(settings.device_token_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def device_id_from_token(token: str) -> uuid.UUID | None:
    head, _, secret = token.partition(".")
    if not secret:
        return None
    try:
        return uuid.UUID(hex=head)
    except ValueError:
        return None


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
