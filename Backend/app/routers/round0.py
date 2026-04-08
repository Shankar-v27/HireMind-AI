from __future__ import annotations

import base64
import csv
import smtplib
import hashlib
import io
import os
import re
import ssl
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.core import (
    Round0CallReport,
    Round0Candidate,
    Round0EvalCache,
    Round0Evaluation,
    Round0Job,
)
from app.models.user import User
from app.routers.auth import get_current_company
from app.routers.company import get_company_for_user


router = APIRouter(tags=["round0"])

_round0_upload_dir = Path(__file__).resolve().parents[2] / "uploads" / "round0_resumes"
_round0_upload_dir.mkdir(parents=True, exist_ok=True)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _to_float(v: Any, fallback: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return fallback


def _to_list(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    out = []
    for item in v:
        s = str(item).strip()
        if s:
            out.append(s)
    return out


def _extract_phone(text: str) -> str | None:
    matches = re.findall(r"(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}", text)
    for raw in matches:
        digits = re.sub(r"\D", "", raw)
        if 10 <= len(digits) <= 13:
            return raw.strip()
    return None


def _extract_email(text: str) -> str | None:
    matches = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text or "")
    for raw in matches:
        email = raw.strip().strip(".,;:()[]{}<>\"'")
        if email:
            return email
    return None


def _normalize_indian_phone(raw: str | None) -> str | None:
    s = str(raw or "").strip()
    if not s:
        return None

    digits = re.sub(r"\D", "", s)
    if len(digits) == 10:
        normalized = f"+91{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        normalized = f"+91{digits[1:]}"
    elif len(digits) == 12 and digits.startswith("91"):
        normalized = f"+{digits}"
    else:
        return None

    if not re.match(r"^\+91[6-9]\d{9}$", normalized):
        return None
    return normalized


def _normalize_email(raw: str | None) -> str | None:
    email = str(raw or "").strip().strip(".,;:()[]{}<>\"'")
    if not email or "@" not in email:
        return None
    if not re.match(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", email):
        return None
    return email.lower()


def _extract_name(text: str, fallback: str | None = None) -> str | None:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()][:20]
    for ln in lines:
        low = ln.lower()
        if "resume" in low or "curriculum" in low:
            continue
        if "@" in ln or re.search(r"\d", ln):
            continue
        if 2 <= len(ln.split()) <= 5 and re.match(r"^[a-zA-Z. ]+$", ln):
            return ln
    return fallback


def _parse_availability(summary: str) -> str | None:
    availability_match = re.search(r"(\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b)", summary or "")
    return availability_match.group(1) if availability_match else None


def _stringify_reason(reason: Any) -> str:
    if isinstance(reason, str):
        return reason
    try:
        import json

        return json.dumps(reason, ensure_ascii=True)
    except Exception:
        return str(reason)


def _resolve_vapi_phone_source(client: httpx.Client, vapi_key: str, assistant_id: str) -> tuple[str | None, str | None]:
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID", "").strip() or os.getenv("PHONE_NUMBER_ID", "").strip()
    phone_number = os.getenv("VAPI_PHONE_NUMBER", "").strip() or os.getenv("PHONE_NUMBER", "").strip()
    if phone_number_id or phone_number:
        return phone_number_id or None, phone_number or None

    try:
        resp = client.get(
            f"{os.getenv('VAPI_BASE_URL', 'https://api.vapi.ai')}/phone-number",
            headers={"Authorization": f"Bearer {vapi_key}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        rows = resp.json()
        if not isinstance(rows, list):
            return None, None

        active_rows = [r for r in rows if isinstance(r, dict) and str(r.get("status", "")).lower() == "active"]
        preferred = next((r for r in active_rows if str(r.get("assistantId", "")) == assistant_id), None)
        selected = preferred or (active_rows[0] if active_rows else None)
        if not selected:
            return None, None

        selected_id = str(selected.get("id") or "").strip() or None
        selected_number = str(selected.get("number") or "").strip() or None
        return selected_id, selected_number
    except Exception as e:
        print(f"[Vapi] Failed to resolve phone source from /phone-number: {e}")
        return None, None


def _call_vapi(phone_number: str, candidate_name: str, role_name: str) -> dict[str, Any]:
    vapi_key = os.getenv("VAPI_API_KEY", "")
    assistant_id = os.getenv("ASSISTANT_ID", "") or os.getenv("VAPI_ASSISTANT_ID", "")
    if not vapi_key or not assistant_id:
        raise HTTPException(status_code=500, detail="Vapi credentials missing")

    normalized_phone = _normalize_indian_phone(phone_number)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail=f"Invalid phone number: {phone_number or 'missing'}")

    with httpx.Client(timeout=30.0) as client:
        source_phone_id, source_phone = _resolve_vapi_phone_source(client, vapi_key, assistant_id)
        if not source_phone_id and not source_phone:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Vapi outbound source number missing. Set VAPI_PHONE_NUMBER_ID or VAPI_PHONE_NUMBER in Backend/.env"
                ),
            )

        payload: dict[str, Any] = {
            "assistantId": assistant_id,
            "customer": {"number": normalized_phone},
            "metadata": {
                "name": candidate_name or "Candidate",
                "role": role_name or "",
            },
        }
        if source_phone_id:
            payload["phoneNumberId"] = source_phone_id
        elif source_phone:
            payload["phoneNumber"] = source_phone

        try:
            resp = client.post(
                f"{os.getenv('VAPI_BASE_URL', 'https://api.vapi.ai')}/call",
                headers={"Authorization": f"Bearer {vapi_key}", "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raw = e.response.text
            try:
                detail_payload = e.response.json()
            except Exception:
                detail_payload = {"raw": raw}

            print(
                f"[Vapi] Call failed for '{candidate_name or 'Candidate'}' ({normalized_phone}). "
                f"status={e.response.status_code}, response={detail_payload}"
            )
            raise HTTPException(
                status_code=e.response.status_code,
                detail={
                    "candidate": candidate_name or "Candidate",
                    "phone": normalized_phone,
                    "vapi_error": detail_payload,
                },
            )
        except Exception as e:
            print(f"[Vapi] Unexpected call error for '{candidate_name or 'Candidate'}': {e}")
            raise


def _send_round1_email(
    candidate_name: str,
    candidate_email: str,
    role_name: str,
    company_name: str,
    shortlist_reason: str | None = None,
) -> dict[str, Any]:
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port_raw = os.getenv("SMTP_PORT", "587").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM_EMAIL", "").strip() or smtp_user
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}

    if not smtp_host or not smtp_user or not smtp_password or not smtp_from:
        raise HTTPException(
            status_code=500,
            detail="SMTP credentials missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL in Backend/.env",
        )

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="SMTP_PORT must be a valid integer") from exc

    subject = f"Selected for Round 1 - {role_name or 'HireMind AI'}"
    body = (
        f"Hi {candidate_name or 'Candidate'},\n\n"
        f"Congratulations! You have been selected for Round 1 for {role_name or 'the role'} at {company_name or 'HireMind AI'}.\n\n"
        f"Reason for shortlisting: {shortlist_reason or 'As per evaluation criteria'}.\n\n"
        "Our team will share the next steps shortly.\n\n"
        "Best regards,\n"
        f"{company_name or 'HireMind AI'}"
    )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = candidate_email
    message.set_content(body)

    def _send_via_sendgrid_api(api_key: str) -> dict[str, Any]:
        payload = {
            "personalizations": [{"to": [{"email": candidate_email, "name": candidate_name or "Candidate"}]}],
            "from": {"email": smtp_from, "name": company_name or "HireMind AI"},
            "subject": subject,
            "content": [{"type": "text/plain", "value": body}],
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=exc.response.status_code,
                    detail=f"SendGrid API send failed: {_stringify_reason(exc.response.text)}",
                ) from exc
        return {"status": resp.status_code, "response": "sent via SendGrid API"}

    context = ssl.create_default_context()
    ports_to_try: list[int] = [smtp_port]
    if smtp_port == 587:
        ports_to_try.append(2525)
    if smtp_port == 2525:
        ports_to_try.append(587)

    last_error: Exception | None = None
    for port in ports_to_try:
        try:
            if port == 465 and smtp_use_tls:
                with smtplib.SMTP_SSL(smtp_host, port, timeout=30, context=context) as server:
                    server.login(smtp_user, smtp_password)
                    server.send_message(message)
            else:
                with smtplib.SMTP(smtp_host, port, timeout=30) as server:
                    if smtp_use_tls:
                        server.starttls(context=context)
                    server.login(smtp_user, smtp_password)
                    server.send_message(message)
            return {"status": 250, "response": f"sent via {smtp_host}:{port}"}
        except Exception as exc:
            last_error = exc
            continue

    # Fallback for environments where outbound SMTP is blocked (common on some ISPs/cloud plans).
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY", "").strip() or smtp_password
    if "sendgrid" in smtp_host.lower() and sendgrid_api_key:
        return _send_via_sendgrid_api(sendgrid_api_key)

    raise HTTPException(
        status_code=502,
        detail=(
            f"SMTP send failed for host {smtp_host} on ports {ports_to_try}: "
            f"{_stringify_reason(str(last_error) if last_error else 'unknown error')}"
        ),
    )


