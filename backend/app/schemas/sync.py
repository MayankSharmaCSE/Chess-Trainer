from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Platform = Literal["chesscom", "lichess"]


class ConnectIn(BaseModel):
    platform: Platform
    username: str = Field(min_length=2, max_length=64)


class AccountOut(BaseModel):
    id: int
    platform: str
    username: str
    status: str
    game_count: int
    last_synced_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SyncOut(BaseModel):
    imported: int
    skipped: int
    total: int
    last_synced_at: datetime | None


class GameSummaryOut(BaseModel):
    id: int
    platform: str
    url: str | None
    white_username: str | None
    black_username: str | None
    white_rating: int | None
    black_rating: int | None
    user_color: str | None
    user_result: str | None
    opponent: str | None
    time_control: str | None
    rated: bool | None
    opening_name: str | None
    played_at: datetime | None

    model_config = {"from_attributes": True}


class GamesPage(BaseModel):
    games: list[GameSummaryOut]
    total: int


class GameDetailOut(GameSummaryOut):
    pgn: str
