from __future__ import annotations

import os
from typing import Any

import httpx


EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send"


def _get_env(*names: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value and str(value).strip():
            return str(value).strip()
    return ""


def get_emailjs_config() -> dict[str, str]:
    """Resolve EmailJS config from either server-side or NEXT_PUBLIC env vars.

    This is intentionally permissive because local dev often keeps EmailJS vars in Frontend/.env.
    In production, set EMAILJS_* (preferred) in the backend environment.
    """

    public_key = _get_env("EMAILJS_PUBLIC_KEY", "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY")
    service_id = _get_env("EMAILJS_SERVICE_ID", "NEXT_PUBLIC_EMAILJS_SERVICE_ID")
    template_id = _get_env(
        "EMAILJS_ROUND1_TEMPLATE_ID",
        "EMAILJS_TEMPLATE_ID",
        "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
    )
    # EmailJS REST API strict mode requires a "Private Key" (access token).
    # Users often name it differently in env; accept common aliases.
    access_token = _get_env(
        "EMAILJS_ACCESS_TOKEN",
        "EMAILJS_PRIVATE_KEY",
        "EMAILJS_PRIVATE_TOKEN",
        "EMAILJS_API_KEY",
    )

    return {
        "public_key": public_key,
        "service_id": service_id,
        "template_id": template_id,
        "access_token": access_token,
    }


async def send_email_via_emailjs(*, to_email: str, to_name: str, message: str, extra_params: dict[str, Any] | None = None) -> tuple[bool, int | None, str | None]:
    """Send a single email via EmailJS REST API.

    Returns (ok, status_code, error_text).
    """

    cfg = get_emailjs_config()
    if not (cfg["public_key"] and cfg["service_id"] and cfg["template_id"]):
        return False, None, "EmailJS is not configured (missing service/template/public key)."

    template_params: dict[str, Any] = {
        # Common EmailJS template fields
        "to_email": to_email,
        "to_name": to_name,
        "from_name": "HireMind",
        "message": message,
    }
    if extra_params:
        template_params.update(extra_params)

    payload: dict[str, Any] = {
        "service_id": cfg["service_id"],
        "template_id": cfg["template_id"],
        # EmailJS REST uses `user_id` as the public key
        "user_id": cfg["public_key"],
        "template_params": template_params,
    }
    if cfg["access_token"]:
        payload["accessToken"] = cfg["access_token"]

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(EMAILJS_SEND_URL, json=payload)
        if res.status_code == 200:
            return True, res.status_code, None
        return False, res.status_code, (res.text or "EmailJS request failed").strip()
    except Exception as e:
        return False, None, str(e) or "EmailJS request failed"