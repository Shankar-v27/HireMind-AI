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


def _parse_yes_no_strict(text: str | None, key: str) -> bool | None:
    """Parse an exact line like '{key}: yes' or '{key}: no'.

    Returns:
      - True/False if we found a strict match
      - None if the response is missing/ambiguous (safe caller defaults should apply)
    """
    if not text:
        return None
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(yes|no)\s*\.?\s*$", re.IGNORECASE)
    for line in text.split("\n"):
        match = pattern.match(line)
        if match:
            return match.group(1).strip().lower() == "yes"
    return None


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

Reply with EXACTLY three lines (no extra words):
face_visible: yes
phone_detected: yes
multiple_faces: yes

Use 'no' instead of 'yes' when not detected."""
    raw = _call_claude_vision(image_base64, prompt)
    result["raw"] = raw
    if not raw:
        return result
    face_visible = _parse_yes_no_strict(raw, "face_visible")
    phone_detected = _parse_yes_no_strict(raw, "phone_detected")
    multiple_faces = _parse_yes_no_strict(raw, "multiple_faces")
    if face_visible is not None:
        result["face_visible"] = face_visible
    if phone_detected is not None:
        result["phone_detected"] = phone_detected
    if multiple_faces is not None:
        result["multiple_faces"] = multiple_faces
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
    cleaned = name.casefold()
    cleaned = re.sub(r"[^a-z0-9 ]+", " ", cleaned)  # keep word boundaries
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _tokenize_person_name(name: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", name.casefold()) if t]


def names_match(expected_name: str | None, extracted_name: str | None) -> bool:
    expected_norm = normalize_person_name(expected_name)
    extracted_norm = normalize_person_name(extracted_name)
    if not expected_norm or not extracted_norm:
        return False
    expected_tokens = _tokenize_person_name(expected_norm)
    extracted_tokens = _tokenize_person_name(extracted_norm)
    if not expected_tokens or not extracted_tokens:
        return False

    expected_set = set(expected_tokens)
    extracted_set = set(extracted_tokens)
    if expected_set == extracted_set:
        return True

    # Token overlap (order-insensitive). Require full containment of the shorter set.
    overlap = len(expected_set & extracted_set)
    shortest = min(len(expected_set), len(extracted_set))
    if shortest > 0 and overlap >= shortest:
        return True

    # Initials heuristic: tolerate "A.M" vs "A M" (or similar multi-initial forms).
    expected_initials = "".join([t for t in expected_tokens if len(t) == 1])
    extracted_initials = "".join([t for t in extracted_tokens if len(t) == 1])
    if expected_initials and expected_initials in extracted_set:
        return True
    if extracted_initials and extracted_initials in expected_set:
        return True

    return False


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
