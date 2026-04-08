from functools import lru_cache
from pathlib import Path
import os
import json
from typing import Any

from pydantic import BaseModel

# Ensure backend/.env is loaded whenever config is used (e.g. CLI or tests)
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

_frontend_env_path = _env_path.parent.parent / "Frontend" / ".env"
if _frontend_env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_frontend_env_path, override=False)


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://hire-mind-ai.vercel.app",
]


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return []

    value = raw.strip()
    if not value:
        return []

    # Support JSON array form often used in cloud env vars: ["https://a.com", "http://localhost:3000"]
    if value.startswith("["):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            pass

    return [origin.strip() for origin in value.split(",") if origin.strip()]


def _build_cors_origins() -> list[str]:
    configured = _parse_cors_origins(os.getenv("CORS_ORIGINS"))
    merged: list[str] = []
    for origin in [*DEFAULT_CORS_ORIGINS, *configured]:
        if origin not in merged:
            merged.append(origin)
    return merged


def _get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        return default


def _get_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(str(raw).strip())
    except Exception:
        return default


class Settings(BaseModel):
    app_name: str = "AI-Driven Hiring Platform API"
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = environment != "production"

    # Explicit origins required when allow_credentials=True (browsers reject "*")
    backend_cors_origins: list[str] = _build_cors_origins()

    database_url: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/ai_hiring")

    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-prod")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@platform.local")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin-change-me")

    # Plagiarism / AI detection (e.g. Claude API for code analysis). Set when key is provided.
    claude_api_key: str = os.getenv("CLAUDE_API_KEY", "")
    claude_model: str = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-latest")

    # Claude API resiliency / throttling
    # Retry for transient errors like 429/529 (rate limit / overloaded)
    claude_max_retries: int = _get_int_env("CLAUDE_MAX_RETRIES", 4)
    claude_backoff_initial_s: float = _get_float_env("CLAUDE_BACKOFF_INITIAL_S", 0.6)
    claude_backoff_max_s: float = _get_float_env("CLAUDE_BACKOFF_MAX_S", 8.0)

    # In-process request shaping to avoid bursts (helps prevent 529/429).
    # - concurrency: max in-flight Claude calls per API process
    # - rps: global requests-per-second cap per API process (0 disables)
    claude_max_concurrency: int = max(1, _get_int_env("CLAUDE_MAX_CONCURRENCY", 2))
    claude_rps: float = max(0.0, _get_float_env("CLAUDE_RPS", 3.0))
    claude_acquire_timeout_s: float = max(0.0, _get_float_env("CLAUDE_ACQUIRE_TIMEOUT_S", 10.0))

    # Proctoring tuning
    # Face match is expensive; cache/cooldown results per candidate.
    proctoring_identity_interval_s: float = max(0.0, _get_float_env("PROCTORING_IDENTITY_INTERVAL_S", 15.0))
    plagiarism_api_key: str = os.getenv("PLAGIARISM_API_KEY", "")  # alternative
    jaas_app_id: str = os.getenv("JAAS_APP_ID", "")
    jaas_api_key_id: str = os.getenv("JAAS_API_KEY_ID", "")
    jaas_private_key: str = os.getenv("JAAS_PRIVATE_KEY", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
