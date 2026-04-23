from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import SessionLocal
from app.security import get_user_for_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    user = get_user_for_token(db, credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        )

    return user


def authenticate_websocket_user(websocket: WebSocket, db: Session):
    raw_token = websocket.query_params.get("token")
    return get_user_for_token(db, raw_token)


def get_owned_session_or_404(db: Session, session_id: int, user_id: int):
    session = (
        db.query(models.Session)
        .filter(
            models.Session.id == session_id,
            models.Session.user_id == user_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def require_instructor_user(
    current_user: models.User = Depends(get_current_user),
):
    if not settings.is_instructor_email(current_user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Instructor review access is not available for this account",
        )

    return current_user
