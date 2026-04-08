"""
Claude Vision API for proctoring (frame analysis) and verification (identity checks).

- analyze_proctor_frame: detect face visible, phone in frame, multiple people.
- face_match: compares ID proof + live photo (two images in one request) and returns match_confidence.

Requires CLAUDE_API_KEY in environment. If not set, returns safe defaults (no penalty).
"""

from __future__ import annotations

import base64
import logging
import random
import re
import threading
import time
from typing import Any

from app.core.config import get_settings


logger = logging.getLogger(__name__)


_limit_lock = threading.Lock()
_semaphore: threading.BoundedSemaphore | None = None
_semaphore_size: int | None = None
_next_allowed_time_s: float = 0.0


def _ensure_limiters() -> None:
    """Initialize (or reinitialize) in-process limiters based on current settings."""
    global _semaphore, _semaphore_size
    settings = get_settings()
    target = max(1, int(getattr(settings, "claude_max_concurrency", 1) or 1))
    with _limit_lock:
        if _semaphore is None or _semaphore_size != target:
            _semaphore = threading.BoundedSemaphore(target)
            _semaphore_size = target


def _throttle_rps() -> None:
    """Global per-process requests-per-second throttle (0 disables)."""
    global _next_allowed_time_s
    settings = get_settings()
    rps = float(getattr(settings, "claude_rps", 0.0) or 0.0)
    if rps <= 0:
        return

    min_interval = 1.0 / rps

    with _limit_lock:
        now = time.monotonic()
        wait_s = max(0.0, _next_allowed_time_s - now)
        _next_allowed_time_s = max(_next_allowed_time_s, now) + min_interval

    if wait_s > 0:
        time.sleep(wait_s)


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
        "service unavailable",
    )
    return any(marker in msg for marker in retry_markers)


def _get_retry_after_seconds(err: Exception) -> float | None:
    """Try to extract server-provided retry delay from the exception/response headers."""
    response = getattr(err, "response", None)
    headers = None
    if response is not None:
        headers = getattr(response, "headers", None)

    if not headers:
        return None

    try:
        raw = headers.get("retry-after") or headers.get("Retry-After")
        if raw is None:
            return None
        # retry-after can be seconds or an HTTP date; only handle seconds here.
        seconds = float(str(raw).strip())
        if seconds >= 0:
            return seconds
    except Exception:
        return None
    return None


def _messages_create_with_retry(client: Any, *, purpose: str, **kwargs: Any) -> Any:
    """Wrapper around client.messages.create with backoff + in-process throttling."""
    settings = get_settings()
    max_retries = max(0, int(getattr(settings, "claude_max_retries", 0) or 0))
    backoff_initial = float(getattr(settings, "claude_backoff_initial_s", 0.6) or 0.6)
    backoff_max = float(getattr(settings, "claude_backoff_max_s", 8.0) or 8.0)
    acquire_timeout = float(getattr(settings, "claude_acquire_timeout_s", 10.0) or 10.0)

    _ensure_limiters()
    assert _semaphore is not None

    last_err: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            acquired = _semaphore.acquire(timeout=acquire_timeout)
            if not acquired:
                raise TimeoutError(
                    f"Timed out acquiring Claude semaphore after {acquire_timeout:.1f}s (purpose={purpose})"
                )

            try:
                _throttle_rps()
                return client.messages.create(**kwargs)
            finally:
                _semaphore.release()

        except Exception as exc:
            last_err = exc
            if attempt >= max_retries or not _is_retryable_claude_error(exc):
                raise

            # Exponential backoff with jitter; respect Retry-After when present.
            base = backoff_initial * (2 ** attempt)
            delay_s = min(backoff_max, base)
            jitter = random.uniform(0.0, max(0.0, delay_s * 0.25))
            delay_s = delay_s + jitter
            retry_after = _get_retry_after_seconds(exc)
            if retry_after is not None:
                delay_s = max(delay_s, retry_after)

            logger.warning(
                "Claude transient failure (purpose=%s) attempt=%s/%s; retrying in %.2fs. err=%s",
                purpose,
                attempt + 1,
                max_retries + 1,
                delay_s,
                exc,
            )
            time.sleep(delay_s)

    # Defensive: loop should have returned or raised.
    if last_err is not None:
        raise last_err
    raise RuntimeError("Claude call failed without exception")


