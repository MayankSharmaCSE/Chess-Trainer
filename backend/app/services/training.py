"""US-009: drills generated from the user's own flagged moves.

- Source: done analyses, is_user_move=True, classification set, best_uci set.
- Severity order: BLUNDER > MISTAKE > INACCURACY (worst first; ties -> newer game).
- Cleanup: drills whose MoveAnalysis vanished (re-analysis) are deleted.
- Attempt grading: legal-move check via python-chess + UCI match (promotion-aware).
"""

import chess

from sqlalchemy.orm import Session

from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game
from app.models.training import TrainingAttempt, TrainingDrill
from app.schemas.training import DrillOut
from app.services.explanations import ground_position
from app.services.weaknesses import phase_for_ply

SEVERITY_RANK = {"BLUNDER": 0, "MISTAKE": 1, "INACCURACY": 2}
MAX_DRILLS = 50


def sync_drills(db: Session, user_id: int) -> int:
    """Create drills for-flagged moves missing one; prune orphaned drills."""
    analyses = (
        db.query(GameAnalysis)
        .filter(GameAnalysis.user_id == user_id, GameAnalysis.status == "done")
        .all()
    )
    if not analyses:
        return 0
    aids = [a.id for a in analyses]
    moves = (
        db.query(MoveAnalysis)
        .filter(
            MoveAnalysis.analysis_id.in_(aids),
            MoveAnalysis.is_user_move.is_(True),
            MoveAnalysis.classification.is_not(None),
            MoveAnalysis.best_uci.is_not(None),
        )
        .all()
    )
    # Prune drills whose source move is gone (re-analysis replaces MoveAnalysis rows).
    live_move_ids = {m.id for m in moves}
    orphaned = (
        db.query(TrainingDrill)
        .filter(TrainingDrill.user_id == user_id)
        .all()
    )
    for d in orphaned:
        if d.move_analysis_id not in live_move_ids:
            db.query(TrainingAttempt).filter(TrainingAttempt.drill_id == d.id).delete()
            db.delete(d)
    have = {
        d.move_analysis_id
        for d in db.query(TrainingDrill).filter(TrainingDrill.user_id == user_id).all()
    }
    games = db.query(Game).filter(Game.user_id == user_id).all()
    game_by_id = {g.id: g for g in games}
    created = 0
    for m in moves:
        if m.id in have or created >= MAX_DRILLS:
            continue
        g = game_by_id.get(m.game_id)
        if g is None:
            continue
        pos = ground_position(g.pgn, m.ply)
        if pos is None:
            continue
        fen_before, _ = pos
        try:
            chess.Move.from_uci(m.best_uci or "")
        except ValueError:
            continue
        db.add(
            TrainingDrill(
                user_id=user_id, game_id=m.game_id, move_analysis_id=m.id,
                fen_before=fen_before, classification=m.classification or "",
                phase=phase_for_ply(m.ply),
                opening=(g.opening_name or "").strip() or None,
                played_san=m.played_san, best_uci=m.best_uci or "",
                best_san=m.best_san, pv_sans=m.pv_sans,
            )
        )
        created += 1
    db.commit()
    return created


def _solved_ids(db: Session, user_id: int) -> set[int]:
    rows = (
        db.query(TrainingAttempt.drill_id)
        .filter(TrainingAttempt.user_id == user_id, TrainingAttempt.correct.is_(True))
        .all()
    )
    return {r[0] for r in rows}


def is_solved(db: Session, user_id: int, drill_id: int) -> bool:
    return (
        db.query(TrainingAttempt.id)
        .filter(
            TrainingAttempt.drill_id == drill_id,
            TrainingAttempt.user_id == user_id,
            TrainingAttempt.correct.is_(True),
        )
        .first()
        is not None
    )


def list_drills(db: Session, user_id: int, include_solved: bool = False) -> list[DrillOut]:
    sync_drills(db, user_id)
    drills = db.query(TrainingDrill).filter(TrainingDrill.user_id == user_id).all()
    solved = _solved_ids(db, user_id)
    out: list[DrillOut] = []
    for d in drills:
        is_solved = d.id in solved
        if is_solved and not include_solved:
            continue
        out.append(_to_out(d, is_solved))
    out.sort(key=lambda x: (SEVERITY_RANK.get(x.classification, 9), x.id))
    return out


def _to_out(d: TrainingDrill, solved: bool = False) -> DrillOut:
    return DrillOut(
        id=d.id, game_id=d.game_id, fen_before=d.fen_before,
        classification=d.classification, phase=d.phase, opening=d.opening,
        played_san=d.played_san, best_san=d.best_san, pv_sans=d.pv_sans,
        solved=solved, has_coaching=bool(d.coaching_hint),
    )


def grade_attempt(db: Session, user_id: int, drill_id: int, played_uci: str) -> tuple[bool, bool, str | None]:
    """Validate + grade. Returns (correct, equivalent, played_san). Raises ValueError on bad input."""
    drill = (
        db.query(TrainingDrill)
        .filter(TrainingDrill.id == drill_id, TrainingDrill.user_id == user_id)
        .first()
    )
    if drill is None:
        raise LookupError("Drill not found.")
    try:
        attempt_move = chess.Move.from_uci(played_uci.strip().lower())
    except ValueError:
        raise ValueError("Move must be UCI like e2e4 (promotion: e7e8q).")
    board = chess.Board(drill.fen_before)
    if attempt_move not in board.legal_moves:
        raise ValueError("Illegal move in this position.")
    played_san = board.san(attempt_move)
    expected = chess.Move.from_uci(drill.best_uci)
    equivalent = False
    if attempt_move == expected:
        correct = True
    else:
        # Lazy equivalence: only touch the engine for legal non-exact moves.
        if drill.acceptable_ucis is None:
            from app.services.equivalence import compute_acceptable

            try:
                drill.acceptable_ucis = compute_acceptable(drill.fen_before, drill.best_uci)
            except (OSError, chess.engine.EngineError, ValueError):
                drill.acceptable_ucis = [drill.best_uci]  # engine down: exact-only
            db.commit()
        acceptable = list(drill.acceptable_ucis or [])
        if attempt_move.uci() in acceptable:
            correct, equivalent = True, True
        else:
            correct = False
    db.add(TrainingAttempt(
        drill_id=drill.id, user_id=user_id,
        played_uci=attempt_move.uci(), played_san=played_san, correct=correct,
    ))
    db.commit()
    return correct, equivalent, played_san


def training_stats(db: Session, user_id: int) -> dict:
    sync_drills(db, user_id)
    total = db.query(TrainingDrill).filter(TrainingDrill.user_id == user_id).count()
    solved = len(_solved_ids(db, user_id))
    attempts = db.query(TrainingAttempt).filter(TrainingAttempt.user_id == user_id).count()
    correct = (
        db.query(TrainingAttempt)
        .filter(TrainingAttempt.user_id == user_id, TrainingAttempt.correct.is_(True))
        .count()
    )
    return {
        "total_drills": total, "solved": solved, "unsolved": total - solved,
        "attempts": attempts, "correct_attempts": correct,
    }
