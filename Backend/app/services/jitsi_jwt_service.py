"""Generate JWT tokens for Jitsi / JaaS live interview sessions."""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path

import jwt

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _get_private_key() -> str | None:
    settings = get_settings()
    pk = (settings.jaas_private_key or "").strip()
    if not pk:
        return None
    if pk.startswith("-----BEGIN"):
        return pk
    candidate = Path(pk)
    if candidate.exists():
        try:
            return candidate.read_text(encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to read Jitsi private key file: %s", exc)
            return None
    return pk


def is_jaas_configured() -> bool:
    settings = get_settings()
    return bool(settings.jaas_app_id and settings.jaas_api_key_id and _get_private_key())


def get_jitsi_domain() -> str:
    return "8x8.vc" if is_jaas_configured() else "meet.jit.si"


def get_jitsi_room_name(base_room: str) -> str:
    settings = get_settings()
    if is_jaas_configured():
        return f"{settings.jaas_app_id}/{base_room}"
    return base_room


def generate_jitsi_jwt(
    room_name: str,
    user_name: str,
    user_email: str = "",
    is_moderator: bool = False,
) -> str | None:
    settings = get_settings()
    if not is_jaas_configured():
        return None
    private_key = _get_private_key()
    if not private_key:
        return None
    now = int(time.time())
    payload = {
        "aud": "jitsi",
        "iss": "chat",
        "sub": settings.jaas_app_id,
        "room": "*",
        "iat": now,
        "nbf": now,
        "exp": now + 3 * 3600,
        "context": {
            "user": {
                "id": str(uuid.uuid4()),
                "name": user_name,
                "email": user_email,
                "moderator": "true" if is_moderator else "false",
            },
            "features": {
                "livestreaming": "false",
                "recording": "false",
                "transcription": "false",
                "outbound-call": "false",
            },
        },
    }
    try:
        return jwt.encode(
            payload,
            private_key,
            algorithm="RS256",
            headers={
                "kid": settings.jaas_api_key_id,
                "typ": "JWT",
                "alg": "RS256",
            },
        )
    except Exception as exc:
        logger.warning("Failed to generate Jitsi JWT: %s", exc)
        return None
