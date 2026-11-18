from pydantic import BaseModel, Field


class DrillOut(BaseModel):
    id: int
    game_id: int
    fen_before: str
    classification: str
    phase: str
    opening: str | None
    played_san: str  # the mistake made (for reveal-after feedback)
    best_san: str | None = None  # hidden from solver until solved; shown in reveal
    pv_sans: list[str] | None = None
    solved: bool = False
    has_coaching: bool = False  # hint cached (UI can show instantly)

    model_config = {"from_attributes": True}


class DrillsPage(BaseModel):
    drills: list[DrillOut]
    total: int


class AttemptIn(BaseModel):
    played_uci: str = Field(min_length=4, max_length=8)


class CoachingIn(BaseModel):
    level: str = Field(default="hint", pattern="^(hint|reveal)$")
    lang: str = Field(default="ENGLISH", pattern="^(ENGLISH|HINDI)$")


class CoachingOut(BaseModel):
    level: str
    text: str
    source: str  # llm | rules-v1

    model_config = {"from_attributes": True}


class AttemptOut(BaseModel):
    correct: bool
    played_san: str | None
    best_san: str | None
    solved: bool  # drill solved (this or earlier attempt)
    equivalent: bool = False  # True if accepted via tolerance, not exact best

    model_config = {"from_attributes": True}


class TrainingStatsOut(BaseModel):
    total_drills: int
    solved: int
    unsolved: int
    attempts: int
    correct_attempts: int
