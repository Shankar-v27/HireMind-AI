from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.db.session import get_db
from app.models.user import User, UserRole, role_value
from app.schemas.auth import LoginRequest, RefreshRequest, Token, TokenPayload, UserMe
from app.schemas.user import UserRead


router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
settings = get_settings()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Token:
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        user_id=user.id,
    )


@router.post("/login", response_model=Token)
def login(login_req: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = authenticate_user(db, login_req.email, login_req.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        user_id=user.id,
    )


@router.post("/refresh", response_model=Token)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)) -> Token:
    try:
        data = jwt.decode(payload.refresh_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        token_data = TokenPayload(**data)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if token_data.type != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")
    user = db.query(User).get(int(token_data.sub))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    new_access = create_access_token(subject=user.id)
    new_refresh = create_refresh_token(subject=user.id)
    return Token(
        access_token=new_access,
        refresh_token=new_refresh,
        role=user.role,
        user_id=user.id,
    )


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        token_data = TokenPayload(**payload)
    except JWTError:
        raise credentials_exception
    if token_data.sub is None:
        raise credentials_exception
    user = db.query(User).get(int(token_data.sub))
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != role_value(UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_current_company(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != role_value(UserRole.COMPANY):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company access required")
    return current_user


def get_current_candidate(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != role_value(UserRole.CANDIDATE):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")
    return current_user


@router.get("/me", response_model=UserMe)
def get_me(current_user: User = Depends(get_current_active_user)) -> UserMe:
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
    )

