"""Auth endpoints: signup / login / me / logout / forgot + reset password."""

import hashlib
import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import FRONTEND_URL, PASSWORD_RESET_MAX_PER_HOUR, PASSWORD_RESET_TTL_MIN
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.base import get_db
from app.models.user import PasswordResetToken, User
from app.schemas.auth import (
    ForgotPasswordIn,
    LoginIn,
    ResetPasswordIn,
    ResetTokenIn,
    SignupIn,
    TokenOut,
    UserOut,
)
from app.services import mailer

router = APIRouter(prefix="/api/auth", tags=["auth"])

INVALID_CREDENTIALS = "Invalid credentials"
FORGOT_RESPONSE = (
    "If an account matches, we've emailed a reset link to its address. "
    "It expires in {ttl} minutes. Check your spam folder too."
)
INVALID_RESET_LINK = "This reset link is invalid or has expired. Request a new one."

logger = logging.getLogger("chesslens.auth")


def _to_token(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, user.session_version or 0),
        user=UserOut.model_validate(user),
    )


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: Session = Depends(get_db)) -> TokenOut:
    username = body.username.strip()
    email = body.email.strip().lower()
    existing = (
        db.query(User)
        .filter(or_(User.email == email, func.lower(User.username) == username.lower()))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )
    user = User(username=username, email=email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_token(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    identifier = body.identifier.strip()
    user = (
        db.query(User)
        .filter(
            or_(
                User.email == identifier.lower(),
                func.lower(User.username) == identifier.lower(),
            )
        )
        .first()
    )
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS
        )
    return _to_token(user)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current)


@router.post("/logout")
def logout() -> dict:
    # Stateless JWT: client discards the token (and the Next.js cookie).
    return {"ok": True}


# ---------------------------------------------------------------- password reset


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; everything is stored as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _reset_email(user: User, link: str) -> tuple[str, str, str]:
    subject = "Reset your ChessLens password"
    text = (
        f"Hi {user.username},\n\n"
        "Someone (hopefully you) asked to reset the password for your ChessLens account.\n"
        f"Your username is: {user.username}\n\n"
        f"Set a new password here (valid for {PASSWORD_RESET_TTL_MIN} minutes, one use):\n{link}\n\n"
        "If you didn't ask for this, ignore this email; your password won't change.\n"
    )
    html = f"""<div style="font-family:Arial,sans-serif;font-size:15px;color:#13233A;max-width:520px">
<p>Hi {user.username},</p>
<p>Someone (hopefully you) asked to reset the password for your ChessLens account.<br>
Your username is: <strong>{user.username}</strong></p>
<p><a href="{link}" style="display:inline-block;background:#13233A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Set a new password</a></p>
<p style="color:#56657A;font-size:13px">The link is valid for {PASSWORD_RESET_TTL_MIN} minutes and works once.
If the button doesn't work, paste this into your browser:<br>{link}</p>
<p style="color:#56657A;font-size:13px">If you didn't ask for this, ignore this email; your password won't change.</p>
</div>"""
    return subject, text, html


def _send_in_background(to: str, subject: str, text: str, html: str) -> None:
    """Send off the request thread: the response time is then the same whether
    or not the account exists (no account probing by timing)."""

    def run() -> None:
        try:
            mailer.send_email(to, subject, text, html)
        except mailer.MailError as e:
            logger.error("Password reset email to user failed: %s", e)

    threading.Thread(target=run, name="reset-mail", daemon=True).start()


def _valid_reset_token(db: Session, token: str) -> PasswordResetToken | None:
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == _hash_token(token)).first()
    if row is None or row.used_at is not None or _aware(row.expires_at) <= _utcnow():
        return None
    return row


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(body: ForgotPasswordIn, db: Session = Depends(get_db)) -> dict:
    """Email a one-time reset link (plus the username, for 'forgot username').

    Always returns the same response so the form can't be used to find out
    which emails/usernames are registered.
    """
    generic = {"ok": True, "message": FORGOT_RESPONSE.format(ttl=PASSWORD_RESET_TTL_MIN)}
    identifier = body.identifier.strip().lower()
    user = (
        db.query(User)
        .filter(or_(User.email == identifier, func.lower(User.username) == identifier))
        .first()
    )
    if user is None:
        return generic

    now = _utcnow()
    recent = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.created_at >= now - timedelta(hours=1),
        )
        .count()
    )
    if recent >= PASSWORD_RESET_MAX_PER_HOUR:
        logger.warning("Password reset rate limit hit for user %s", user.id)
        return generic

    # Only the newest link works.
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
    ).update({"used_at": now}, synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(token),
            created_at=now,
            expires_at=now + timedelta(minutes=PASSWORD_RESET_TTL_MIN),
        )
    )
    db.commit()

    link = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    _send_in_background(user.email, *_reset_email(user, link))
    return generic


@router.post("/reset-password/check")
def check_reset_token(body: ResetTokenIn, db: Session = Depends(get_db)) -> dict:
    """Lets the reset page say 'link expired' before the user types a password."""
    return {"valid": _valid_reset_token(db, body.token) is not None}


@router.post("/reset-password")
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)) -> dict:
    row = _valid_reset_token(db, body.token)
    user = db.get(User, row.user_id) if row else None
    if row is None or user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=INVALID_RESET_LINK)
    now = _utcnow()
    user.hashed_password = hash_password(body.password)
    user.password_changed_at = now
    user.session_version = (user.session_version or 0) + 1  # signs out every existing session
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
    ).update({"used_at": now}, synchronize_session=False)
    db.commit()
    return {"ok": True, "username": user.username}
