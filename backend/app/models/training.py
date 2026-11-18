from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TrainingDrill(Base):
    """One training position generated from a flagged user move (US-009).

    The position is the FEN *before* the user's mistake; the task is to find
    Stockfish's best move. One drill per MoveAnalysis (unique).
    """

    __tablename__ = "training_drills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    move_analysis_id: Mapped[int] = mapped_column(
        ForeignKey("move_analyses.id", ondelete="CASCADE"), unique=True, index=True
    )
    fen_before: Mapped[str] = mapped_column(Text)
    classification: Mapped[str] = mapped_column(String(16))  # BLUNDER|MISTAKE|INACCURACY
    phase: Mapped[str] = mapped_column(String(16))  # Opening|Middlegame|Endgame
    opening: Mapped[str | None] = mapped_column(String(255), nullable=True)
    played_san: Mapped[str] = mapped_column(String(16))  # the user's mistake, for feedback
    best_uci: Mapped[str] = mapped_column(String(16))
    best_san: Mapped[str | None] = mapped_column(String(16), nullable=True)
    pv_sans: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # UCI moves proven equivalent to best (within tolerance, via engine MultiPV).
    # Computed lazily on first non-exact attempt, then cached for instant grading.
    acceptable_ucis: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Option B LLM coaching cache: one hint + one reveal per drill (cached after
    # first success, so normally 2 paid calls per drill lifetime). Source is
    # tracked per level (rules-v1 fallback | llm) so a basic reveal never
    # relabels an AI hint or vice versa. Added to old DBs by init_db().
    coaching_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    coaching_hint_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    coaching_reveal: Mapped[str | None] = mapped_column(Text, nullable=True)
    coaching_reveal_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class TrainingAttempt(Base):
    """One attempt at a drill (US-009). Solved = any correct attempt exists."""

    __tablename__ = "training_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    drill_id: Mapped[int] = mapped_column(
        ForeignKey("training_drills.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    played_uci: Mapped[str] = mapped_column(String(16))
    played_san: Mapped[str | None] = mapped_column(String(16), nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
