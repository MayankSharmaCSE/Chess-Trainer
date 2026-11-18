"""US-009: personalized training drills from the user's own mistakes."""

import chess
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.analysis import MoveAnalysis
from app.models.game import Game
from app.models.training import TrainingDrill
from app.models.user import User
from app.schemas.training import (
    AttemptIn,
    AttemptOut,
    CoachingIn,
    CoachingOut,
    DrillOut,
    DrillsPage,
    TrainingStatsOut,
)
from app.services import coaching as coaching_svc
from app.services import training as training_svc

router = APIRouter(prefix="/api/training", tags=["training"])


@router.get("/drills", response_model=DrillsPage)
def drills(
    include_solved: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DrillsPage:
    items = training_svc.list_drills(db, user.id, include_solved=include_solved)
    return DrillsPage(drills=items, total=len(items))


@router.get("/stats", response_model=TrainingStatsOut)
def stats(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TrainingStatsOut:
    return TrainingStatsOut(**training_svc.training_stats(db, user.id))


@router.post("/drills/{drill_id}/attempts", response_model=AttemptOut)
def attempt(
    drill_id: int, body: AttemptIn,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> AttemptOut:
    drill = (
        db.query(TrainingDrill)
        .filter(TrainingDrill.id == drill_id, TrainingDrill.user_id == user.id)
        .first()
    )
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    try:
        correct, equivalent, played_san = training_svc.grade_attempt(db, user.id, drill_id, body.played_uci)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    solved = training_svc.is_solved(db, user.id, drill_id)
    return AttemptOut(correct=correct, played_san=played_san, best_san=drill.best_san, solved=solved, equivalent=equivalent)


@router.post("/drills/{drill_id}/coaching", response_model=CoachingOut)
def coaching(
    drill_id: int, body: CoachingIn,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> CoachingOut:
    """Option B coaching for a drill.

    reveal: Stockfish's best move + PV go to the LLM, which explains them
    (the UI shows the move first, then this text). Available any time - the
    "Need a hint?" button uses it before solving.
    hint: legacy spoiler-free theme hint (best move never sent to the LLM).

    Order: 404 (not yours) -> cached text -> 503 if no LLM key -> generate.
    LLM text and validation-failure fallbacks are cached per drill+level;
    transport-failure fallbacks are not, so the next request retries.
    """
    drill = (
        db.query(TrainingDrill)
        .filter(TrainingDrill.id == drill_id, TrainingDrill.user_id == user.id)
        .first()
    )
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")

    reveal = body.level == "reveal"

    cached_text = drill.coaching_reveal if reveal else drill.coaching_hint
    cached_source = drill.coaching_reveal_source if reveal else drill.coaching_hint_source
    if cached_text:
        return CoachingOut(
            level=body.level, text=cached_text, source=cached_source or coaching_svc.RULES_SOURCE
        )

    if not coaching_svc.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=coaching_svc.NOT_CONFIGURED_DETAIL,
        )

    move = db.get(MoveAnalysis, drill.move_analysis_id)
    game = db.get(Game, drill.game_id)
    white_to_move = chess.Board(drill.fen_before).turn == chess.WHITE
    result = coaching_svc.get_coaching(
        level=body.level,
        fallback=coaching_svc.rules_fallback(
            body.level, game=game, move=move,
            best_san=drill.best_san, played_san=drill.played_san, phase=drill.phase,
        ),
        fen_before=drill.fen_before,
        side_to_move="White" if white_to_move else "Black",
        played_san=drill.played_san, classification=drill.classification,
        cp_loss=move.cp_loss if move else None, phase=drill.phase,
        opening=drill.opening, best_san=drill.best_san, best_uci=drill.best_uci,
        pv_sans=drill.pv_sans,
        eval_before=_fmt_pov(move.eval_before_cp, move.mate_before, white_to_move) if move else "unknown",
        eval_after=_fmt_pov(move.eval_after_cp, move.mate_after, white_to_move) if move else "unknown",
        lang=body.lang,
    )
    if result.cacheable:
        if reveal:
            drill.coaching_reveal, drill.coaching_reveal_source = result.text, result.source
        else:
            drill.coaching_hint, drill.coaching_hint_source = result.text, result.source
        db.commit()
    return CoachingOut(level=body.level, text=result.text, source=result.source)


def _fmt_pov(cp: int | None, mate: int | None, white_to_move: bool) -> str:
    """Stored evals are White-POV; flip them to the side to move (the player)."""
    sign = 1 if white_to_move else -1
    if mate == 0:
        return "checkmate"
    if mate is not None:
        m = mate * sign
        return f"{'+' if m > 0 else '-'}M{abs(m)}"
    if cp is None:
        return "unknown"
    v = cp * sign
    return f"{'+' if v > 0 else ''}{v / 100:.1f}"
