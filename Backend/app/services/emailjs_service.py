from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import httpx

# Defensive env loading: in local dev EmailJS vars may live in Frontend/.env.
# In deployment, configure SendGrid (preferred) / SMTP / EmailJS via real environment variables.
try:
    from dotenv import load_dotenv

    _backend_root = Path(__file__).resolve().parents[2]
    load_dotenv(_backend_root / ".env", override=False)

    _frontend_env = _backend_root.parent / "Frontend" / ".env"
    load_dotenv(_frontend_env, override=False)
except Exception:
    pass


EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send"
SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send"


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


def get_sendgrid_config() -> dict[str, str]:
    """Resolve SendGrid config.

    Preferred variables:
    - SENDGRID_API_KEY
    - SENDGRID_FROM_EMAIL
    Optional:
    - SENDGRID_FROM_NAME
    - SENDGRID_REPLY_TO
    """

    api_key = _get_env("SENDGRID_API_KEY")
    from_email = _get_env("SENDGRID_FROM_EMAIL", "SMTP_FROM_EMAIL")
    from_name = _get_env("SENDGRID_FROM_NAME")
    reply_to = _get_env("SENDGRID_REPLY_TO")
    return {
        "api_key": api_key,
        "from_email": from_email,
        "from_name": from_name,
        "reply_to": reply_to,
    }


def _missing_sendgrid_env(cfg: dict[str, str]) -> list[str]:
    missing: list[str] = []
    if not cfg.get("api_key"):
        missing.append("SENDGRID_API_KEY")
    if not cfg.get("from_email"):
        missing.append("SENDGRID_FROM_EMAIL")
    return missing


def _missing_emailjs_env(cfg: dict[str, str]) -> list[str]:
    missing: list[str] = []
    if not cfg.get("public_key"):
        missing.append("EMAILJS_PUBLIC_KEY")
    if not cfg.get("service_id"):
        missing.append("EMAILJS_SERVICE_ID")
    if not cfg.get("template_id"):
        missing.append("EMAILJS_TEMPLATE_ID")
    return missing


def _smtp_config() -> dict[str, str]:
    sendgrid_api_key = _get_env("SENDGRID_API_KEY")
    host = _get_env("SMTP_HOST") or ("smtp.sendgrid.net" if sendgrid_api_key else "")
    port = _get_env("SMTP_PORT") or ("587" if sendgrid_api_key else "")

    # SendGrid SMTP expects user="apikey" and password=<SENDGRID_API_KEY>
    user = _get_env("SMTP_USER") or ("apikey" if sendgrid_api_key else "")
    password = _get_env("SMTP_PASSWORD") or sendgrid_api_key
    from_email = _get_env("SMTP_FROM_EMAIL", "SENDGRID_FROM_EMAIL")
    use_tls = _get_env("SMTP_USE_TLS") or ("true" if sendgrid_api_key else "")

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "use_tls": use_tls,
    }


def _parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str, default: int) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return default


def _send_email_smtp_blocking(*, to_email: str, to_name: str, message: str, subject: str) -> tuple[bool, int | None, str | None]:
    cfg = _smtp_config()
    if not (cfg["host"] and cfg["from_email"]):
        return False, None, "SMTP is not configured (missing SMTP_HOST/SMTP_FROM_EMAIL)."

    port = _parse_int(cfg["port"], 587)
    use_tls = _parse_bool(cfg["use_tls"])

    email = EmailMessage()
    email["From"] = cfg["from_email"]
    email["To"] = f"{to_name} <{to_email}>" if to_name else to_email
    email["Subject"] = subject
    email.set_content(message)

    try:
        with smtplib.SMTP(cfg["host"], port, timeout=20) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls()
                smtp.ehlo()
            if cfg["user"] and cfg["password"]:
                smtp.login(cfg["user"], cfg["password"])
            refused = smtp.send_message(email)
        if refused:
            return False, None, f"SMTP refused recipients: {list(refused.keys())}"
        return True, 250, None
    except Exception as e:
        return False, None, str(e) or "SMTP send failed"


