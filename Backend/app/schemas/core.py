from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


def _normalize_email(v: str) -> str:
    if not v or not isinstance(v, str):
        raise ValueError("Enter a valid email address")
    v = v.strip()
    parts = v.split("@")
    if len(parts) != 2 or len(parts[0]) == 0 or len(parts[1]) == 0:
        raise ValueError("Enter a valid email address")
    return v.lower()


class CompanyBase(BaseModel):
    name: str
    contact_email: str | None = None

    @field_validator("contact_email")
    @classmethod
    def contact_email_format(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return _normalize_email(v)


class CompanyCreate(CompanyBase):
    admin_email: str
    admin_password: str
    admin_full_name: str | None = None

    @field_validator("admin_email")
    @classmethod
    def admin_email_format(cls, v: str) -> str:
        return _normalize_email(v)


class CompanyRead(CompanyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class CandidateBase(BaseModel):
    email: str
    full_name: str | None = None

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        return _normalize_email(v)


class CandidateCreate(CandidateBase):
    password: str


class CandidateRead(BaseModel):
    id: int
    email: str
    full_name: str | None
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class EnrolledCandidateRead(BaseModel):
    id: int
    email: str
    full_name: str | None
    verification_status: str  # "approved" | "completed" | "pending" | "not_submitted"


class InterviewBase(BaseModel):
    name: str
    description: str | None = None


class InterviewCreate(InterviewBase):
    follow_order: bool = True
    shortlist_count: int | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None


class InterviewUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    follow_order: bool | None = None
    shortlist_count: int | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None


class InterviewRead(InterviewBase):
    id: int
    company_id: int
    status: str
    follow_order: bool = True
    shortlist_count: int | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class RoundConfig(BaseModel):
    number_of_candidates_to_shortlist: int | None = None
    duration_minutes: int | None = None
    number_of_questions: int | None = None
    difficulty: str | None = None
    domains: list[str] | None = None
    recruiter_requirements: str | None = None
    resume_summary: str | None = None
    extra: dict[str, Any] | None = None


class RoundBase(BaseModel):
    type: str
    order: int
    config: RoundConfig | None = None


class RoundCreate(RoundBase):
    weightage: float = 0
    duration_minutes: int | None = None


class RoundUpdate(BaseModel):
    type: str | None = None
    order: int | None = None
    weightage: float | None = None
    duration_minutes: int | None = None
    config: RoundConfig | None = None


class RoundConfigUpdate(BaseModel):
    recruiter_requirements: str | None = None
    resume_summary: str | None = None


class RoundRead(RoundBase):
    id: int
    interview_id: int
    status: str
    weightage: float = 0
    duration_minutes: int | None = None

    class Config:
        from_attributes = True


class QuestionBase(BaseModel):
    content: str
    type: str = "mcq"
    difficulty: str | None = None
    domain: str | None = None


class QuestionCreate(QuestionBase):
    options: dict | None = None
    correct_answer: str | None = None
    max_score: float = 1.0
    test_cases: dict | None = None
    extra_metadata: dict | None = None


class QuestionUpdate(BaseModel):
    content: str | None = None
    type: str | None = None
    difficulty: str | None = None
    domain: str | None = None
    options: dict | None = None
    correct_answer: str | None = None
    max_score: float | None = None
    test_cases: dict | None = None
    extra_metadata: dict | None = None


class QuestionRead(QuestionBase):
    id: int
    round_id: int
    options: dict | None = None
    correct_answer: str | None = None
    max_score: float = 1.0
    approved: bool = True
    test_cases: dict | None = None
    extra_metadata: dict | None = None

    class Config:
        from_attributes = True


class GenerateQuestionsRequest(BaseModel):
    count: int = 5
    difficulty: str | None = None
    domain: str | None = None


class BulkQuestionsResult(BaseModel):
    created: int
    failed: int
    errors: list[dict[str, Any]]


class ResponseCreate(BaseModel):
    question_id: int
    content: str | None = None


class ResponseRead(BaseModel):
    id: int
    candidate_id: int
    question_id: int
    content: str | None
    score: float | None
    created_at: datetime

    class Config:
        from_attributes = True


class VerificationRead(BaseModel):
    id: int
    candidate_id: int
    id_proof_url: str | None
    photo_url: str | None
    resume_url: str | None
    status: str
    ocr_data: dict | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BulkCompanyResult(BaseModel):
    created: int
    failed: int
    errors: list[dict]  # [{ "row": int, "error": str }, ...]


class BulkCandidateResult(BaseModel):
    created: int
    enrolled: int
    failed: int
    errors: list[dict]


class ResponseWithCandidate(BaseModel):
    id: int
    candidate_id: int
    candidate_email: str
    candidate_name: str | None
    question_id: int
    question_content: str
    question_type: str | None = None
    content: str | None
    score: float | None
    effective_score: float | None = None
    warning_count: int = 0
    plagiarism_warning: bool = False
    plagiarism: dict[str, Any] | None = None
    cross_plagiarism: dict[str, Any] | None = None
    created_at: datetime


class ResponseByQuestion(BaseModel):
    question_id: int
    question_content: str
    responses: list[ResponseWithCandidate]


class ResponseByCandidate(BaseModel):
    candidate_id: int
    candidate_email: str
    candidate_name: str | None
    round_id: int
    round_type: str
    responses: list[ResponseWithCandidate]


class RoundSessionRead(BaseModel):
    id: int
    candidate_id: int
    round_id: int
    interview_id: int
    status: str
    total_score: float | None = None
    max_possible_score: float | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    meeting_url: str | None = None
    meeting_room_name: str | None = None

    class Config:
        from_attributes = True


class AnswerSubmit(BaseModel):
    question_id: int
    content: str | None = None
    language: str | None = None


class RoundSubmitResult(BaseModel):
    session_id: int
    status: str
    total_score: float | None = None
    max_possible_score: float | None = None


class TopPerformerEntry(BaseModel):
    candidate_id: int
    candidate_email: str
    candidate_name: str | None
    total_weighted_score: float
    round_scores: dict[str, float]
    recommendation_status: str | None = None


class CandidateReportRequest(BaseModel):
    pass


class CandidateRoundSummary(BaseModel):
    round_id: int
    round_type: str
    round_order: int
    status: str
    score: float | None = None
    max_score: float | None = None
    normalized_score: float | None = None
    weighted_score: float | None = None
    weightage: float = 0
    notes: str | None = None
    warning_count: int = 0


class StructuredResponseDetail(BaseModel):
    response_id: int
    round_id: int | None = None
    round_type: str | None = None
    question_id: int
    question_content: str
    question_type: str
    candidate_answer: str | None = None
    selected_option: str | None = None
    selected_option_text: str | None = None
    correct_answer: str | None = None
    correct_option_text: str | None = None
    is_correct: bool | None = None
    score: float | None = None
    effective_score: float | None = None
    max_score: float | None = None
    grading_method: str | None = None
    grading_details: dict[str, Any] | None = None
    plagiarism_warning: bool = False
    plagiarism: dict[str, Any] | None = None
    cross_plagiarism: dict[str, Any] | None = None
    created_at: datetime


class CandidatePerformanceSummary(BaseModel):
    candidate_id: int
    candidate_email: str
    candidate_name: str | None = None
    verification_status: str | None = None
    overall_rank: int | None = None
    total_candidates: int = 0
    total_weighted_score: float = 0
    recommendation_status: str = "rejected"
    suitability_comment: str = ""
    score_breakdown: dict[str, float] = {}
    total_warnings: int = 0
    report: str
    rounds: list[CandidateRoundSummary]
    responses: list[StructuredResponseDetail]
    verification: VerificationRead | None = None
    proctoring_events: list[dict[str, Any]] = []


class RunCodeRequest(BaseModel):
    question_id: int
    code: str
    language: str = "python"


class RunCodeResult(BaseModel):
    passed: int
    failed: int
    total: int
    results: list[dict[str, Any]]


class LiveInterviewStartRequest(BaseModel):
    candidate_id: int


class LiveInterviewStartResponse(BaseModel):
    session_id: int
    room_name: str
    meeting_url: str
    candidate_name: str | None = None
    candidate_email: str | None = None
    jitsi_domain: str
    jitsi_jwt: str | None = None


class LiveInterviewScoreRequest(BaseModel):
    candidate_id: int
    score: float
    max_score: float = 100
    notes: str | None = None


class LiveInterviewScoreResponse(BaseModel):
    session_id: int
    candidate_id: int
    score: float
    max_score: float
    notes: str | None = None
    status: str


class LiveAssistRequest(BaseModel):
    note: str
    previous_notes: list[str] = []


class LiveAssistResponse(BaseModel):
    evaluation: str
    evaluation_rating: str
    suggested_questions: list[str]
    tip: str = ""


class CandidateLiveInterviewInfo(BaseModel):
    status: str
    message: str | None = None
    room_name: str | None = None
    meeting_url: str | None = None
    candidate_name: str | None = None
    jitsi_domain: str | None = None
    jitsi_jwt: str | None = None


class RoundsReorderRequest(BaseModel):
    round_ids: list[int]

