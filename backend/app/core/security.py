"""Password hashing (bcrypt) + JWT sessions (PyJWT, HS256)."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import JWT_ALGORITHM, JWT_EXPIRE_DAYS, JWT_SECRET


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, session_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "sv": session_version,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_EXPIRE_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_claims(token: str) -> tuple[int, int] | None:
    """(user_id, session_version) for a valid token, else None.
    Tokens from before session versions existed count as version 0."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"]), int(payload.get("sv", 0))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return None


def decode_access_token(token: str) -> int | None:
    claims = decode_access_claims(token)
    return claims[0] if claims else None
