"""US-005: Stockfish analysis over saved games (async: 202 pending -> poll)."""

import logging
import queue
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
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

logger = logging.getLogger("chesslens.analysis")

# Game analyses run on ONE dedicated worker thread fed by an in-memory queue:
# - one Stockfish at a time (each is ~250 MB; see services/engine_slots), so
#   "analyze every game" queues instead of OOM-killing the container;
# - a queued job holds no DB connection and no threadpool thread. (FastAPI
#   BackgroundTasks keep the request's DB session open until the task ends,
#   so 15+ queued games exhausted the pool and broke every other request.)
# The queue is lost on restart; reset_interrupted_analyses() covers that.
_jobs: "queue.Queue[tuple[int, str, int, str | None]]" = queue.Queue()
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()


INTERRUPTED_ERROR = "Analysis was interrupted because the server restarted. Click Retry."


def reset_interrupted_analyses() -> int:
    """Startup hook: 'pending' rows left by a crash/redeploy can never finish
    (the in-memory queue is gone), so mark them failed so the UI offers Retry
    instead of spinning forever."""
    with SessionLocal() as db:
        n = (
            db.query(GameAnalysis)
            .filter(GameAnalysis.status == "pending")
            .update({"status": "failed", "error": INTERRUPTED_ERROR}, synchronize_session=False)
        )
        db.commit()
    return n


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


def _save_analysis(analysis_id: int, result: dict | None = None, error: str | None = None) -> None:
    """Write the outcome in one short-lived session (runs in a worker thread)."""
    with SessionLocal() as db:
        analysis = db.get(GameAnalysis, analysis_id)
        if analysis is None:
            return
        if error is not None or result is None:
            analysis.status = "failed"
            analysis.error = error or "Analysis failed."
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


def _process(analysis_id: int, pgn: str, depth: int, user_color: str | None) -> None:
    try:
        result = engine.analyze_game(pgn, depth, user_color, STOCKFISH_PATH)
    except (OSError, FileNotFoundError):
        _save_analysis(
            analysis_id,
            error=f"Stockfish binary not found at '{STOCKFISH_PATH}'. "
            "Set STOCKFISH_PATH to a Stockfish 16+ binary.",
        )
        return
    except Exception as e:  # noqa: BLE001 - surfaced as failed status
        _save_analysis(analysis_id, error=f"Analysis failed: {e}")
        return
    _save_analysis(analysis_id, result=result)


def _worker_loop() -> None:
    while True:
        job = _jobs.get()
        try:
            _process(*job)
        except Exception:  # noqa: BLE001 - never let one job kill the worker
            logger.exception("Analysis job %s crashed", job[0])
        finally:
            _jobs.task_done()


def _enqueue(analysis_id: int, pgn: str, depth: int, user_color: str | None) -> None:
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_worker_loop, name="analysis-worker", daemon=True)
            _worker.start()
    _jobs.put((analysis_id, pgn, depth, user_color))


@router.post("/games/{game_id}/analyze", response_model=AnalysisStatusOut, status_code=202)
def analyze(
    game_id: int,
    depth: int = Query(default=ANALYSIS_DEFAULT_DEPTH, ge=1, le=ANALYSIS_MAX_DEPTH),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnalysisStatusOut:
    game = _get_game(game_id, user.id, db)
    existing = db.query(GameAnalysis).filter(GameAnalysis.game_id == game.id).first()
    if existing and existing.status in ("done", "pending") and existing.depth == depth:
        # done: nothing to do. pending: already queued/running; a second click
        # must not queue the same game twice.
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
    _enqueue(existing.id, game.pgn, depth, game.user_color)
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
