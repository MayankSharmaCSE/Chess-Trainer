"""US-005: Stockfish analysis over saved games (async: 202 pending -> poll)."""

from datetime import datetime, timezone

from anyio import to_thread
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import ANALYSIS_DEFAULT_DEPTH, ANALYSIS_MAX_DEPTH, STOCKFISH_PATH
from app.db.base import SessionLocal, get_db
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game
from app.models.user import User
from app.schemas.analysis import AnalysisOut, AnalysisStatusOut, MoveAnalysisOut, MoveExplanationOut
from app.services import engine

router = APIRouter(prefix="/api", tags=["analysis"])


def _status_of(a: GameAnalysis) -> AnalysisStatusOut:
    return AnalysisStatusOut(
        status=a.status,
        engine_name=a.engine_name,
        engine_version=a.engine_version,
        depth=a.depth,
        blunder_count=a.blunder_count,
        mistake_count=a.mistake_count,
        inaccuracy_count=a.inaccuracy_count,
        error=a.error,
        completed_at=a.completed_at,
    )


def _get_game(game_id: int, user_id: int, db: Session) -> Game:
    game = db.query(Game).filter(Game.id == game_id, Game.user_id == user_id).first()
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")
    return game


async def _run_analysis(analysis_id: int, pgn: str, depth: int, user_color: str | None) -> None:
    db = SessionLocal()
    try:
        analysis = db.get(GameAnalysis, analysis_id)
        if analysis is None:
            return
        try:
            result = await to_thread.run_sync(
                lambda: engine.analyze_game(pgn, depth, user_color, STOCKFISH_PATH)
            )
        except (OSError, FileNotFoundError):
            analysis.status = "failed"
            analysis.error = (
                f"Stockfish binary not found at '{STOCKFISH_PATH}'. "
                "Set STOCKFISH_PATH to a Stockfish 16+ binary."
            )
            db.commit()
            return
        except Exception as e:  # noqa: BLE001 - surfaced as failed status
            analysis.status = "failed"
            analysis.error = f"Analysis failed: {e}"
            db.commit()
            return
        db.query(MoveAnalysis).filter(MoveAnalysis.analysis_id == analysis.id).delete()
        for m in result["moves"]:
            db.add(MoveAnalysis(game_id=analysis.game_id, analysis_id=analysis.id, **m))
        counts = result["counts"]
        analysis.status = "done"
        analysis.error = None
        analysis.engine_version = result.get("engine_version")
        analysis.blunder_count = counts.get("BLUNDER", 0)
        analysis.mistake_count = counts.get("MISTAKE", 0)
        analysis.inaccuracy_count = counts.get("INACCURACY", 0)
        analysis.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


@router.post("/games/{game_id}/analyze", response_model=AnalysisStatusOut, status_code=202)
def analyze(
    game_id: int,
    background: BackgroundTasks,
    depth: int = Query(default=ANALYSIS_DEFAULT_DEPTH, ge=1, le=ANALYSIS_MAX_DEPTH),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisStatusOut:
    game = _get_game(game_id, user.id, db)
    existing = db.query(GameAnalysis).filter(GameAnalysis.game_id == game.id).first()
    if existing and existing.status == "done" and existing.depth == depth:
        return _status_of(existing)
    if existing is None:
        existing = GameAnalysis(game_id=game.id, user_id=user.id, depth=depth)
        db.add(existing)
    else:
        existing.status = "pending"
        existing.error = None
        existing.depth = depth
        existing.blunder_count = existing.mistake_count = existing.inaccuracy_count = 0
        existing.completed_at = None
    db.commit()
    db.refresh(existing)
    background.add_task(_run_analysis, existing.id, game.pgn, depth, game.user_color)
    return _status_of(existing)


@router.get("/games/{game_id}/analysis", response_model=AnalysisOut)
def get_analysis(
    game_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AnalysisOut:
    game = _get_game(game_id, user.id, db)
    analysis = db.query(GameAnalysis).filter(GameAnalysis.game_id == game.id).first()
    if analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No analysis yet.")
    out = AnalysisOut(**_status_of(analysis).model_dump())
    if analysis.status == "done":
        moves = (
            db.query(MoveAnalysis)
            .filter(MoveAnalysis.analysis_id == analysis.id)
            .order_by(MoveAnalysis.ply)
            .all()
        )
        out.moves = [MoveAnalysisOut.model_validate(m) for m in moves]
    return out


@router.get("/games/{game_id}/moves/{ply}/explanation", response_model=MoveExplanationOut)
def get_explanation(
    game_id: int, ply: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MoveExplanationOut:
    """US-008: grounded explanation for one analyzed move (cached per move)."""
    from app.models.analysis import MoveExplanation
    from app.services.explanations import explain_move

    game = _get_game(game_id, user.id, db)
    analysis = db.query(GameAnalysis).filter(GameAnalysis.game_id == game.id).first()
    if analysis is None or analysis.status != "done":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No completed analysis yet. Analyze this game first.",
        )
    move = (
        db.query(MoveAnalysis)
        .filter(MoveAnalysis.analysis_id == analysis.id, MoveAnalysis.ply == ply)
        .first()
    )
    if move is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Move not found.")
    if not move.is_user_move:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Explanations are available for your moves only.",
        )
    cached = (
        db.query(MoveExplanation)
        .filter(MoveExplanation.move_analysis_id == move.id)
        .first()
    )
    if cached is None:
        cached = MoveExplanation(
            move_analysis_id=move.id, game_id=game.id, user_id=user.id,
            ply=move.ply, explanation=explain_move(game, move), source="rules-v1",
        )
        db.add(cached)
        db.commit()
        db.refresh(cached)
    return MoveExplanationOut(
        ply=move.ply, played_san=move.played_san, classification=move.classification,
        explanation=cached.explanation, source=cached.source,
        best_san=move.best_san, pv_sans=move.pv_sans,
    )
