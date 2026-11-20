"""Persistence for Endgame Drills: per-attempt sessions and per-drill progress.

Additive tables created by init_db()/create_all(); no existing table is altered.
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EndgameAttempt(Base):
    """One interactive drill session (server-authoritative, like BotGame)."""

    __tablename__ = "endgame_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    drill_id: Mapped[str] = mapped_column(String(32), index=True)
    start_fen: Mapped[str] = mapped_column(Text)
    fen: Mapped[str] = mapped_column(Text)
    moves: Mapped[list] = mapped_column(JSON, default=list)  # [{ply, san, uci, color, move_number}]
    player_moves: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")  # in_progress|completed|failed
    fail_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    objective_met: Mapped[bool] = mapped_column(Boolean, default=False)
    hints_used: Mapped[int] = mapped_column(Integer, default=0)
    hint_level: Mapped[int] = mapped_column(Integer, default=0)  # per current position
    mistakes: Mapped[int] = mapped_column(Integer, default=0)
    solution_revealed: Mapped[bool] = mapped_column(Boolean, default=False)
    checks_given: Mapped[int] = mapped_column(Integer, default=0)
    eval_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)  # White-POV
    eval_mate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_move: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [from, to]
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("endgame_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EndgameProgress(Base):
    """Best result + counters per (user, drill)."""

    __tablename__ = "endgame_progress"
    __table_args__ = (UniqueConstraint("user_id", "drill_id", name="uq_endgame_progress_user_drill"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    drill_id: Mapped[str] = mapped_column(String(32), index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    stars: Mapped[int] = mapped_column(Integer, default=0)
    best_moves: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    completions: Mapped[int] = mapped_column(Integer, default=0)
    hints_total: Mapped[int] = mapped_column(Integer, default=0)
    last_played_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class EndgameGenerated(Base):
    """A dynamically generated, verified challenge (persisted so attempts resume)."""

    __tablename__ = "endgame_generated"

    challenge_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    difficulty: Mapped[str] = mapped_column(String(16))
    config: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class EndgameHistory(Base):
    """Recently served challenge ids per user+category (anti-repetition window)."""

    __tablename__ = "endgame_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    challenge_id: Mapped[str] = mapped_column(String(40), index=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class EndgameSession(Base):
    """A training session: category + difficulty + target count (0 = endless)."""

    __tablename__ = "endgame_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[str] = mapped_column(String(16))
    target_count: Mapped[int] = mapped_column(Integer, default=5)  # 0 = endless
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|completed|ended
    completed: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    incorrect: Mapped[int] = mapped_column(Integer, default=0)
    hints: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    total_seconds: Mapped[int] = mapped_column(Integer, default=0)
    current_drill_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)