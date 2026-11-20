"""DrillHistoryManager — anti-repetition window per user + category."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.endgame import EndgameHistory

WINDOW = 40


def recent_ids(db: Session, user_id: int, category: str, limit: int = WINDOW) -> list[str]:
    rows = (
        db.query(EndgameHistory)
        .filter(EndgameHistory.user_id == user_id, EndgameHistory.category == category)
        .order_by(EndgameHistory.id.desc())
        .limit(limit)
        .all()
    )
    return [r.challenge_id for r in rows]


def last_id(db: Session, user_id: int, category: str) -> str | None:
    row = (
        db.query(EndgameHistory)
        .filter(EndgameHistory.user_id == user_id, EndgameHistory.category == category)
        .order_by(EndgameHistory.id.desc())
        .first()
    )
    return row.challenge_id if row else None


def record(db: Session, user_id: int, category: str, challenge_id: str) -> None:
    db.add(EndgameHistory(user_id=user_id, category=category, challenge_id=challenge_id))
    # Trim the window so the table stays bounded.
    keep = (
        select(EndgameHistory.id)
        .where(EndgameHistory.user_id == user_id, EndgameHistory.category == category)
        .order_by(EndgameHistory.id.desc())
        .limit(WINDOW)
    )
    db.query(EndgameHistory).filter(
        EndgameHistory.user_id == user_id,
        EndgameHistory.category == category,
        EndgameHistory.id.notin_(keep),
    ).delete(synchronize_session=False)