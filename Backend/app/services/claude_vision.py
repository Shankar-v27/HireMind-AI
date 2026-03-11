"""
Claude Vision API for proctoring (frame analysis) and verification (face matching).

- analyze_proctor_frame: detect face visible, phone in frame, multiple people.
- face_match: compare ID proof image with live photo; return confidence score.

Requires CLAUDE_API_KEY in environment. If not set, returns safe defaults (no penalty).
"""

from __future__ import annotations

import base64
import re
from typing import Any

from app.core.config import get_settings


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
        msg = client.messages.create(
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
        if msg.content and len(msg.content) > 0:
            return msg.content[0].text
    except Exception:
        pass
    return None


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
    """
    Compare ID proof image with live webcam photo. Returns confidence score 0-1
    and whether they appear to be the same person.
    """
    settings = get_settings()
    result: dict[str, Any] = {
        "confidence": 0.0,
        "match": False,
        "raw": None,
    }
    if not settings.claude_api_key:
        return result
    # Claude can accept multiple images in one message
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        id_media_type, id_b64 = _strip_data_url(id_proof_base64)
        photo_media_type, photo_b64 = _strip_data_url(live_photo_base64)
        msg = client.messages.create(
            model=settings.claude_model,
            max_tokens=200,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "First image: ID proof (e.g. driver's license, college ID). Second image: live photo from webcam."},
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": id_media_type, "data": id_b64},
                        },
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": photo_media_type, "data": photo_b64},
                        },
                        {
                            "type": "text",
                            "text": "Do the two images show the same person? Reply with one line: match_confidence: a number between 0 and 1 (e.g. 0.95 meaning 95% confident same person).",
                        },
                    ],
                }
            ],
        )
        raw = msg.content[0].text if msg.content else ""
        result["raw"] = raw
        # Parse confidence from "match_confidence: 0.95" or similar
        for line in raw.split("\n"):
            if "match_confidence" in line.lower() or "confidence" in line.lower():
                nums = re.findall(r"0?\.\d+|\d+\.\d+", line)
                if nums:
                    result["confidence"] = min(1.0, max(0.0, float(nums[0])))
                    result["match"] = result["confidence"] >= 0.7
                    break
    except Exception:
        pass
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
    return shortest > 0 and overlap >= shortest


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
        "Read the uploaded identity document and extract the primary full name of the person. "
        "Reply with exactly one line in this format: full_name: <name>. "
        "If the name is unreadable, reply exactly: full_name: unknown."
    )
    raw = _call_claude_vision(id_proof_base64, prompt, max_tokens=150)
    result["raw"] = raw
    if not raw:
        return result
    result["checked"] = True
    for line in raw.split("\n"):
        if "full_name" in line.lower() and ":" in line:
            extracted = line.split(":", 1)[1].strip()
            if extracted.lower() != "unknown":
                result["extracted_name"] = extracted
            break
    return result
