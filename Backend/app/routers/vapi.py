from __future__ import annotations

import csv
import logging
import os
import threading
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

import requests


logger = logging.getLogger(__name__)
router = APIRouter(tags=["vapi"])

_csv_lock = threading.Lock()


class VapiWebhookPayload(BaseModel):
    call_id: str


def get_vapi_call_details(call_id: str) -> dict[str, Any]:
    """Fetch call details from Vapi API for a given call_id."""
    api_key = os.getenv("VAPI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("VAPI_API_KEY is not configured")

    base_url = os.getenv("VAPI_BASE_URL", "https://api.vapi.ai").strip() or "https://api.vapi.ai"
    url = f"{base_url.rstrip('/')}/call/{call_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected Vapi API response shape")
    return data


def _messages_to_transcript(messages: Any) -> str:
    if not messages or not isinstance(messages, list):
        return "No conversation"
    lines: list[str] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        text = msg.get("message")
        if text is None:
            # best-effort compatibility with alternate shapes
            text = msg.get("content") or msg.get("text")
        if isinstance(text, str) and text.strip():
            lines.append(text.strip())
    return "\n".join(lines) if lines else "No conversation"


def _csv_path() -> Path:
    # Repo root: <root>/Backend/app/routers/vapi.py -> parents[3] == <root>
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "interviews.csv"


def _append_row(call_id: str, transcript: str) -> None:
    path = _csv_path()
    file_exists = os.path.exists(path)
    file_empty = (not file_exists) or os.path.getsize(path) == 0

    with _csv_lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, mode="a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            if file_empty:
                writer.writerow(["call_id", "transcript"])
            writer.writerow([call_id, transcript])


def _ensure_csv_exists() -> Path:
    """Ensure interviews.csv exists and has a header row."""
    path = _csv_path()
    file_exists = os.path.exists(path)
    file_empty = (not file_exists) or os.path.getsize(path) == 0

    if not file_empty:
        return path

    with _csv_lock:
        file_exists = os.path.exists(path)
        file_empty = (not file_exists) or os.path.getsize(path) == 0
        if not file_empty:
            return path

        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, mode="a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["call_id", "transcript"])
    return path


@router.post("/vapi/webhook")
def vapi_webhook(payload: VapiWebhookPayload):
    logger.info("Vapi webhook received call_id=%s", payload.call_id)

    transcript = "Failed to fetch transcript"
    try:
        call_details = get_vapi_call_details(payload.call_id)
        transcript = _messages_to_transcript(call_details.get("messages"))
    except Exception as exc:
        logger.warning("Failed to fetch Vapi transcript for call_id=%s: %s", payload.call_id, exc)

    try:
        _append_row(payload.call_id, transcript)
    except Exception as exc:
        logger.exception("Failed to append interview row to CSV: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store interview data") from exc

    return {"status": "success"}


@router.get("/download-csv")
def download_csv():
    path = _ensure_csv_exists()

    return FileResponse(
        path=str(path),
        media_type="text/csv; charset=utf-8",
        filename="interviews.csv",
    )
