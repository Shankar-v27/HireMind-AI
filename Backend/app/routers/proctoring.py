from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.core import Candidate, ProctoringEvent, Round, Strike, Verification
from app.models.user import User
from app.routers.auth import get_current_candidate
from app.services.claude_vision import analyze_proctor_frame, face_match


router = APIRouter(prefix="/proctoring", tags=["proctoring"])

# Event types that each count as one warning (strike). 3+ strikes = disqualified.
PROCTORING_EVENT_TYPES = (
    "tab_switch",           # User switched tab/window
    "fullscreen_exit",      # User exited fullscreen
    "face_not_visible_10s", # Face not visible for 10 seconds
    "external_voice",       # External voice detected continuously
    "logout",               # User logged out during round (max 3 logouts allowed)
    "phone_detected",       # Phone/smartphone visible in camera (Claude Vision / MediaPipe)
    "multiple_faces",       # More than one person visible in camera
    "identity_mismatch",    # Candidate face does not match verified reference photo
)


class ProctoringEventPayload(BaseModel):
    interview_id: int
    round_id: int
    type: str  # one of PROCTORING_EVENT_TYPES
    confidence: float | None = None
    data: dict | None = None


@router.post("/events")
def submit_proctoring_event(
    payload: ProctoringEventPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    # Basic validation that round belongs to interview
    round_obj = (
        db.query(Round)
        .filter(Round.id == payload.round_id, Round.interview_id == payload.interview_id)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found for interview")
    if payload.type not in PROCTORING_EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid event type. Allowed: {list(PROCTORING_EVENT_TYPES)}")

    candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    # Record event
    event = ProctoringEvent(
        candidate_id=candidate.id,
        interview_id=payload.interview_id,
        round_id=payload.round_id,
        type=payload.type,
        confidence=payload.confidence,
        data=payload.data,
    )
    db.add(event)

    # Update strike count
    strike = (
        db.query(Strike)
        .filter(
            Strike.candidate_id == candidate.id,
            Strike.interview_id == payload.interview_id,
            Strike.round_id == payload.round_id,
        )
        .first()
    )
    if not strike:
        strike = Strike(
            candidate_id=candidate.id,
            interview_id=payload.interview_id,
            round_id=payload.round_id,
            strikes=0,
        )
        db.add(strike)

    if strike.status != "disqualified":
        strike.strikes += 1
        if strike.strikes > 3:
            strike.status = "disqualified"

    db.commit()
    db.refresh(strike)

    return {
        "strikes": strike.strikes,
        "status": strike.status,
        "disqualified": strike.status == "disqualified",
    }


class AnalyzeFramePayload(BaseModel):
    image_base64: str  # base64-encoded JPEG (optional data URL prefix allowed)


@router.post("/analyze-frame")
def analyze_frame(
    payload: AnalyzeFramePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    """
    Analyze a single webcam frame using Claude Vision.
    Returns face_visible, phone_detected, multiple_faces for client to decide whether to report events.
    """
    result = analyze_proctor_frame(payload.image_base64)
    candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first() if candidate else None
    reference_photo = None
    if verification and verification.ocr_data:
        reference_photo = (verification.ocr_data or {}).get("reference_photo_base64")
    if not reference_photo and verification and verification.photo_url and verification.photo_url.startswith("data:"):
        reference_photo = verification.photo_url
    identity_match = None
    identity_confidence = None
    if reference_photo and result["face_visible"]:
        match_result = face_match(reference_photo, payload.image_base64)
        identity_match = match_result.get("match")
        identity_confidence = match_result.get("confidence")
    return {
        "face_visible": result["face_visible"],
        "phone_detected": result["phone_detected"],
        "multiple_faces": result["multiple_faces"],
        "identity_match": identity_match,
        "identity_confidence": identity_confidence,
    }


@router.get("/status")
def get_proctoring_status(
    interview_id: int,
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    """Return current strikes and whether candidate is disqualified for this round."""
    round_obj = (
        db.query(Round)
        .filter(Round.id == round_id, Round.interview_id == interview_id)
        .first()
    )
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found for interview")
    candidate = db.query(Candidate).filter(Candidate.user_id == current_user.id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    strike = (
        db.query(Strike)
        .filter(
            Strike.candidate_id == candidate.id,
            Strike.interview_id == interview_id,
            Strike.round_id == round_id,
        )
        .first()
    )
    if not strike:
        return {"strikes": 0, "status": "active", "disqualified": False}
    return {
        "strikes": strike.strikes,
        "status": strike.status,
        "disqualified": strike.status == "disqualified",
    }

