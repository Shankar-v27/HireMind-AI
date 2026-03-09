from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String

from app.db.session import Base


class UserRole(str, Enum):
    ADMIN = "admin"
    COMPANY = "company"
    CANDIDATE = "candidate"


def role_value(role: UserRole) -> str:
    """Use when comparing or storing role; works if role is enum or str."""
    return role.value if hasattr(role, "value") else str(role)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

