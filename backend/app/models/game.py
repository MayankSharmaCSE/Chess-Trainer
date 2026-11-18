from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Game(Base):
    """One imported game (US-002). Raw PGN kept so Stockfish (US-005) can run later."""

    __tablename__ = "games"
    __table_args__ = (UniqueConstraint("platform", "external_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int | None] = mapped_column(
        ForeignKey("connected_accounts.id", ondelete="SET NULL"), nullable=True
    )
    platform: Mapped[str] = mapped_column(String(16), index=True)
    external_id: Mapped[str] = mapped_column(String(255))  # chess.com game URL / lichess game id
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pgn: Mapped[str] = mapped_column(Text)

    white_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    black_username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    white_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    black_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    white_result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    black_result: Mapped[str | None] = mapped_column(String(32), nullable=True)
    user_color: Mapped[str | None] = mapped_column(String(8), nullable=True)  # white|black
    user_result: Mapped[str | None] = mapped_column(String(8), nullable=True)  # win|draw|loss
    opponent: Mapped[str | None] = mapped_column(String(64), nullable=True)

    time_control: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rated: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    opening_eco: Mapped[str | None] = mapped_column(String(16), nullable=True)
    opening_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
