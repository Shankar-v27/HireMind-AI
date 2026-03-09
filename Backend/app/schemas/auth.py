from pydantic import BaseModel, field_validator


# Minimal email-like check so login accepts reserved/special-use domains (e.g. admin@platform.local, user@localhost)
def _is_email_like(v: str) -> bool:
    if not v or not isinstance(v, str):
        return False
    v = v.strip()
    parts = v.split("@")
    return len(parts) == 2 and len(parts[0]) > 0 and len(parts[1]) > 0


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    role: str | None = None
    user_id: int | None = None


class TokenPayload(BaseModel):
    sub: str | None = None
    type: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        if not _is_email_like(v):
            raise ValueError("Enter a valid email address")
        return v.strip().lower()


class UserMe(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str

    class Config:
        from_attributes = True

