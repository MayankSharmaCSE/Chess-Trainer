"""Schemas for the Endgame Drills API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DrillProgressOut(BaseModel):
    completed: bool = False
    stars: int = 0
    best_moves: int | None = None
    best_time_seconds: int | None = None
    attempts: int = 0
    completions: int = 0

    model_config = {"from_attributes": True}


class DrillSummaryOut(BaseModel):
    id: str
    category: str
    level: int
    title: str
    tagline: str
    difficulty: str
    est_minutes: int
    objective_label: str
    max_moves: int
    progress: DrillProgressOut
    locked: bool


class RecentChallengeOut(BaseModel):
    challenge_id: str
    title: str
    difficulty: str
    result: str  # completed | failed | in_progress | unseen
    stars: int = 0


class CategoryOut(BaseModel):
    id: str
    title: str
    glyph: str
    accent: str
    tagline: str
    description: str
    theory: str
    drills: list[DrillSummaryOut]
    completed: int
    total: int
    stars: int
    gen_completed: int = 0
    gen_attempts: int = 0
    best_streak: int = 0
    accuracy: float | None = None
    recent: list[RecentChallengeOut] = []


class StatsOut(BaseModel):
    total_drills: int
    completed: int
    total_stars: int
    max_stars: int
    attempts: int
    completions: int
    success_rate: float | None = None
    hints_used: int
    best_streak: int = 0
    generated_completed: int = 0


class HubOut(BaseModel):
    categories: list[CategoryOut]
    stats: StatsOut


class DrillDetailOut(BaseModel):
    id: str
    category: str
    category_title: str
    level: int
    title: str
    tagline: str
    difficulty: str
    fen: str
    player_color: str
    objective: dict
    objective_label: str
    max_moves: int
    star_moves: list[int]
    est_minutes: int
    instructions: list[str]
    tips: list[str]
    theory: str
    hint_count: int = 3
    strict: bool
    progress: DrillProgressOut
    locked: bool
    next_drill_id: str | None = None
    previous_drill_id: str | None = None
    engine_available: bool
    generated: bool = False
    challenge_id: str | None = None
    hint_max: int = 3
    subcategory: str | None = None
    subcategory_title: str | None = None


class SessionOut(BaseModel):
    id: int
    category: str
    difficulty: str
    target_count: int
    status: str
    completed: int
    correct: int
    incorrect: int
    hints: int
    score: int
    streak: int
    best_streak: int
    total_seconds: int
    current_drill_id: str | None = None

    model_config = {"from_attributes": True}


class MoveItem(BaseModel):
    move_number: int
    ply: int
    san: str
    uci: str
    color: str


class FeedbackOut(BaseModel):
    tone: str  # info | good | warn | bad
    message: str


class AttemptOut(BaseModel):
    id: int
    drill_id: str
    status: str
    fail_reason: str | None = None
    objective_met: bool = False
    fen: str
    start_fen: str
    player_color: str
    turn: str
    is_check: bool = False
    is_checkmate: bool = False
    is_stalemate: bool = False
    is_game_over: bool = False
    moves: list[MoveItem] = []
    player_moves: int = 0
    max_moves: int = 0
    moves_left: int = 0
    last_move: list[str] | None = None
    captured_white: list[str] = []
    captured_black: list[str] = []
    material_advantage: int = 0
    hints_used: int = 0
    hint_level: int = 0
    mistakes: int = 0
    solution_revealed: bool = False
    eval_cp: int | None = None
    eval_mate: int | None = None
    objective: dict
    objective_label: str
    started_at: datetime
    completed_at: datetime | None = None
    elapsed_seconds: int = 0
    stars: int | None = None
    accuracy: float | None = None
    feedback: FeedbackOut | None = None
    next_drill_id: str | None = None
    engine_available: bool = True
    session_id: int | None = None
    session: SessionOut | None = None


class MoveIn(BaseModel):
    move: str = Field(..., min_length=4, max_length=5, description="Move in UCI notation, e.g. e2e4 or e7e8q")


class HintOut(BaseModel):
    level: int
    text: str
    best_uci: str | None = None
    best_san: str | None = None
    from_square: str | None = None
    to_square: str | None = None
    source: str | None = None
    hints_used: int = 0


class SolutionMoveOut(BaseModel):
    san: str
    uci: str
    from_square: str
    to_square: str
    color: str  # white | black (the mover)
    fen_after: str
    is_capture: bool = False
    is_check: bool = False
    is_mate: bool = False
    promotion: str | None = None


class RevealOut(BaseModel):
    model_line: list[str] = []
    pv_sans: list[str] = []
    note: str = ""
    solution_revealed: bool = True
    # Verified, objective-aware solution starting from the CURRENT position.
    solution: list[SolutionMoveOut] = []
    start_fen: str | None = None
    final_fen: str | None = None
    objective_achieved: bool = False
    source: str = "none"  # engine | model | none
    error: str | None = None


class GenerateIn(BaseModel):
    category: str
    difficulty: str | None = None
    subcategory: str | None = None


class SessionStartIn(BaseModel):
    category: str
    difficulty: str | None = None
    count: int = 5  # 5 | 10 | 20 | 0 (endless)


class SessionBundleOut(BaseModel):
    session: SessionOut
    drill: DrillDetailOut
    attempt: AttemptOut


class SubcategoryProgressOut(BaseModel):
    completed: int = 0
    attempts: int = 0
    stars: int = 0


class SubcategoryOut(BaseModel):
    id: str
    title: str
    kind: str  # mate | win | defend | technique
    blurb: str
    progress: SubcategoryProgressOut = SubcategoryProgressOut()


class TaxonomyCategoryOut(BaseModel):
    id: str
    title: str
    glyph: str
    accent: str
    tagline: str
    theory: str
    completed: int = 0
    subcategories: list[SubcategoryOut] = []


class TaxonomyOut(BaseModel):
    categories: list[TaxonomyCategoryOut]
    engine_available: bool = True