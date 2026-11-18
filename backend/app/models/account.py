from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConnectedAccount(Base):
    """A Chess.com / Lichess username linked to a ChessLens user (US-001).

    No passwords or OAuth tokens: public APIs only need the username.
    """

    __tablename__ = "connected_accounts"
    __table_args__ = (UniqueConstraint("user_id", "platform", "platform_username_norm"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(16))  # "chesscom" | "lichess"
    platform_username: Mapped[str] = mapped_column(String(64))  # canonical case from platform
    platform_username_norm: Mapped[str] = mapped_column(String(64))  # lowercased for matching
    status: Mapped[str] = mapped_column(String(16), default="connected")
    game_count: Mapped[int] = mapped_column(Integer, default=0)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_played_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