def _send_round1_emails_smtp_batch(rows: list[dict[str, str]], role_name: str, company_name: str) -> dict[str, Any]:
    """Send many Round 1 emails efficiently using a single SMTP connection when possible."""
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port_raw = os.getenv("SMTP_PORT", "587").strip()
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_from = os.getenv("SMTP_FROM_EMAIL", "").strip() or smtp_user
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}

    if not smtp_host or not smtp_user or not smtp_password or not smtp_from:
        raise HTTPException(
            status_code=500,
            detail="SMTP credentials missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL in Backend/.env",
        )

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="SMTP_PORT must be a valid integer") from exc

    subject = f"Selected for Round 1 - {role_name or 'HireMind AI'}"
    context = ssl.create_default_context()

    ports_to_try: list[int] = [smtp_port]
    if smtp_port == 587:
        ports_to_try.append(2525)
    if smtp_port == 2525:
        ports_to_try.append(587)

    sent = 0
    failed = 0
    details: list[dict[str, Any]] = []

    last_error: Exception | None = None
    for port in ports_to_try:
        try:
            if port == 465 and smtp_use_tls:
                server = smtplib.SMTP_SSL(smtp_host, port, timeout=30, context=context)
            else:
                server = smtplib.SMTP(smtp_host, port, timeout=30)
            with server:
                if port != 465 and smtp_use_tls:
                    server.starttls(context=context)
                server.login(smtp_user, smtp_password)

                for r in rows:
                    candidate_name = r.get("name") or "Candidate"
                    candidate_email = r.get("email") or ""
                    shortlist_reason = r.get("shortlist_reason") or ""

                    body = (
                        f"Hi {candidate_name or 'Candidate'},\n\n"
                        f"Congratulations! You have been selected for Round 1 for {role_name or 'the role'} at {company_name or 'HireMind AI'}.\n\n"
                        f"Reason for shortlisting: {shortlist_reason or 'As per evaluation criteria'}.\n\n"
                        "Our team will share the next steps shortly.\n\n"
                        "Best regards,\n"
                        f"{company_name or 'HireMind AI'}"
                    )

                    message = EmailMessage()
                    message["Subject"] = subject
                    message["From"] = smtp_from
                    message["To"] = candidate_email
                    message.set_content(body)

                    try:
                        server.send_message(message)
                        sent += 1
                        details.append({"name": candidate_name, "email": candidate_email, "status": "sent", "smtpStatus": 250, "reason": shortlist_reason})
                    except Exception as exc:
                        failed += 1
                        details.append({"name": candidate_name, "email": candidate_email, "status": "failed", "reason": _stringify_reason(str(exc)), "shortlistReason": shortlist_reason})

            return {"success": True, "sent": sent, "failed": failed, "details": details, "transport": f"smtp:{smtp_host}:{port}"}
        except Exception as exc:
            last_error = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=(
            f"SMTP batch send failed for host {smtp_host} on ports {ports_to_try}: "
            f"{_stringify_reason(str(last_error) if last_error else 'unknown error')}"
        ),
    )


