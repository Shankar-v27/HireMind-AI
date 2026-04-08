import threading
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.core import (
    Candidate, GDSession, Interview, InterviewCandidate, Question,
    Round, Response, RoundSession, Strike, Verification,
)
from app.models.user import User
from app.routers.auth import get_current_candidate
from app.schemas.core import (
    AnswerSubmit,
    CandidateLiveInterviewInfo,
    CandidateRead,
    InterviewRead,
    QuestionRead,
    ResponseCreate,
    ResponseRead,
    RoundRead,
    RoundSessionRead,
    RoundSubmitResult,
    RunCodeRequest,
    RunCodeResult,
    VerificationRead,
)


router = APIRouter(prefix="/candidate", tags=["candidate"])


def get_candidate_for_user(db: Session, user: User) -> Candidate:
    candidate = db.query(Candidate).filter(Candidate.user_id == user.id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
    return candidate


@router.get("/me", response_model=CandidateRead)
def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> CandidateRead:
    candidate = get_candidate_for_user(db, current_user)
    return CandidateRead(
        id=candidate.id,
        email=current_user.email,
        full_name=current_user.full_name,
        company_id=candidate.company_id,
        created_at=candidate.created_at,
    )


@router.get("/interviews", response_model=List[InterviewRead])
def list_my_interviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> List[InterviewRead]:
    candidate = get_candidate_for_user(db, current_user)
    links = db.query(InterviewCandidate).filter(InterviewCandidate.candidate_id == candidate.id).all()
    interview_ids = [l.interview_id for l in links]
    if not interview_ids:
        return []
    interviews = db.query(Interview).filter(Interview.id.in_(interview_ids)).all()
    return interviews


def _require_verification_completed(db: Session, candidate: Candidate) -> None:
    """Raise 403 if candidate has not completed verification (required to attend any round)."""
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
    if not verification or verification.status not in ("completed", "approved"):
        raise HTTPException(
            status_code=403,
            detail="You must complete identity verification before attending any interview round. Go to Verification and submit ID proof and photo.",
        )


def _require_hr_verified(db: Session, candidate: Candidate) -> None:
    """Raise 403 if candidate has not been approved (face match) for HR rounds."""
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
    if not verification or verification.status != "approved":
        raise HTTPException(
            status_code=403,
            detail="Identity verification (face match approved) is required for HR rounds. Complete verification and ensure your photo matches your ID.",
        )


@router.get("/interviews/{interview_id}/rounds/{round_id}", response_model=RoundRead)
def get_round_for_me(
    interview_id: int,
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> RoundRead:
    candidate = get_candidate_for_user(db, current_user)
    link = (
        db.query(InterviewCandidate)
        .filter(
            InterviewCandidate.candidate_id == candidate.id,
            InterviewCandidate.interview_id == interview_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")
    round_obj = db.query(Round).filter(Round.id == round_id, Round.interview_id == interview_id).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    _require_verification_completed(db, candidate)
    if round_obj.type == "HR_INTERVIEW":
        _require_hr_verified(db, candidate)
    return round_obj


@router.get("/interviews/{interview_id}/rounds/{round_id}/questions", response_model=List[QuestionRead])
def list_round_questions_for_me(
    interview_id: int,
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> List[QuestionRead]:
    candidate = get_candidate_for_user(db, current_user)
    link = (
        db.query(InterviewCandidate)
        .filter(
            InterviewCandidate.candidate_id == candidate.id,
            InterviewCandidate.interview_id == interview_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")
    round_obj = db.query(Round).filter(Round.id == round_id, Round.interview_id == interview_id).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    _require_verification_completed(db, candidate)
    if round_obj.type == "HR_INTERVIEW":
        _require_hr_verified(db, candidate)
    questions = db.query(Question).filter(Question.round_id == round_id).all()
    return questions


class TechInterviewTurnRequest(BaseModel):
    conversation: list[dict[str, Any]] = []
    candidate_response: str = ""


class TechInterviewTurnResponse(BaseModel):
    question: str
    analysis: str
    done: bool


@router.post(
    "/interviews/{interview_id}/rounds/{round_id}/tech-turn",
    response_model=TechInterviewTurnResponse,
)
def post_tech_interview_turn(
    interview_id: int,
    round_id: int,
    payload: TechInterviewTurnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> TechInterviewTurnResponse:
    candidate = get_candidate_for_user(db, current_user)
    link = (
        db.query(InterviewCandidate)
        .filter(
            InterviewCandidate.candidate_id == candidate.id,
            InterviewCandidate.interview_id == interview_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")
    round_obj = db.query(Round).filter(Round.id == round_id, Round.interview_id == interview_id).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    _require_verification_completed(db, candidate)
    if round_obj.type == "HR_INTERVIEW":
        _require_hr_verified(db, candidate)
        from app.services.hr_interview import hr_interview_turn as do_turn
        recruiter_requirements = (round_obj.config or {}).get("recruiter_requirements") or ""
        resume_text = (round_obj.config or {}).get("resume_summary") or ""
        ver = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
        if ver and not resume_text:
            ocr = ver.ocr_data or {}
            resume_text = ocr.get("resume_text") or ""
        if not resume_text and ver and ver.resume_url:
            resume_text = f"Resume URL: {ver.resume_url}"
        is_first = len(payload.conversation) == 0 and not (payload.candidate_response or "").strip()
        result = do_turn(
            recruiter_requirements=recruiter_requirements,
            resume_text=resume_text or "Not provided",
            candidate_name=current_user.full_name or current_user.email,
            conversation=payload.conversation,
            candidate_response=payload.candidate_response or "",
            is_first=is_first,
        )
        return TechInterviewTurnResponse(**result)
    if round_obj.type != "TECH_INTERVIEW":
        raise HTTPException(status_code=400, detail="This endpoint is for tech or HR (voice) rounds only")
    from app.services.tech_interview import tech_interview_turn as do_turn
    is_first = len(payload.conversation) == 0 and not (payload.candidate_response or "").strip()
    result = do_turn(
        round_type=round_obj.type,
        conversation=payload.conversation,
        candidate_response=payload.candidate_response or "",
        is_first=is_first,
    )
    return TechInterviewTurnResponse(**result)


def _check_follow_order(db: Session, candidate: Candidate, interview: Interview, target_round: Round) -> None:
    """If follow_order is enabled, ensure all prior rounds are submitted."""
    if not interview.follow_order:
        return
    prior_rounds = (
        db.query(Round)
        .filter(Round.interview_id == interview.id, Round.order < target_round.order)
        .all()
    )
    for pr in prior_rounds:
        sess = db.query(RoundSession).filter(
            RoundSession.round_id == pr.id,
            RoundSession.candidate_id == candidate.id,
        ).first()
        if not sess or sess.status != "submitted":
            raise HTTPException(
                status_code=400,
                detail=f"Complete round '{pr.type}' (order {pr.order}) before starting this round",
            )


@router.post("/rounds/{round_id}/start", response_model=RoundSessionRead)
def start_round_session(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> RoundSessionRead:
    candidate = get_candidate_for_user(db, current_user)
    _require_verification_completed(db, candidate)
    round_obj = db.query(Round).filter(Round.id == round_id).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    link = db.query(InterviewCandidate).filter(
        InterviewCandidate.candidate_id == candidate.id,
        InterviewCandidate.interview_id == round_obj.interview_id,
    ).first()
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")
    interview = db.query(Interview).filter(Interview.id == round_obj.interview_id).first()
    if interview and interview.status not in ("active", "in_progress"):
        raise HTTPException(status_code=400, detail="Interview is not active")

    _check_follow_order(db, candidate, interview, round_obj)

    existing = db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()
    if existing:
        return existing

    questions = db.query(Question).filter(
        Question.round_id == round_id, Question.approved == True
    ).all()
    q_ids = [q.id for q in questions]
    max_score = sum(q.max_score for q in questions)

    session = RoundSession(
        candidate_id=candidate.id,
        round_id=round_id,
        interview_id=round_obj.interview_id,
        status="in_progress",
        question_ids=q_ids,
        max_possible_score=max_score,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    if interview and interview.status == "active":
        interview.status = "in_progress"
    db.commit()
    db.refresh(session)
    return session


@router.get("/rounds/{round_id}/session", response_model=RoundSessionRead | None)
def get_round_session(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> RoundSessionRead | None:
    candidate = get_candidate_for_user(db, current_user)
    return db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()


@router.post("/rounds/{round_id}/answer")
def submit_answer(
    round_id: int,
    payload: AnswerSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    """Submit or update an answer for a single question within a round session."""
    candidate = get_candidate_for_user(db, current_user)
    session = db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()
    if not session or session.status == "submitted":
        raise HTTPException(status_code=400, detail="No active session or already submitted")

    question = db.query(Question).filter(Question.id == payload.question_id).first()
    if not question or question.round_id != round_id:
        raise HTTPException(status_code=400, detail="Question not in this round")

    existing = db.query(Response).filter(
        Response.candidate_id == candidate.id,
        Response.question_id == payload.question_id,
    ).first()
    if existing:
        existing.content = payload.content
        existing.language = payload.language
    else:
        resp = Response(
            candidate_id=candidate.id,
            question_id=payload.question_id,
            round_id=round_id,
            interview_id=session.interview_id,
            content=payload.content,
            language=payload.language,
        )
        db.add(resp)
    db.commit()
    return {"ok": True}


@router.post("/rounds/{round_id}/submit", response_model=RoundSubmitResult)
async def submit_round(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> RoundSubmitResult:
    """Submit the round: grade all answers and finalize."""
    candidate = get_candidate_for_user(db, current_user)
    session = db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()
    if not session:
        raise HTTPException(status_code=400, detail="No session found. Start the round first.")
    if session.status == "submitted":
        return RoundSubmitResult(
            session_id=session.id,
            status="submitted",
            total_score=session.total_score,
            max_possible_score=session.max_possible_score,
        )

    from app.services.grading_service import auto_grade

    round_obj = db.query(Round).filter(Round.id == round_id).first()
    questions = db.query(Question).filter(
        Question.round_id == round_id, Question.approved == True
    ).all()

    total_score = 0.0
    for q in questions:
        resp = db.query(Response).filter(
            Response.candidate_id == candidate.id,
            Response.question_id == q.id,
        ).first()
        if not resp or not resp.content:
            continue

        grade = await auto_grade(
            question_type=q.type,
            response_content=resp.content,
            question_content=q.content,
            correct_answer=q.correct_answer or (q.extra_metadata or {}).get("model_answer"),
            test_cases_json=q.test_cases,
            max_score=q.max_score,
            language=resp.language,
        )
        resp.score = grade["score"]
        resp.grading_method = grade["method"]
        resp.grading_details = grade.get("details")
        total_score += grade["score"]

    if round_obj and round_obj.type == "CODING":
        from app.services.plagiarism import check_code_plagiarism, check_cross_plagiarism, has_plagiarism_warning
        for q in questions:
            resp = db.query(Response).filter(
                Response.candidate_id == candidate.id,
                Response.question_id == q.id,
            ).first()
            if not resp or not resp.content:
                continue
            flags = dict(resp.flags or {})
            pl = check_code_plagiarism(resp.content, q.id, candidate.id)
            flags["plagiarism"] = pl
            others = [
                (r.candidate_id, r.content or "")
                for r in db.query(Response).filter(
                    Response.question_id == q.id,
                    Response.candidate_id != candidate.id,
                ).all()
            ]
            cross = check_cross_plagiarism(resp.content, q.id, candidate.id, others)
            flags["cross_plagiarism"] = cross
            resp.flags = flags
            if has_plagiarism_warning(flags):
                resp.score = 0
                details = dict(resp.grading_details or {})
                details["plagiarism_penalty_applied"] = True
                resp.grading_details = details
                resp.grading_method = (resp.grading_method or "auto_code") + "_plagiarism_zeroed"

    if round_obj and round_obj.type == "CODING":
        total_score = sum(
            float(r.score or 0)
            for r in db.query(Response).filter(
                Response.candidate_id == candidate.id,
                Response.round_id == round_id,
            ).all()
        )

    session.total_score = round(total_score, 2)
    session.status = "submitted"
    session.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return RoundSubmitResult(
        session_id=session.id,
        status=session.status,
        total_score=session.total_score,
        max_possible_score=session.max_possible_score,
    )


@router.post("/rounds/{round_id}/run-code", response_model=RunCodeResult)
def run_code_endpoint(
    round_id: int,
    payload: RunCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> RunCodeResult:
    """Run code against visible test cases only (public test cases)."""
    candidate = get_candidate_for_user(db, current_user)
    session = db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()
    if not session or session.status == "submitted":
        raise HTTPException(status_code=400, detail="No active session")

    if payload.question_id not in (session.question_ids or []):
        raise HTTPException(status_code=400, detail="Question is not part of this round session")
    question = db.query(Question).filter(Question.id == payload.question_id, Question.round_id == round_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    test_case_payload = question.test_cases or {}
    public_tests = []
    if isinstance(test_case_payload, dict):
        public_tests = test_case_payload.get("public") or test_case_payload.get("visible") or []
    if not public_tests:
        raise HTTPException(status_code=400, detail="No visible test cases are available for this question")

    from app.services.code_execution import run_code_against_tests
    result = run_code_against_tests(payload.code, payload.language, public_tests)
    return RunCodeResult(
        passed=result.passed,
        failed=result.failed,
        total=result.total,
        results=result.results,
    )


@router.get("/rounds/{round_id}/live-info", response_model=CandidateLiveInterviewInfo)
def get_live_round_info(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> CandidateLiveInterviewInfo:
    from app.services.jitsi_jwt_service import generate_jitsi_jwt, get_jitsi_domain, get_jitsi_room_name

    candidate = get_candidate_for_user(db, current_user)
    round_obj = db.query(Round).filter(Round.id == round_id).first()
    if not round_obj or round_obj.type != "LIVE_INTERVIEW":
        raise HTTPException(status_code=404, detail="Live interview round not found")
    link = db.query(InterviewCandidate).filter(
        InterviewCandidate.candidate_id == candidate.id,
        InterviewCandidate.interview_id == round_obj.interview_id,
    ).first()
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")
    _require_verification_completed(db, candidate)
    session = db.query(RoundSession).filter(
        RoundSession.candidate_id == candidate.id,
        RoundSession.round_id == round_id,
    ).first()
    domain = get_jitsi_domain()
    if not session or not session.meeting_room_name:
        return CandidateLiveInterviewInfo(
            status="waiting",
            message="The interviewer has not started the live interview yet. Please wait.",
            candidate_name=current_user.full_name or current_user.email,
            jitsi_domain=domain,
        )
    full_room = get_jitsi_room_name(session.meeting_room_name)
    candidate_jwt = generate_jitsi_jwt(session.meeting_room_name, current_user.full_name or current_user.email, current_user.email, False)
    return CandidateLiveInterviewInfo(
        status=session.status,
        room_name=full_room,
        meeting_url=session.meeting_url or f"https://{domain}/{full_room}",
        candidate_name=current_user.full_name or current_user.email,
        jitsi_domain=domain,
        jitsi_jwt=candidate_jwt,
    )


@router.get("/interviews/{interview_id}/rounds", response_model=List[RoundRead])
def list_rounds_for_my_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> List[RoundRead]:
    candidate = get_candidate_for_user(db, current_user)
    link = (
        db.query(InterviewCandidate)
        .filter(
            InterviewCandidate.candidate_id == candidate.id,
            InterviewCandidate.interview_id == interview_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")

    rounds = (
        db.query(Round)
        .filter(Round.interview_id == interview_id)
        .order_by(Round.order.asc())
        .all()
    )
    return rounds


@router.post(
    "/interviews/{interview_id}/rounds/{round_id}/responses",
    response_model=List[ResponseRead],
)
def submit_round_responses(
    interview_id: int,
    round_id: int,
    responses: List[ResponseCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> List[ResponseRead]:
    candidate = get_candidate_for_user(db, current_user)

    link = (
        db.query(InterviewCandidate)
        .filter(
            InterviewCandidate.candidate_id == candidate.id,
            InterviewCandidate.interview_id == interview_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not enrolled in this interview")

    round_obj = db.query(Round).filter(Round.id == round_id, Round.interview_id == interview_id).first()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    _require_verification_completed(db, candidate)
    if round_obj.type == "HR_INTERVIEW":
        _require_hr_verified(db, candidate)

    created: list[Response] = []
    for r in responses:
        resp = Response(
            candidate_id=candidate.id,
            question_id=r.question_id,
            content=r.content,
        )
        db.add(resp)
        created.append(resp)

    db.flush()

    # Plagiarism and cross-plagiarism for coding rounds
    if round_obj.type == "CODING":
        from app.services.plagiarism import check_code_plagiarism, check_cross_plagiarism
        for resp in created:
            if not resp.content or not resp.content.strip():
                continue
            flags: dict = {}
            pl = check_code_plagiarism(resp.content, resp.question_id, candidate.id)
            flags["plagiarism"] = pl
            other_list = [
                (o.candidate_id, o.content or "")
                for o in db.query(Response).filter(
                    Response.question_id == resp.question_id,
                    Response.candidate_id != candidate.id,
                ).all()
            ]
            cross = check_cross_plagiarism(resp.content, resp.question_id, candidate.id, other_list)
            flags["cross_plagiarism"] = cross
            resp.flags = flags
            if pl.get("warning") or cross.get("warning"):
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
                    strike = Strike(
                        candidate_id=candidate.id,
                        interview_id=interview_id,
                        round_id=round_id,
                        strikes=0,
                    )
                    db.add(strike)
                if strike.status != "disqualified":
                    strike.strikes += 1
                    if strike.strikes >= 3:
                        strike.status = "disqualified"

    db.commit()
    for resp in created:
        db.refresh(resp)

    return created


# ---- GD Endpoints for Candidates ----
@router.get("/rounds/{round_id}/gd-info")
def get_gd_info(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    candidate = get_candidate_for_user(db, current_user)
    gd = db.query(GDSession).filter(GDSession.round_id == round_id).first()
    if not gd:
        raise HTTPException(status_code=404, detail="No GD session for this round")
    is_participant = candidate.id in (gd.participant_ids or [])
    return {
        "id": gd.id,
        "topic": gd.topic,
        "status": gd.status,
        "is_participant": is_participant,
        "turn_number": gd.turn_number,
        "total_turns": gd.total_turns,
    }


@router.post("/rounds/{round_id}/gd/join")
def join_gd(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    candidate = get_candidate_for_user(db, current_user)
    gd = db.query(GDSession).filter(GDSession.round_id == round_id).first()
    if not gd:
        raise HTTPException(status_code=404, detail="No GD session for this round")
    if gd.status == "ended":
        raise HTTPException(status_code=400, detail="GD session has ended")
    participants = list(gd.participant_ids or [])
    if candidate.id not in participants:
        participants.append(candidate.id)
        gd.participant_ids = participants
    if gd.status == "waiting":
        gd.status = "active"
    db.commit()
    return {"ok": True, "status": gd.status}


@router.get("/rounds/{round_id}/gd/messages")
def get_gd_messages(
    round_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    gd = db.query(GDSession).filter(GDSession.round_id == round_id).first()
    if not gd:
        raise HTTPException(status_code=404, detail="No GD session for this round")
    return {"messages": gd.messages or [], "topic": gd.topic, "status": gd.status}


class GDChatRequest(BaseModel):
    text: str


@router.post("/rounds/{round_id}/gd/chat")
def gd_chat(
    round_id: int,
    payload: GDChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    candidate = get_candidate_for_user(db, current_user)
    gd = db.query(GDSession).filter(GDSession.round_id == round_id).first()
    if not gd:
        raise HTTPException(status_code=404, detail="No GD session for this round")
    if gd.status == "ended":
        raise HTTPException(status_code=400, detail="GD session has ended")

    messages = list(gd.messages or [])
    speaker = current_user.full_name or current_user.email
    messages.append({
        "speaker": speaker,
        "candidate_id": candidate.id,
        "text": payload.text,
        "turn": gd.turn_number,
    })
    gd.turn_number += 1

    moderator_response = None
    if gd.turn_number % 3 == 0 or gd.turn_number >= gd.total_turns:
        from app.services.gd_moderator import moderate_gd_turn
        participant_names = []
        for pid in (gd.participant_ids or []):
            c = db.query(Candidate).filter(Candidate.id == pid).first()
            if c:
                participant_names.append(c.user.full_name or c.user.email)
        mod = moderate_gd_turn(gd.topic, messages, participant_names, gd.turn_number, gd.total_turns)
        messages.append({"speaker": "Moderator (AI)", "text": mod["message"], "turn": gd.turn_number})
        gd.turn_number += 1
        moderator_response = mod["message"]

    if gd.turn_number >= gd.total_turns:
        gd.status = "ended"

    gd.messages = messages
    db.commit()
    return {
        "ok": True,
        "moderator_response": moderator_response,
        "status": gd.status,
        "turn_number": gd.turn_number,
    }


class VerificationPayload(BaseModel):
    id_proof_url: str | None = None
    photo_url: str | None = None
    resume_url: str | None = None
    resume_base64: str | None = None
    ocr_data: dict | None = None
    id_proof_base64: str | None = None
    photo_base64: str | None = None


def _sanitized_verification_read(verification: Verification | None) -> VerificationRead | None:
    if not verification:
        return None
    ocr_data = dict(verification.ocr_data or {})
    ocr_data.pop("reference_photo_base64", None)
    ocr_data.pop("reference_id_base64", None)
    return VerificationRead(
        id=verification.id,
        candidate_id=verification.candidate_id,
        id_proof_url=verification.id_proof_url,
        photo_url=verification.photo_url,
        resume_url=verification.resume_url,
        status=verification.status,
        ocr_data=ocr_data or None,
        created_at=verification.created_at,
        updated_at=verification.updated_at,
    )


@router.get("/verification", response_model=VerificationRead | None)
def get_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> VerificationRead | None:
    candidate = get_candidate_for_user(db, current_user)
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
    return _sanitized_verification_read(verification)


@router.post("/verification", response_model=VerificationRead)
def upsert_verification(
    payload: VerificationPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> VerificationRead:
    candidate = get_candidate_for_user(db, current_user)
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
    if not verification:
        verification = Verification(candidate_id=candidate.id)
        db.add(verification)
        db.flush()

    verification.id_proof_url = payload.id_proof_url
    verification.photo_url = payload.photo_url
    verification.resume_url = payload.resume_url
    ocr_data = dict(payload.ocr_data or {})

    if payload.id_proof_base64 and payload.photo_base64:
        from app.services.claude_vision import extract_id_name, face_match, names_match
        ocr_data["reference_photo_base64"] = payload.photo_base64
        ocr_data["reference_id_base64"] = payload.id_proof_base64
        id_name_result = extract_id_name(payload.id_proof_base64)
        expected_name = current_user.full_name or current_user.email.split("@", 1)[0]
        extracted_name = id_name_result.get("extracted_name")
        name_match_result = names_match(expected_name, extracted_name) if extracted_name else False
        ocr_data["id_name_check"] = {
            "expected_name": expected_name,
            "extracted_name": extracted_name,
            "checked": id_name_result.get("checked", False),
            "match": name_match_result if extracted_name else None,
        }
        fm = face_match(payload.id_proof_base64, payload.photo_base64)
        ocr_data["face_match"] = {
            "confidence": fm.get("confidence"),
            "match": fm.get("match"),
            "checked": fm.get("checked"),
            "error": fm.get("error"),
            "raw": fm.get("raw"),
        }
        id_name_ok = ocr_data["id_name_check"]["match"] is not False
        confidence = fm.get("confidence")
        face_ok = fm.get("match") is True or (isinstance(confidence, (int, float)) and confidence >= 0.75)
        if face_ok and id_name_ok:
            verification.status = "approved"
        else:
            verification.status = "completed"
    else:
        verification.status = "completed"
    verification.ocr_data = ocr_data or None

    db.commit()
    db.refresh(verification)

    # Run resume OCR in background so response returns quickly
    if payload.resume_base64:
        verification_id = verification.id
        resume_b64 = payload.resume_base64

        def _background_resume_ocr() -> None:
            from app.db.session import SessionLocal
            from app.services.resume_extractor import extract_resume_text
            try:
                resume_text = extract_resume_text(resume_b64)
                if not resume_text:
                    return
                session = SessionLocal()
                try:
                    v = session.query(Verification).filter(Verification.id == verification_id).first()
                    if v and v.ocr_data is not None:
                        data = dict(v.ocr_data)
                        data["resume_text"] = resume_text
                        v.ocr_data = data
                        session.commit()
                finally:
                    session.close()
            except Exception:
                pass

        threading.Thread(target=_background_resume_ocr, daemon=True).start()

    return _sanitized_verification_read(verification)


class ReverifyPayload(BaseModel):
    photo_base64: str


@router.post("/verification/reverify")
def reverify_photo(
    payload: ReverifyPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_candidate),
) -> dict:
    """Re-verify identity with a new photo only (e.g. after tab switch or re-login). Compares with stored ID."""
    candidate = get_candidate_for_user(db, current_user)
    verification = db.query(Verification).filter(Verification.candidate_id == candidate.id).first()
    if not verification or verification.status not in ("completed", "approved"):
        raise HTTPException(status_code=403, detail="Complete full verification first (ID + photo).")
    ocr_data = verification.ocr_data or {}
    id_base64 = ocr_data.get("reference_id_base64")
    if not id_base64:
        raise HTTPException(status_code=400, detail="No stored ID proof for re-verification. Complete full verification again.")
    from app.services.claude_vision import face_match
    fm = face_match(id_base64, payload.photo_base64)
    confidence = fm.get("confidence") or 0
    match = fm.get("match") is True or confidence >= 0.75
    if not match:
        raise HTTPException(
            status_code=400,
            detail=f"Photo does not match the identity on file. Please ensure your face is clearly visible. (confidence: {confidence:.0%})",
        )
    return {"ok": True, "message": "Re-verification successful."}

