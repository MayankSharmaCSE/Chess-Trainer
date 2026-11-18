from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_BOTS = [
    {
        "id": "beginner",
        "name": "Beginner Bot",
        "rating": 400,
        "skill_level": 0,
        "difficulty": "Very Easy",
        "description": "Just learning the rules of chess! Makes frequent tactical blunders, leaves pieces unprotected, and struggles with basic king safety.",
        "avatar": "pawn-green",
        "depth": 1,
        "movetime_ms": 100,
        "uci_limit_strength": False,
        "uci_elo": None,
    },
    {
        "id": "casual",
        "name": "Casual Bot",
        "rating": 600,
        "skill_level": 2,
        "difficulty": "Easy",
        "description": "Plays friendly weekend games. Grabs undefended pieces when seen, but easily falls for common forks and pins.",
        "avatar": "pawn-blue",
        "depth": 2,
        "movetime_ms": 150,
        "uci_limit_strength": False,
        "uci_elo": None,
    },
    {
        "id": "learner",
        "name": "Learner Bot",
        "rating": 800,
        "skill_level": 4,
        "difficulty": "Easy",
        "description": "Practicing opening principles and basic development. Spots single-move tactics but misses multi-move sequences.",
        "avatar": "knight-teal",
        "depth": 3,
        "movetime_ms": 200,
        "uci_limit_strength": False,
        "uci_elo": None,
    },
    {
        "id": "club",
        "name": "Club Bot",
        "rating": 1000,
        "skill_level": 7,
        "difficulty": "Intermediate",
        "description": "Active local club player. Understands tactical motifs, castles early, and coordinates pieces for direct attacks.",
        "avatar": "bishop-indigo",
        "depth": 5,
        "movetime_ms": 300,
        "uci_limit_strength": False,
        "uci_elo": None,
    },
    {
        "id": "challenger",
        "name": "Challenger Bot",
        "rating": 1200,
        "skill_level": 10,
        "difficulty": "Intermediate",
        "description": "Competitive amateur. Solid opening repertoire, sharp eye for attacking weaknesses, and resilient defense.",
        "avatar": "knight-purple",
        "depth": 7,
        "movetime_ms": 400,
        "uci_limit_strength": False,
        "uci_elo": None,
    },
    {
        "id": "advanced",
        "name": "Advanced Bot",
        "rating": 1400,
        "skill_level": 13,
        "difficulty": "Hard",
        "description": "Seasoned tournament regular. Strong positional play, controlled center play, and calculating acumen.",
        "avatar": "rook-amber",
        "depth": 9,
        "movetime_ms": 500,
        "uci_limit_strength": True,
        "uci_elo": 1400,
    },
    {
        "id": "expert",
        "name": "Expert Bot",
        "rating": 1600,
        "skill_level": 16,
        "difficulty": "Hard",
        "description": "Formidable tactical calculator. Exploits subtle positional mistakes and converts tactical advantages cleanly.",
        "avatar": "rook-rose",
        "depth": 11,
        "movetime_ms": 650,
        "uci_limit_strength": True,
        "uci_elo": 1600,
    },
    {
        "id": "master",
        "name": "Master Bot",
        "rating": 1800,
        "skill_level": 18,
        "difficulty": "Very Hard",
        "description": "Candidate Master level strength. Exceptional tactical vision, deep strategic planning, and refined endgame technique.",
        "avatar": "queen-fuchsia",
        "depth": 14,
        "movetime_ms": 800,
        "uci_limit_strength": True,
        "uci_elo": 1800,
    },
    {
        "id": "grandmaster",
        "name": "Grandmaster Bot",
        "rating": 2000,
        "skill_level": 20,
        "difficulty": "Expert",
        "description": "Grandmaster calculation with impenetrable defense. Plays with engine-like precision and relentless conversion.",
        "avatar": "king-gold",
        "depth": 16,
        "movetime_ms": 1000,
        "uci_limit_strength": True,
        "uci_elo": 2000,
    },
]


class Bot(Base):
    """Configured AI opponent in the Bot Arena."""

    __tablename__ = "bots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    rating: Mapped[int] = mapped_column(Integer)
    skill_level: Mapped[int] = mapped_column(Integer, default=5)
    difficulty: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(Text)
    avatar: Mapped[str | None] = mapped_column(String(64), nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=5)
    movetime_ms: Mapped[int] = mapped_column(Integer, default=300)
    uci_limit_strength: Mapped[bool] = mapped_column(Boolean, default=False)
    uci_elo: Mapped[int | None] = mapped_column(Integer, nullable=True)


class BotGame(Base):
    """One game played against an AI Bot."""

    __tablename__ = "bot_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bot_id: Mapped[str] = mapped_column(ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    player_color: Mapped[str] = mapped_column(String(8))  # "white" | "black"
    result: Mapped[str] = mapped_column(String(16), default="in_progress")  # win | loss | draw | in_progress
    status: Mapped[str] = mapped_column(
        String(32), default="in_progress"
    )  # in_progress | checkmate | resigned | stalemate | draw_repetition | draw_material | draw_50_moves | timeout
    pgn: Mapped[str] = mapped_column(Text, default="")
    fen: Mapped[str] = mapped_column(
        String(128), default="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    )
    total_moves: Mapped[int] = mapped_column(Integer, default=0)
    time_control: Mapped[str | None] = mapped_column(String(32), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    linked_game_id: Mapped[int | None] = mapped_column(
        ForeignKey("games.id", ondelete="SET NULL"), nullable=True
    )

    bot: Mapped["Bot"] = relationship("Bot", lazy="joined")
