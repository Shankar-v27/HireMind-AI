from functools import lru_cache
from pathlib import Path
import os

from pydantic import BaseModel

# Ensure backend/.env is loaded whenever config is used (e.g. CLI or tests)
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)


class Settings(BaseModel):
    app_name: str = "AI-Driven Hiring Platform API"
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = environment != "production"

    # Explicit origins required when allow_credentials=True (browsers reject "*")
    backend_cors_origins: list[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://hire-mind-ai.vercel.app/").split(",") if o.strip()]

    database_url: str = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/ai_hiring")

    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-prod")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@platform.local")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin-change-me")

    # Plagiarism / AI detection (e.g. Claude API for code analysis). Set when key is provided.
    claude_api_key: str = os.getenv("CLAUDE_API_KEY", "")
    claude_model: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")  # current; override with CLAUDE_MODEL if needed
    plagiarism_api_key: str = os.getenv("PLAGIARISM_API_KEY", "")  # alternative
    jaas_app_id: str = os.getenv("JAAS_APP_ID", "")
    jaas_api_key_id: str = os.getenv("JAAS_API_KEY_ID", "")
    jaas_private_key: str = os.getenv("JAAS_PRIVATE_KEY", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