def claude_messages_create(client: Any, *, purpose: str, **kwargs: Any) -> Any:
    """Shared helper for Claude calls with retry/backoff + in-process throttling.

    This is intentionally placed here so other modules can reuse one consistent policy.
    """
    return _messages_create_with_retry(client, purpose=purpose, **kwargs)


def _strip_data_url(image_base64: str) -> tuple[str, str]:
    if image_base64.startswith("data:") and "," in image_base64:
        header, data = image_base64.split(",", 1)
        media_type = header.split(":", 1)[1].split(";", 1)[0] or "image/jpeg"
        return media_type, data
    return "image/jpeg", image_base64


def _call_claude_vision(image_base64: str, prompt: str, max_tokens: int = 300) -> str | None:
    """Call Claude with a single image and prompt. Returns response text or None on error."""
    settings = get_settings()
    if not settings.claude_api_key:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        media_type, b64 = _strip_data_url(image_base64)
        msg = _messages_create_with_retry(
            client,
            purpose="vision_single",
            model=settings.claude_model,
            max_tokens=max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        return _extract_text_from_message(msg)
    except Exception as exc:
        logger.warning("Claude Vision call failed: %s", exc)
    return None


def _call_claude_vision_two_images(
    first_image_base64: str,
    second_image_base64: str,
    prompt: str,
    max_tokens: int = 150,
) -> str | None:
    """Call Claude with two images in one request; returns response text or None on error."""
    settings = get_settings()
    if not settings.claude_api_key:
        return None
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        media_type_1, b64_1 = _strip_data_url(first_image_base64)
        media_type_2, b64_2 = _strip_data_url(second_image_base64)

        msg = _messages_create_with_retry(
            client,
            purpose="vision_two_images",
            model=settings.claude_model,
            max_tokens=max_tokens,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type_1,
                                "data": b64_1,
                            },
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type_2,
                                "data": b64_2,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        return _extract_text_from_message(msg)
    except Exception as exc:
        logger.warning("Claude Vision (two images) call failed: %s", exc)
    return None


def _parse_confidence(raw: str | None) -> float | None:
    """Extract a confidence only when the model actually provided one.

    Important: do NOT fall back to "first number in the text". When the model refuses or
    echoes the instruction ("between 0 and 1"), naive parsing will incorrectly yield 0.
    """
    if not raw:
        return None
    text = raw.strip()

    # Only accept values when they appear on a keyed line (avoid parsing instruction echoes).
    # Spec requires:
    # - match_confidence: <0 to 1>
    v_raw: str | None = None
    for line in text.splitlines():
        ln = line.strip()
        if not ln:
            continue
        m = re.match(
            r"^match[_ ]?confidence\s*[:=]\s*(null|\d{1,3}\s*%|(?:0(?:\.\d+)?|1(?:\.0+)?))\s*$",
            ln,
            flags=re.IGNORECASE,
        )
        if m:
            v_raw = m.group(1).strip().lower()
            break

    if v_raw is None:
        return None

    if v_raw == "null":
        return None

    if v_raw.endswith("%"):
        try:
            pct = float(v_raw[:-1].strip())
            if 0 <= pct <= 100:
                return pct / 100.0
        except Exception:
            return None
        return None

    try:
        v = float(v_raw)
    except Exception:
        return None
    if 0.0 <= v <= 1.0:
        return v
    if 1.0 < v <= 100.0:
        return v / 100.0
    return None


def _extract_text_from_message(msg: Any) -> str:
    """Best-effort extraction of a text block from an Anthropic message."""
    if msg is None:
        return ""
    content = getattr(msg, "content", None) or []
    # content may be list of objects or dicts.
    for block in content:
        btype = getattr(block, "type", None) or (block.get("type") if isinstance(block, dict) else None)
        if btype == "text":
            return (getattr(block, "text", None) or (block.get("text") if isinstance(block, dict) else "") or "").strip()
    # Fallback: if first block has text
    if content:
        first = content[0]
        return (getattr(first, "text", None) or (first.get("text") if isinstance(first, dict) else "") or "").strip()
    return ""


def _parse_yes_no(text: str, key: str) -> bool:
    """Parse a line like 'face_visible: yes' or 'face_visible: no' from response."""
    if not text:
        return False
    text = text.lower().strip()
    # Look for key: yes/no
    for line in text.split("\n"):
        line = line.strip()
        if key in line and ":" in line:
            val = line.split(":", 1)[1].strip().lower()
            return val.startswith("y") or val == "1" or "yes" in val
    return False


def analyze_proctor_frame(image_base64: str) -> dict[str, Any]:
    """
    Analyze a single frame from the candidate's webcam for proctoring.
    Returns: face_visible (bool), phone_detected (bool), multiple_faces (bool).
    If Claude API is not configured, returns face_visible=True and others False (no penalty).
    """
    settings = get_settings()
    result: dict[str, Any] = {
        "face_visible": True,
        "phone_detected": False,
        "multiple_faces": False,
        "raw": None,
    }
    if not settings.claude_api_key:
        return result
    prompt = """Look at this image from a candidate's webcam during an online assessment.
Answer with exactly these three lines (nothing else):
face_visible: yes or no  (is exactly one person's face clearly visible and facing the camera?)
phone_detected: yes or no  (is a phone, smartphone, or handheld device visible in the frame?)
multiple_faces: yes or no  (are two or more different people's faces visible?)

Answer only with those three lines."""
    raw = _call_claude_vision(image_base64, prompt)
    result["raw"] = raw
    if not raw:
        return result
    for line in raw.split("\n"):
        line_l = line.lower().strip()
        if "face_visible" in line_l and ":" in line:
            val = line.split(":", 1)[1].strip().lower()
            result["face_visible"] = val.startswith("y") or val == "1"
            break
    result["phone_detected"] = _parse_yes_no(raw, "phone_detected")
    result["multiple_faces"] = _parse_yes_no(raw, "multiple_faces")
    return result


def face_match(id_proof_base64: str, live_photo_base64: str) -> dict[str, Any]:
    """Compare ID proof image with live webcam photo using Claude Vision (two images in one request)."""
    result: dict[str, Any] = {
        "confidence": 0.0,
        "match": False,
        "checked": False,
        "error": None,
        "raw": None,
    }
    settings = get_settings()
    if not settings.claude_api_key:
        return result

    prompt = (
        "First image: ID proof. Second image: live photo.\n"
        "Do the two images show the same person?\n"
        "Reply with:\n"
        "match_confidence: <0 to 1>"
    )

    raw = _call_claude_vision_two_images(id_proof_base64, live_photo_base64, prompt, max_tokens=150)
    result["raw"] = raw
    conf = _parse_confidence(raw)
    if conf is None:
        result["checked"] = False
        result["error"] = "Claude did not return match_confidence"
        return result

    result["checked"] = True
    result["confidence"] = conf
    result["match"] = conf >= 0.7
    return result


def normalize_person_name(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"[^a-z0-9 ]+", "", name.lower()).strip()


def names_match(expected_name: str | None, extracted_name: str | None) -> bool:
    expected = normalize_person_name(expected_name)
    extracted = normalize_person_name(extracted_name)
    if not expected or not extracted:
        return False
    if expected == extracted:
        return True
    expected_tokens = {token for token in expected.split() if token}
    extracted_tokens = {token for token in extracted.split() if token}
    if not expected_tokens or not extracted_tokens:
        return False
    overlap = len(expected_tokens & extracted_tokens)
    shortest = min(len(expected_tokens), len(extracted_tokens))
    if shortest <= 0:
        return False
    # "Sufficiently" = at least 60% token overlap of the shorter name.
    required = max(1, int((shortest * 0.6) + 0.9999))
    return overlap >= required


def extract_id_name(id_proof_base64: str) -> dict[str, Any]:
    settings = get_settings()
    result: dict[str, Any] = {
        "extracted_name": None,
        "checked": False,
        "raw": None,
    }
    if not settings.claude_api_key:
        return result
    prompt = (
        "Read the uploaded identity document and extract the full name.\n"
        "Reply:\n"
        "full_name: <name>"
    )
    raw = _call_claude_vision(id_proof_base64, prompt, max_tokens=150)
    result["raw"] = raw
    if not raw:
        return result
    result["checked"] = True
    for line in raw.split("\n"):
        m = re.match(r"^full_name\s*:\s*(.+?)\s*$", line.strip(), flags=re.IGNORECASE)
        if not m:
            continue
        extracted = m.group(1).strip()
        if extracted and extracted.lower() not in {"unknown", "unreadable", "n/a", "na", "null"}:
            result["extracted_name"] = extracted
        break
    return result