def _send_round1_emails_sendgrid_batch(rows: list[dict[str, str]], role_name: str, company_name: str) -> dict[str, Any]:
    """Send many Round 1 emails using SendGrid API in one request.

    Note: SendGrid returns 202 Accepted without per-recipient status; we record each row as 'sent'
    if the request is accepted.
    """
    api_key = os.getenv("SENDGRID_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="SENDGRID_API_KEY missing")

    smtp_from = os.getenv("SMTP_FROM_EMAIL", "").strip() or os.getenv("SMTP_USER", "").strip()
    if not smtp_from:
        raise HTTPException(status_code=500, detail="SMTP_FROM_EMAIL (or SMTP_USER) must be set for SendGrid")

    subject = f"Selected for Round 1 - {role_name or 'HireMind AI'}"

    # SendGrid supports multiple personalizations in one request.
    personalizations: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []
    for r in rows:
        candidate_name = r.get("name") or "Candidate"
        candidate_email = r.get("email") or ""
        shortlist_reason = r.get("shortlist_reason") or ""
        body = (
            f"Hi {candidate_name or 'Candidate'},\n\n"
            f"Congratulations! You have been selected for Round 1 for {role_name or 'the role'} at {company_name or 'HireMind AI'}.\n\n"
            f"Reason for shortlisting: {shortlist_reason or 'As per evaluation criteria'}.\n\n"
            "Our team will share the next steps shortly.\n\n"
            "Best regards,\n"
            f"{company_name or 'HireMind AI'}"
        )
        personalizations.append(
            {
                "to": [{"email": candidate_email, "name": candidate_name}],
                "subject": subject,
            }
        )
        details.append(
            {
                "name": candidate_name,
                "email": candidate_email,
                "status": "sent",
                "smtpStatus": 202,
                "reason": shortlist_reason,
            }
        )

    payload = {
        "personalizations": personalizations,
        "from": {"email": smtp_from, "name": company_name or "HireMind AI"},
        "content": [{"type": "text/plain", "value": details and "" or ""}],
    }

    # SendGrid requires content.value, but content is global. We use a generic template and put
    # the per-user reason in the single-email body via dynamic templates normally; since this project
    # uses plain text, we fall back to one request per email if reasons differ.
    # For <=5 emails, this is still fast and more correct.
    reasons = {str(r.get("shortlist_reason") or "") for r in rows}
    if len(reasons) > 1:
        # Per-email requests with shared client
        sent = 0
        failed = 0
        out_details: list[dict[str, Any]] = []
        with httpx.Client(timeout=30.0) as client:
            for r in rows:
                candidate_name = r.get("name") or "Candidate"
                candidate_email = r.get("email") or ""
                shortlist_reason = r.get("shortlist_reason") or ""
                body = (
                    f"Hi {candidate_name or 'Candidate'},\n\n"
                    f"Congratulations! You have been selected for Round 1 for {role_name or 'the role'} at {company_name or 'HireMind AI'}.\n\n"
                    f"Reason for shortlisting: {shortlist_reason or 'As per evaluation criteria'}.\n\n"
                    "Our team will share the next steps shortly.\n\n"
                    "Best regards,\n"
                    f"{company_name or 'HireMind AI'}"
                )
                one_payload = {
                    "personalizations": [{"to": [{"email": candidate_email, "name": candidate_name}]}],
                    "from": {"email": smtp_from, "name": company_name or "HireMind AI"},
                    "subject": subject,
                    "content": [{"type": "text/plain", "value": body}],
                }
                try:
                    resp = client.post(
                        "https://api.sendgrid.com/v3/mail/send",
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                        json=one_payload,
                    )
                    resp.raise_for_status()
                    sent += 1
                    out_details.append({"name": candidate_name, "email": candidate_email, "status": "sent", "smtpStatus": resp.status_code, "reason": shortlist_reason})
                except Exception as exc:
                    failed += 1
                    out_details.append({"name": candidate_name, "email": candidate_email, "status": "failed", "reason": _stringify_reason(str(exc)), "shortlistReason": shortlist_reason})
        return {"success": True, "sent": sent, "failed": failed, "details": out_details, "transport": "sendgrid"}

    # Single shared body for all (same reason)
    shared_reason = next(iter(reasons), "")
    body = (
        "Hi Candidate,\n\n"
        f"Congratulations! You have been selected for Round 1 for {role_name or 'the role'} at {company_name or 'HireMind AI'}.\n\n"
        f"Reason for shortlisting: {shared_reason or 'As per evaluation criteria'}.\n\n"
        "Our team will share the next steps shortly.\n\n"
        "Best regards,\n"
        f"{company_name or 'HireMind AI'}"
    )
    payload["subject"] = subject
    payload["content"] = [{"type": "text/plain", "value": body}]

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"SendGrid API send failed: {_stringify_reason(exc.response.text)}") from exc

    return {"success": True, "sent": len(rows), "failed": 0, "details": details, "transport": "sendgrid"}


