import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import models
from app.config import settings


def hash_access_token(raw_token: str) -> str:
    payload = f"{settings.auth_token_secret}:{raw_token}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> bool:
    return "@" in email and "." in email.split("@")[-1]


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        settings.password_iterations,
    )
    return (
        f"pbkdf2_sha256${settings.password_iterations}$"
        f"{base64.b64encode(salt).decode('utf-8')}$"
        f"{base64.b64encode(digest).decode('utf-8')}"
    )


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False

    try:
        algorithm, iterations, salt, digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False

        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.b64decode(salt.encode("utf-8")),
            int(iterations),
        )
        return hmac.compare_digest(
            derived,
            base64.b64decode(digest.encode("utf-8")),
        )
    except (TypeError, ValueError):
        return False


def build_access_token(db: Session, user: models.User) -> tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_access_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.auth_token_ttl_hours
    )

    token = models.AuthToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    user.last_login_at = datetime.now(timezone.utc)
    db.add(token)
    db.commit()
    db.refresh(user)

    return raw_token, expires_at


def revoke_access_token(db: Session, raw_token: str | None):
    if not raw_token:
        return

    token_hash = hash_access_token(raw_token)
    token = (
        db.query(models.AuthToken)
        .filter(
            models.AuthToken.token_hash == token_hash,
            models.AuthToken.revoked_at.is_(None),
        )
        .first()
    )
    if not token:
        return

    token.revoked_at = datetime.now(timezone.utc)
    db.commit()


def get_user_for_token(db: Session, raw_token: str | None):
    if not raw_token:
        return None

    token_hash = hash_access_token(raw_token)
    token = (
        db.query(models.AuthToken)
        .filter(
            models.AuthToken.token_hash == token_hash,
            models.AuthToken.revoked_at.is_(None),
        )
        .first()
    )
    if not token:
        return None

    now = datetime.now(timezone.utc)
    expires_at = token.expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at and expires_at <= now:
        token.revoked_at = now
        db.commit()
        return None

    return db.query(models.User).filter(models.User.id == token.user_id).first()
