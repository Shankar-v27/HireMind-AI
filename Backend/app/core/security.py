from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from jose import jwt

from app.core.config import get_settings


# bcrypt truncates at 72 bytes; we truncate explicitly to avoid surprises
BCRYPT_MAX_PASSWORD_BYTES = 72
settings = get_settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    payload = plain_password.encode("utf-8")[:BCRYPT_MAX_PASSWORD_BYTES]
    return bcrypt.checkpw(payload, hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    payload = password.encode("utf-8")[:BCRYPT_MAX_PASSWORD_BYTES]
    return bcrypt.hashpw(payload, bcrypt.gensalt()).decode("utf-8")


REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_access_token(subject: str | int, expires_delta_minutes: Optional[int] = None) -> str:
    if expires_delta_minutes is None:
        expires_delta_minutes = settings.access_token_expire_minutes

    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_delta_minutes)
    to_encode: dict[str, Any] = {"sub": str(subject), "exp": expire, "type": "access"}
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt


def create_refresh_token(subject: str | int, expires_days: int = REFRESH_TOKEN_EXPIRE_DAYS) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=expires_days)
    to_encode: dict[str, Any] = {"sub": str(subject), "exp": expire, "type": "refresh"}
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

