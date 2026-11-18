from datetime import datetime

from pydantic import BaseModel


class PhaseBucket(BaseModel):
    phase: str  # Opening | Middlegame | Endgame
    blunder: int
    mistake: int
    inaccuracy: int
    total: int


class OpeningStat(BaseModel):
    opening: str
    games: int
    flags: int


class EvidenceGame(BaseModel):
    id: int
    opponent: str | None
    played_at: datetime | None
    user_result: str | None
    flags: int


class AnalyzedGame(BaseModel):
    """An analyzed game offered for manual weakness-map selection."""

    id: int
    opponent: str | None
    played_at: datetime | None
    user_result: str | None
    opening_name: str | None


class WeaknessReport(BaseModel):
    games_analyzed: int
    user_moves_analyzed: int
    blunders: int
    mistakes: int
    inaccuracies: int
    phases: list[PhaseBucket]
    top_openings: list[OpeningStat]
    sample_games: list[EvidenceGame]
    insufficient_data: bool