def _process_round1_email_notifications_from_csv(text: str, role_name: str = "Round 1") -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(text))

    fieldnames = [str(x).strip().lower() for x in (reader.fieldnames or [])]
    required_headers = {"name", "phone number", "email", "reason for shortlisting"}
    missing_headers = [h for h in required_headers if h not in fieldnames]
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"CSV must contain columns: Name, Phone Number, Email, Reason for shortlisting. Missing: {', '.join(missing_headers)}",
        )

    skipped = 0
    details: list[dict[str, Any]] = []
    send_rows: list[dict[str, str]] = []

    for row in reader:
        name = str(row.get("Name") or row.get("name") or "").strip() or "Candidate"
        raw_email = str(
            row.get("Email")
            or row.get("email")
            or ""
        ).strip()
        shortlist_reason = str(
            row.get("Reason for shortlisting")
            or row.get("reason for shortlisting")
            or ""
        ).strip()
        email = _normalize_email(raw_email)

        if not email:
            skipped += 1
            details.append({"name": name, "email": raw_email, "status": "skipped", "reason": f"invalid email: {raw_email or 'missing'}"})
            continue

        send_rows.append({"name": name, "email": email, "shortlist_reason": shortlist_reason})

    # Prefer SendGrid API (fast, reliable) when configured; else SMTP batch mode.
    sent = 0
    failed = 0
    if send_rows:
        try:
            if os.getenv("SENDGRID_API_KEY", "").strip():
                batch = _send_round1_emails_sendgrid_batch(send_rows, role_name=role_name, company_name="HireMind AI")
            else:
                batch = _send_round1_emails_smtp_batch(send_rows, role_name=role_name, company_name="HireMind AI")
            sent += int(batch.get("sent") or 0)
            failed += int(batch.get("failed") or 0)
            details.extend(batch.get("details") or [])
        except Exception:
            for r in send_rows:
                try:
                    email_result = _send_round1_email(
                        r.get("name") or "Candidate",
                        r.get("email") or "",
                        role_name,
                        "HireMind AI",
                        shortlist_reason=r.get("shortlist_reason"),
                    )
                    sent += 1
                    details.append({"name": r.get("name"), "email": r.get("email"), "status": "sent", "smtpStatus": email_result.get("status"), "reason": r.get("shortlist_reason")})
                except Exception as e:
                    failed += 1
                    reason = e.detail if isinstance(e, HTTPException) else str(e)
                    details.append({"name": r.get("name"), "email": r.get("email"), "status": "failed", "reason": _stringify_reason(reason), "shortlistReason": r.get("shortlist_reason")})

    return {"success": True, "sent": sent, "skipped": skipped, "failed": failed, "details": details}


def _parse_claude_json(raw: str) -> dict[str, Any]:
    import json

    try:
        return json.loads(raw)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise ValueError("Claude did not return valid JSON")
        return json.loads(m.group(0))


def _normalize_eval(payload: dict[str, Any], threshold: float) -> dict[str, Any]:
    overall = _to_float(payload.get("overall_score"), 0.0)
    return {
        "skills_match": _to_float(payload.get("skills_match"), 0.0),
        "experience_match": _to_float(payload.get("experience_match"), 0.0),
        "project_score": _to_float(payload.get("project_score"), 0.0),
        "education_score": _to_float(payload.get("education_score"), 0.0),
        "overall_score": overall,
        "decision": "shortlisted" if overall >= threshold else "rejected",
        "missing_skills": _to_list(payload.get("missing_skills")),
        "strengths": _to_list(payload.get("strengths")),
        "weaknesses": _to_list(payload.get("weaknesses")),
        "reason": str(payload.get("reason") or "No reason provided."),
    }


