from pathlib import Path

from dotenv import load_dotenv

# Load .env from backend directory so CLAUDE_API_KEY etc. are found regardless of cwd
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")

# Optional fallback: local dev sometimes keeps EmailJS vars in Frontend/.env.
# This does not override real environment variables.
_frontend_root = _backend_root.parent / "Frontend"
load_dotenv(_frontend_root / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.session import Base, engine, SessionLocal
from app.models.user import User, UserRole
from app.routers import admin, auth, company, candidate, proctoring, round0, vapi


settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
def unhandled_exception_handler(request, exc):
    """Ensure 500 responses are JSON and go through the response pipeline (CORS headers applied)."""
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) or "Internal server error"},
    )


def _role_value(role: UserRole) -> str:
    return role.value if hasattr(role, "value") else str(role)


def seed_admin_if_missing() -> None:
    db: Session = SessionLocal()
    try:
        admin_role = _role_value(UserRole.ADMIN)
        existing = db.query(User).filter(User.role == admin_role).first()
        if existing:
            return
        admin_user = User(
            email=settings.admin_email,
            full_name="Platform Admin",
            hashed_password=get_password_hash(settings.admin_password),
            role=admin_role,
        )
        db.add(admin_user)
        db.commit()
    finally:
        db.close()


def _safe_add_column(conn, table: str, column: str, col_type: str) -> None:
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        conn.commit()
    except Exception as e:
        if "already exists" not in str(e).lower() and "duplicate" not in str(e).lower():
            raise
        conn.rollback()


def ensure_schema_migrations() -> None:
    """Add columns that may be missing from earlier DB schemas."""
    with engine.connect() as conn:
        _safe_add_column(conn, "questions", "extra_metadata", "JSONB")
        _safe_add_column(conn, "questions", "options", "JSONB")
        _safe_add_column(conn, "questions", "correct_answer", "TEXT")
        _safe_add_column(conn, "questions", "max_score", "FLOAT DEFAULT 1.0")
        _safe_add_column(conn, "questions", "approved", "BOOLEAN DEFAULT TRUE")
        _safe_add_column(conn, "interviews", "description", "TEXT")
        _safe_add_column(conn, "interviews", "follow_order", "BOOLEAN DEFAULT TRUE")
        _safe_add_column(conn, "interviews", "shortlist_count", "INTEGER")
        _safe_add_column(conn, "interviews", "scheduled_start", "TIMESTAMP")
        _safe_add_column(conn, "interviews", "scheduled_end", "TIMESTAMP")
        _safe_add_column(conn, "rounds", "weightage", "FLOAT DEFAULT 0")
        _safe_add_column(conn, "rounds", "duration_minutes", "INTEGER")
        _safe_add_column(conn, "responses", "round_id", "INTEGER")
        _safe_add_column(conn, "responses", "interview_id", "INTEGER")
        _safe_add_column(conn, "responses", "language", "VARCHAR(50)")
        _safe_add_column(conn, "responses", "grading_method", "VARCHAR(50)")
        _safe_add_column(conn, "responses", "grading_details", "JSONB")
        _safe_add_column(conn, "round_sessions", "meeting_url", "TEXT")
        _safe_add_column(conn, "round_sessions", "meeting_room_name", "VARCHAR(255)")
        _safe_add_column(conn, "round0_candidates", "resume_text", "TEXT")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema_migrations()
    seed_admin_if_missing()


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(company.router)
app.include_router(candidate.router)
app.include_router(proctoring.router)
app.include_router(round0.router)
app.include_router(vapi.router)

