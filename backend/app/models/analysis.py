from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GameAnalysis(Base):
    """One Stockfish run over a game (US-005). Engine version/config recorded."""

    __tablename__ = "game_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), unique=True, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    engine_name: Mapped[str] = mapped_column(String(64), default="Stockfish")
    engine_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=15)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|done|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    blunder_count: Mapped[int] = mapped_column(Integer, default=0)
    mistake_count: Mapped[int] = mapped_column(Integer, default=0)
    inaccuracy_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MoveAnalysis(Base):
    """Per-ply engine verdict. Evals are White-POV (cp, or mate in moves)."""

    __tablename__ = "move_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    analysis_id: Mapped[int] = mapped_column(
        ForeignKey("game_analyses.id", ondelete="CASCADE"), index=True
    )
    ply: Mapped[int] = mapped_column(Integer)  # 1 = White's first move
    played_san: Mapped[str] = mapped_column(String(16))
    played_uci: Mapped[str] = mapped_column(String(16))
    best_san: Mapped[str | None] = mapped_column(String(16), nullable=True)
    best_uci: Mapped[str | None] = mapped_column(String(16), nullable=True)
    pv_sans: Mapped[list | None] = mapped_column(JSON, nullable=True)
    eval_before_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mate_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    eval_after_cp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mate_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cp_loss: Mapped[int] = mapped_column(Integer, default=0)
    classification: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_user_move: Mapped[bool] = mapped_column(default=False)


class MoveExplanation(Base):
    """Cached rule-based explanation for one analyzed user move (US-008).

    Keyed 1:1 to MoveAnalysis; cascade-deleted when a game is re-analyzed.
    `source` is "rules-v1" today, reserving room for an LLM pass later that
    must still cite the same Stockfish evidence.
    """

    __tablename__ = "move_explanations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    move_analysis_id: Mapped[int] = mapped_column(
        ForeignKey("move_analyses.id", ondelete="CASCADE"), unique=True, index=True
    )
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ply: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="rules-v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
