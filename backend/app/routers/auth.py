import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.dependencies import bearer_scheme, get_current_user, get_db
from app.security import (
    build_access_token,
    hash_password,
    normalize_email,
    revoke_access_token,
    validate_email,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
logger = logging.getLogger("securestack.auth")


@router.post("/register", response_model=schemas.AuthResponse)
def register_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    if not validate_email(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")

    if len(payload.password) < settings.minimum_password_length:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Password must be at least {settings.minimum_password_length} "
                "characters long"
            ),
        )

    existing_user = db.query(models.User).filter(models.User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    display_name = (
        (payload.display_name or "").strip() or email.split("@", 1)[0]
    )
    user = models.User(
        email=email,
        display_name=display_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token, expires_at = build_access_token(db, user)
    logger.info("user_registered email=%s user_id=%s", user.email, user.id)

    return schemas.AuthResponse(
        access_token=access_token,
        token_type="bearer",
        expires_at=expires_at,
        user=user,
    )


@router.post("/login", response_model=schemas.AuthResponse)
def login_user(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token, expires_at = build_access_token(db, user)
    logger.info("user_logged_in email=%s user_id=%s", user.email, user.id)

    return schemas.AuthResponse(
        access_token=access_token,
        token_type="bearer",
        expires_at=expires_at,
        user=user,
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout_user(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    authorization: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    raw_token = authorization.credentials if authorization else None
    revoke_access_token(db, raw_token)
    logger.info("user_logged_out email=%s user_id=%s", current_user.email, current_user.id)
    return {"status": "logged_out"}
