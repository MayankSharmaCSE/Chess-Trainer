from datetime import datetime

from pydantic import BaseModel


class MoveAnalysisOut(BaseModel):
    ply: int
    played_san: str
    played_uci: str
    best_san: str | None
    best_uci: str | None
    pv_sans: list[str] | None
    eval_before_cp: int | None
    mate_before: int | None
    eval_after_cp: int | None
    mate_after: int | None
    cp_loss: int
    classification: str | None
    is_user_move: bool

    model_config = {"from_attributes": True}


class AnalysisStatusOut(BaseModel):
    status: str  # pending | done | failed
    engine_name: str | None = None
    engine_version: str | None = None
    depth: int | None = None
    blunder_count: int = 0
    mistake_count: int = 0
    inaccuracy_count: int = 0
    error: str | None = None
    completed_at: datetime | None = None


class AnalysisOut(AnalysisStatusOut):
    moves: list[MoveAnalysisOut] = []


class MoveExplanationOut(BaseModel):
    ply: int
    played_san: str
    classification: str | None
    explanation: str
    source: str
    best_san: str | None = None
    pv_sans: list[str] | None = None

    model_config = {"from_attributes": True}
