from __future__ import annotations

import csv
import logging
import os
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel


logger = logging.getLogger(__name__)
router = APIRouter(tags=["vapi"])

_csv_lock = threading.Lock()


class VapiWebhookPayload(BaseModel):
    call_id: str
    transcript: str


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
    # Basic logging (avoid printing full transcript in logs)
    logger.info(
        "Vapi webhook received call_id=%s transcript_len=%d",
        payload.call_id,
        len(payload.transcript or ""),
    )

    try:
        _append_row(payload.call_id, payload.transcript)
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