def _extract_resume_text_from_bytes(content: bytes, filename: str, settings) -> str:
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            text_parts: list[str] = []
            for page in reader.pages[:15]:
                try:
                    text_parts.append(page.extract_text() or "")
                except Exception:
                    pass
            text = "\n".join(text_parts).strip()
            if text:
                return text
        except Exception:
            pass

    if ext == ".docx":
        try:
            import docx

            doc = docx.Document(io.BytesIO(content))
            text = "\n".join(par.text for par in doc.paragraphs).strip()
            if text:
                return text
        except Exception:
            pass

    # Fallback to Claude OCR from base64 payload.
    from app.services.resume_extractor import extract_resume_text

    mime = "application/pdf" if ext == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    data_url = f"data:{mime};base64,{base64.b64encode(content).decode('utf-8')}"
    return extract_resume_text(data_url)


def _is_model_not_found_error(err: Exception) -> bool:
    msg = str(err).lower()
    return "not_found_error" in msg or ("model" in msg and "not found" in msg)


def _is_retryable_claude_error(err: Exception) -> bool:
    status_code = getattr(err, "status_code", None)
    response = getattr(err, "response", None)
    if status_code is None and response is not None:
        status_code = getattr(response, "status_code", None)

    if isinstance(status_code, int) and status_code in {408, 409, 425, 429, 500, 502, 503, 504, 529}:
        return True

    msg = str(err).lower()
    retry_markers = (
        "529",
        "overloaded",
        "rate limit",
        "rate_limit",
        "timeout",
        "temporarily unavailable",
        "internal server error",
        "connection error",
        "api_error",
    )
    return any(marker in msg for marker in retry_markers)


def _evaluate_with_claude(job_title: str, job_description: str, resume_text: str, settings) -> dict[str, Any]:
    import anthropic
    from app.services.claude_vision import claude_messages_create

    if not settings.claude_api_key:
        raise HTTPException(status_code=500, detail="CLAUDE_API_KEY missing")

    model_candidates = [
        os.getenv("CLAUDE_MODEL") or "claude-3-5-sonnet-latest",
        os.getenv("ANTHROPIC_MODEL"),
        "claude-3-5-sonnet-latest",
        "claude-3-7-sonnet-latest",
        "claude-sonnet-4-6",
    ]
    models = [m for i, m in enumerate(model_candidates) if m and m not in model_candidates[:i]]

    max_tokens = max(300, int(os.getenv("CLAUDE_MAX_TOKENS", "700")))
    max_chars = max(4000, int(os.getenv("RESUME_MAX_CHARS", "12000")))
    max_retries = max(0, int(os.getenv("CLAUDE_MAX_RETRIES", "4")))

    prompt = (
        "You are an AI evaluation engine for Hiremind.\n\n"
        "Analyze resume vs job description.\n\n"
        "Return ONLY valid JSON:\n\n"
        "{\n"
        '  "skills_match": number,\n'
        '  "experience_match": number,\n'
        '  "project_score": number,\n'
        '  "education_score": number,\n'
        '  "overall_score": number,\n'
        '  "decision": "shortlisted" or "rejected",\n'
        '  "missing_skills": [],\n'
        '  "strengths": [],\n'
        '  "weaknesses": [],\n'
        '  "reason": ""\n'
        "}\n\n"
        "Rules:\n"
        "- overall_score >= 7 -> shortlisted\n"
        "- be strict\n"
        "- no explanation outside JSON\n\n"
        f"JOB TITLE:\n{job_title}\n\n"
        f"JOB DESCRIPTION:\n{job_description}\n\n"
        f"RESUME TEXT:\n{resume_text[:max_chars]}"
    )

    client = anthropic.Anthropic(api_key=settings.claude_api_key)
    last_err: Exception | None = None

    for model in models:
        for attempt in range(max_retries + 1):
            try:
                res = claude_messages_create(
                    client,
                    purpose="round0_shortlist",
                    model=model,
                    max_tokens=max_tokens,
                    temperature=0,
                    messages=[{"role": "user", "content": prompt}],
                )
                content = res.content or []
                text_block = next((c for c in content if getattr(c, "type", "") == "text"), None)
                raw = text_block.text if text_block else ""
                return _parse_claude_json(raw)
            except Exception as e:
                last_err = e

                if _is_model_not_found_error(e):
                    break

                if _is_retryable_claude_error(e):
                    if attempt < max_retries:
                        delay_s = min(8.0, 0.8 * (2 ** attempt))
                        print(
                            f"[Round0] Claude transient failure for model={model} "
                            f"attempt={attempt + 1}/{max_retries + 1}; retrying in {delay_s:.1f}s. err={e}"
                        )
                        time.sleep(delay_s)
                        continue
                    # Exhausted retries for this model; try the next configured model.
                    print(f"[Round0] Claude retries exhausted for model={model}. err={e}")
                    break

                raise

    if last_err and _is_retryable_claude_error(last_err):
        raise HTTPException(
            status_code=503,
            detail=(
                "Claude API is temporarily overloaded. Please retry shortlist in a few seconds. "
                f"Last error: {last_err}"
            ),
        )

    raise HTTPException(status_code=502, detail=f"No valid Claude model found. Last error: {last_err}")