async def _send_email_sendgrid_web(*, to_email: str, to_name: str, message: str, subject: str) -> tuple[bool, int | None, str | None]:
    cfg = get_sendgrid_config()
    if not (cfg.get("api_key") and cfg.get("from_email")):
        missing = _missing_sendgrid_env(cfg)
        missing_text = ", ".join(missing) if missing else "SENDGRID_API_KEY/SENDGRID_FROM_EMAIL"
        return False, None, f"SendGrid is not configured (missing {missing_text})."

    from_name = cfg.get("from_name") or "HireMind"
    payload: dict[str, Any] = {
        "personalizations": [
            {
                "to": [
                    {
                        "email": to_email,
                        **({"name": to_name} if to_name else {}),
                    }
                ]
            }
        ],
        "from": {"email": cfg["from_email"], "name": from_name},
        "subject": subject,
        "content": [{"type": "text/plain", "value": message}],
    }
    if cfg.get("reply_to"):
        payload["reply_to"] = {"email": cfg["reply_to"]}

    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(SENDGRID_SEND_URL, json=payload, headers=headers)
        if res.status_code in {200, 202}:
            return True, res.status_code, None
        # 4xx usually means misconfiguration; return as-is so it's visible.
        return False, res.status_code, (res.text or "SendGrid request failed").strip()
    except Exception as e:
        return False, None, str(e) or "SendGrid request failed"


async def send_email_via_emailjs(*, to_email: str, to_name: str, message: str, extra_params: dict[str, Any] | None = None) -> tuple[bool, int | None, str | None]:
    """Send a single email.

    Provider order:
    1) SendGrid Web API (if configured)
    2) SMTP (if configured)
    3) EmailJS REST API (fallback)

    Returns (ok, status_code, error_text).
    """

    subject = "HireMind Notification"

    # Primary: SendGrid Web API (simple config: SENDGRID_API_KEY + SENDGRID_FROM_EMAIL)
    sendgrid_cfg = get_sendgrid_config()
    if sendgrid_cfg.get("api_key") and sendgrid_cfg.get("from_email"):
        ok, status_code, error_text = await _send_email_sendgrid_web(
            to_email=to_email,
            to_name=to_name,
            message=message,
            subject=subject,
        )
        if ok:
            return True, status_code, None
        # If SendGrid is configured but returns a 4xx, it's likely a real config/validation error.
        # Don't silently fall back and hide it.
        if status_code is not None and 400 <= status_code < 500:
            return False, status_code, error_text or "SendGrid send failed"
        # Otherwise (timeouts/5xx), allow fallback to keep email flowing.

    # Secondary: SMTP (supports SendGrid SMTP or any SMTP provider)
    smtp_cfg = _smtp_config()
    if smtp_cfg.get("host") and smtp_cfg.get("from_email"):
        import asyncio

        ok, status_code, error_text = await asyncio.to_thread(
            _send_email_smtp_blocking,
            to_email=to_email,
            to_name=to_name,
            message=message,
            subject=subject,
        )
        if ok:
            return True, status_code, None
        # SMTP failure might be transient; allow EmailJS fallback if configured.

    # Fallback: EmailJS
    cfg = get_emailjs_config()
    if not (cfg["public_key"] and cfg["service_id"] and cfg["template_id"]):
        missing = _missing_emailjs_env(cfg)
        missing_text = ", ".join(missing) if missing else "service/template/public key"
        return (
            False,
            None,
            "Email is not configured. "
            "Set SendGrid (SENDGRID_API_KEY, SENDGRID_FROM_EMAIL) or SMTP (SMTP_HOST, SMTP_FROM_EMAIL) "
            f"or EmailJS (missing {missing_text})."
        )

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