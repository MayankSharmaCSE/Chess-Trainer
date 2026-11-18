from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class BotOut(BaseModel):
    id: str
    name: str
    rating: int
    skill_level: int
    difficulty: str
    description: str
    avatar: str | None = None
    depth: int = 5

    model_config = {"from_attributes": True}


class CreateBotGameIn(BaseModel):
    bot_id: str
    player_color: str = Field(default="white", pattern="^(white|black|random)$")
    time_control: str | None = Field(default="10+0")


class BotGameMoveIn(BaseModel):
    move: str = Field(..., min_length=2, max_length=10, description="Move in UCI or SAN notation")


class MoveHistoryItem(BaseModel):
    move_number: int
    ply: int
    san: str
    uci: str
    color: str  # "white" | "black"


class BotGameOut(BaseModel):
    id: int
    user_id: int
    bot_id: str
    bot: BotOut
    player_color: str
    result: str
    status: str
    pgn: str
    fen: str
    total_moves: int
    time_control: str | None = None
    moves: list[MoveHistoryItem] = []
    captured_white: list[str] = []
    captured_black: list[str] = []
    material_advantage: int = 0  # positive = player advantage, negative = bot advantage
    turn: str = "white"
    is_check: bool = False
    is_checkmate: bool = False
    is_game_over: bool = False
    last_move: list[str] | None = None  # [from_sq, to_sq]
    ai_move: str | None = None  # SAN or UCI of the AI move just played
    started_at: datetime
    completed_at: datetime | None = None
    linked_game_id: int | None = None

    model_config = {"from_attributes": True}


class BotGameAnalysisOut(BaseModel):
    game_id: int
    linked_game_id: int | None = None
    result: str
    player_color: str
    accuracy: float
    performance_rating: int | None = None
    blunders: int
    mistakes: int
    inaccuracies: int
    best_move: str | None = None
    worst_move: str | None = None
    moves: list[dict[str, Any]] = []