@router.post("/jobs")
def round0_create_job(payload: dict[str, Any], db: Session = Depends(get_db), current_user: User = Depends(get_current_company)):
    company = get_company_for_user(db, current_user)
    title = str(payload.get("title") or "").strip()
    description = str(payload.get("description") or "").strip()
    if not title or not description:
        raise HTTPException(status_code=400, detail="title and description are required")

    job = Round0Job(
        company_id=company.id,
        title=title,
        description=description,
        jd_fingerprint=_sha256_text(f"{title}\n{description}"),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return {"success": True, "data": {"id": str(job.id), "title": job.title, "description": job.description, "createdAt": job.created_at.isoformat()}}


@router.post("/candidates/upload")
async def round0_upload_resumes(
    resumes: list[UploadFile] = File(...),
    job_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_company),
):
    company = get_company_for_user(db, current_user)

    # If job_id is omitted, use latest company job to keep frontend compatibility.
    if job_id is None:
        job = db.query(Round0Job).filter(Round0Job.company_id == company.id).order_by(Round0Job.id.desc()).first()
    else:
        job = db.query(Round0Job).filter(Round0Job.id == job_id, Round0Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Round0 job not found")

    created = []
    settings = get_settings()

    for file in resumes:
        filename = file.filename or f"resume_{datetime.utcnow().timestamp()}.pdf"
        ext = Path(filename).suffix.lower()
        if ext not in {".pdf", ".docx"}:
            raise HTTPException(status_code=400, detail="Only PDF and DOCX files are allowed")

        data = await file.read()
        if len(data) > int(os.getenv("MAX_FILE_SIZE_MB", "8")) * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File {filename} exceeds size limit")

        resume_hash = _sha256_bytes(data)
        stored = _round0_upload_dir / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{Path(filename).stem}{ext}"
        stored.write_bytes(data)

        text = _extract_resume_text_from_bytes(data, filename, settings)
        inferred_name = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
        profile_name = _extract_name(text, inferred_name)
        profile_email = _extract_email(text)
        mobile = _extract_phone(text)

        row = Round0Candidate(
            job_id=job.id,
            name=profile_name,
            email=profile_email,
            mobile_number=mobile,
            resume_path=str(stored),
            resume_hash=resume_hash,
            resume_text=text,
        )
        db.add(row)
        db.flush()
        created.append({
            "id": str(row.id),
            "name": row.name,
            "email": row.email,
            "mobileNumber": row.mobile_number,
            "resumeUrl": str(stored),
        })

    db.commit()
    return {"success": True, "count": len(created), "data": created}


@router.post("/shortlist/{job_id}")
def round0_shortlist(
    job_id: int,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_company),
):
    settings = get_settings()
    company = get_company_for_user(db, current_user)
    job = db.query(Round0Job).filter(Round0Job.id == job_id, Round0Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Round0 job not found")

    ids = payload.get("candidate_ids") if isinstance(payload, dict) else None
    query = db.query(Round0Candidate).filter(Round0Candidate.job_id == job.id)
    if isinstance(ids, list) and ids:
        valid_ids = [int(i) for i in ids if str(i).isdigit()]
        if valid_ids:
            query = query.filter(Round0Candidate.id.in_(valid_ids))
    candidates = query.order_by(Round0Candidate.created_at.asc()).all()

    threshold = float(os.getenv("SHORTLIST_THRESHOLD", "7"))
    shortlisted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    # Phase 1: use cache immediately; prepare uncached candidates for parallel evaluation.
    cached_results: dict[int, dict[str, Any]] = {}
    to_eval: list[dict[str, Any]] = []

    for cand in candidates:
        cached = db.query(Round0EvalCache).filter(
            Round0EvalCache.company_id == company.id,
            Round0EvalCache.jd_fingerprint == job.jd_fingerprint,
            Round0EvalCache.resume_hash == cand.resume_hash,
        ).first()

        if cached:
            cached_results[cand.id] = {
                "raw_eval": cached.payload or {},
                "eval_norm": _normalize_eval(cached.payload or {}, threshold),
                "cand": cand,
            }
            continue

        resume_text = (cand.resume_text or "").strip()
        if not resume_text:
            resume_text = _extract_resume_text_from_bytes(
                Path(cand.resume_path).read_bytes(),
                Path(cand.resume_path).name,
                settings,
            )
            cand.resume_text = resume_text

        to_eval.append(
            {
                "candidate_id": cand.id,
                "resume_hash": cand.resume_hash,
                "resume_text": resume_text,
                "cand": cand,
            }
        )

    # Phase 2: evaluate uncached resumes in parallel (max 5 workers).
    max_workers = max(1, min(5, int(os.getenv("ROUND0_MAX_WORKERS", "5"))))
    eval_results: dict[int, dict[str, Any]] = {}

    if to_eval:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(
                    _evaluate_with_claude,
                    job.title,
                    job.description,
                    item["resume_text"],
                    settings,
                ): item
                for item in to_eval
            }

            for fut in as_completed(futures):
                item = futures[fut]
                cid = int(item["candidate_id"])
                try:
                    raw_eval = fut.result()
                    eval_results[cid] = {
                        "raw_eval": raw_eval,
                        "eval_norm": _normalize_eval(raw_eval, threshold),
                        "cand": item["cand"],
                        "resume_hash": item["resume_hash"],
                    }
                except Exception as e:
                    eval_results[cid] = {
                        "error": e,
                        "cand": item["cand"],
                        "resume_hash": item["resume_hash"],
                    }

    # Phase 3: write evaluations + cache in one DB transaction.
    all_results: dict[int, dict[str, Any]] = {**cached_results, **eval_results}

    for cand in candidates:
        cid = int(cand.id)
        try:
            res = all_results.get(cid) or {}
            err = res.get("error")
            if err is not None:
                raise err

            raw_eval = res.get("raw_eval") or {}
            eval_norm = res.get("eval_norm") or _normalize_eval(raw_eval, threshold)

            if cid not in cached_results:
                cache_row = Round0EvalCache(
                    company_id=company.id,
                    jd_fingerprint=job.jd_fingerprint,
                    resume_hash=res.get("resume_hash") or cand.resume_hash,
                    payload=raw_eval,
                )
                db.add(cache_row)

            eval_row = db.query(Round0Evaluation).filter(
                Round0Evaluation.job_id == job.id,
                Round0Evaluation.candidate_id == cand.id,
            ).first()
            if not eval_row:
                eval_row = Round0Evaluation(job_id=job.id, candidate_id=cand.id, reason="")
                db.add(eval_row)

            eval_row.skills_match = eval_norm["skills_match"]
            eval_row.experience_match = eval_norm["experience_match"]
            eval_row.project_score = eval_norm["project_score"]
            eval_row.education_score = eval_norm["education_score"]
            eval_row.overall_score = eval_norm["overall_score"]
            eval_row.decision = eval_norm["decision"]
            eval_row.missing_skills = eval_norm["missing_skills"]
            eval_row.strengths = eval_norm["strengths"]
            eval_row.weaknesses = eval_norm["weaknesses"]
            eval_row.reason = eval_norm["reason"]
            db.flush()

            payload_row = {
                "candidateId": str(cand.id),
                "name": cand.name,
                "email": cand.email,
                "mobileNumber": cand.mobile_number,
                "resumeUrl": cand.resume_path,
                "evaluation": {
                    "overall_score": eval_row.overall_score,
                    "decision": eval_row.decision,
                    "reason": eval_row.reason,
                },
            }

            if eval_row.decision == "shortlisted":
                shortlisted.append(payload_row)
            else:
                rejected.append(payload_row)

        except Exception as e:
            rejected.append(
                {
                    "candidateId": str(cand.id),
                    "name": cand.name,
                    "email": cand.email,
                    "mobileNumber": cand.mobile_number,
                    "resumeUrl": cand.resume_path,
                    "evaluation": {
                        "overall_score": 0,
                        "decision": "rejected",
                        "reason": f"Evaluation failed: {e}",
                    },
                }
            )

    db.commit()
    return {"success": True, "shortlisted": shortlisted, "rejected": rejected}


