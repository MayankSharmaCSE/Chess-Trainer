from datetime import datetime

from pydantic import BaseModel


class GamePoint(BaseModel):
    game_id: int
    played_at: datetime | None
    user_result: str | None
    user_rating: int | None
    opponent: str | None
    opening: str | None
    blunders: int
    mistakes: int
    inaccuracies: int
    user_moves: int
    accuracy: float | None  # share of your moves with no flag (0..1)


class RatingPoint(BaseModel):
    played_at: datetime | None
    rating: int


class PhaseTrend(BaseModel):
    phase: str
    blunders: int
    mistakes: int
    inaccuracies: int
    total: int


class TrainingPoint(BaseModel):
    day: str  # YYYY-MM-DD
    attempts: int
    correct: int


class ProgressReport(BaseModel):
    games_analyzed: int
    points: list[GamePoint]
    rating_trend: list[RatingPoint]
    avg_blunders_per_game: float
    avg_mistakes_per_game: float
    avg_inaccuracies_per_game: float
    overall_accuracy: float | None
    phases: list[PhaseTrend]
    training: list[TrainingPoint]
    training_accuracy: float | None
    training_completion_rate: float | None
    insufficient_data: bool