@router.get("/shortlist/report/{job_id}/csv")
def round0_shortlisted_csv(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_company)):
    company = get_company_for_user(db, current_user)
    job = db.query(Round0Job).filter(Round0Job.id == job_id, Round0Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Round0 job not found")

    rows = (
        db.query(Round0Evaluation, Round0Candidate)
        .join(Round0Candidate, Round0Evaluation.candidate_id == Round0Candidate.id)
        .filter(Round0Evaluation.job_id == job.id, Round0Evaluation.decision == "shortlisted")
        .order_by(Round0Evaluation.created_at.asc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Email", "Phone Number", "Reason"])
    for ev, cand in rows:
        writer.writerow([cand.name or cand.id, cand.email or "", cand.mobile_number or "", ev.reason or ""])

    data = io.BytesIO(output.getvalue().encode("utf-8"))
    headers = {"Content-Disposition": f"attachment; filename=shortlisted_{job_id}.csv"}
    return StreamingResponse(data, media_type="text/csv", headers=headers)


@router.post("/caller/call-shortlisted/{job_id}")
def round0_call_shortlisted(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_company)):
    company = get_company_for_user(db, current_user)
    job = db.query(Round0Job).filter(Round0Job.id == job_id, Round0Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Round0 job not found")

    rows = (
        db.query(Round0Evaluation, Round0Candidate)
        .join(Round0Candidate, Round0Evaluation.candidate_id == Round0Candidate.id)
        .filter(Round0Evaluation.job_id == job.id, Round0Evaluation.decision == "shortlisted")
        .all()
    )

    called = 0
    skipped = 0
    failed = 0
    details = []

    for ev, cand in rows:
        mobile = _normalize_indian_phone(cand.mobile_number)
        if not mobile:
            skipped += 1
            details.append(
                {
                    "candidateId": cand.id,
                    "name": cand.name,
                    "status": "skipped",
                    "reason": f"invalid phone: {cand.mobile_number or 'missing'}",
                }
            )
            continue

        try:
            data = _call_vapi(mobile, cand.name or "Candidate", job.title)
            call_id = data.get("id") or data.get("call", {}).get("id")
            status = str(data.get("status") or "initiated")
            summary = data.get("analysis", {}).get("summary") or data.get("summary") or ""
            availability_date = _parse_availability(summary)

            report = db.query(Round0CallReport).filter(
                Round0CallReport.job_id == job.id,
                Round0CallReport.candidate_id == cand.id,
            ).first()
            if not report:
                report = Round0CallReport(job_id=job.id, candidate_id=cand.id)
                db.add(report)
            report.vapi_call_id = call_id
            report.call_status = status
            report.availability_date = availability_date
            report.notes = summary or None

            called += 1
            details.append({"candidateId": cand.id, "name": cand.name, "mobileNumber": mobile, "status": status, "vapiCallId": call_id})
        except Exception as e:
            failed += 1
            reason = e.detail if isinstance(e, HTTPException) else str(e)
            details.append(
                {
                    "candidateId": cand.id,
                    "name": cand.name,
                    "mobileNumber": mobile,
                    "status": "failed",
                    "reason": _stringify_reason(reason),
                }
            )

    db.commit()
    return {"success": True, "called": called, "skipped": skipped, "failed": failed, "details": details}


@router.post("/caller/upload-csv-and-call")
async def round0_upload_csv_and_call(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_company),
):
    print("🔵 [BACKEND] /caller/upload-csv-and-call endpoint triggered - ONLY CALLS")
    _ = current_user

    content = await file.read()
    text = content.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    fieldnames = [str(x).strip().lower() for x in (reader.fieldnames or [])]
    required_headers = {"name", "phone number", "email", "reason for shortlisting"}
    missing_headers = [h for h in required_headers if h not in fieldnames]
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"CSV must contain columns: Name, Phone Number, Email, Reason for shortlisting. Missing: {', '.join(missing_headers)}",
        )

    called = 0
    skipped = 0
    failed = 0
    details: list[dict[str, Any]] = []

    for row in reader:
        name = str(row.get("Name") or row.get("name") or "").strip() or "Candidate"
        shortlist_reason = str(
            row.get("Reason for shortlisting")
            or row.get("reason for shortlisting")
            or ""
        ).strip()
        raw_mobile = str(
            row.get("Phone Number")
            or row.get("phone number")
            or ""
        ).strip()
        mobile = _normalize_indian_phone(raw_mobile)

        if not mobile:
            skipped += 1
            details.append(
                {
                    "name": name,
                    "mobileNumber": raw_mobile,
                    "status": "skipped",
                    "reason": f"invalid phone: {raw_mobile or 'missing'}",
                }
            )
            continue

        try:
            data = _call_vapi(mobile, name or "Candidate", "shortlisted role")
            call_id = data.get("id") or data.get("call", {}).get("id")
            status = str(data.get("status") or "initiated")
            summary = data.get("analysis", {}).get("summary") or data.get("summary") or ""
            availability = _parse_availability(summary)
            called += 1
            details.append({
                "name": name,
                "mobileNumber": mobile,
                "status": status,
                "vapiCallId": call_id,
                "availabilityDate": availability,
                "notes": summary,
                "reason": shortlist_reason,
            })
        except Exception as e:
            failed += 1
            reason = e.detail if isinstance(e, HTTPException) else str(e)
            details.append({"name": name, "mobileNumber": mobile, "status": "failed", "reason": _stringify_reason(reason)})

    return {"success": True, "called": called, "skipped": skipped, "failed": failed, "details": details}


@router.post("/caller/upload-csv-and-email")
async def round0_upload_csv_and_email(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_company),
):
    print("🟢 [BACKEND] /caller/upload-csv-and-email endpoint triggered - ONLY EMAILS")
    _ = current_user

    content = await file.read()
    text = content.decode("utf-8-sig", errors="ignore")
    return _process_round1_email_notifications_from_csv(text, role_name="Round 1")


@router.get("/caller/report/{job_id}/csv")
def round0_caller_report_csv(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_company)):
    company = get_company_for_user(db, current_user)
    job = db.query(Round0Job).filter(Round0Job.id == job_id, Round0Job.company_id == company.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Round0 job not found")

    reports = (
        db.query(Round0CallReport, Round0Candidate)
        .join(Round0Candidate, Round0CallReport.candidate_id == Round0Candidate.id)
        .filter(Round0CallReport.job_id == job.id)
        .order_by(Round0CallReport.updated_at.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Phone Number", "Call Status", "Availability Date", "Notes"])
    for report, cand in reports:
        writer.writerow([
            cand.name or cand.id,
            cand.mobile_number or "",
            report.call_status or "",
            report.availability_date or "",
            report.notes or "",
        ])

    data = io.BytesIO(output.getvalue().encode("utf-8"))
    headers = {"Content-Disposition": f"attachment; filename=caller_report_{job_id}.csv"}
    return StreamingResponse(data, media_type="text/csv", headers=headers)
