"""API routes for Endgame Drills.

Server-authoritative sessions (mirrors the Bot Arena pattern): the client sends
UCI moves, the backend validates with python-chess, replies with the defender's
move (Stockfish / script / heuristic), grades the objective and persists progress.
"""

from __future__ import annotations

from datetime import datetime, timezone

import chess
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.endgame import (
    EndgameAttempt,
    EndgameGenerated,
    EndgameHistory,
    EndgameProgress,
    EndgameSession,
)
from app.models.user import User
from app.schemas.endgame import (
    AttemptOut,
    CategoryOut,
    DrillDetailOut,
    DrillProgressOut,
    DrillSummaryOut,
    FeedbackOut,
    GenerateIn,
    HintOut,
    HubOut,
    MoveIn,
    MoveItem,
    RecentChallengeOut,
    RevealOut,
    SessionBundleOut,
    SessionOut,
    SessionStartIn,
    StatsOut,
    SubcategoryOut,
    SubcategoryProgressOut,
    TaxonomyCategoryOut,
    TaxonomyOut,
)
from app.services import endgame
from app.services import endgame_gen
from app.services.endgame_gen import difficulty as dm
from app.services.endgame_gen.taxonomy import (
    ENDGAME_CATEGORIES,
    CATEGORY_BY_ID as TAX_CATEGORY_BY_ID,
    SUBCATEGORY_BY_ID,
)
from app.services.endgame_drills import (
    CATEGORIES,
    DRILLS,
    CATEGORY_BY_ID,
    drills_in_category,
    next_drill_id,
    previous_drill_id,
)

router = APIRouter(prefix="/api/endgame", tags=["endgame-drills"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _elapsed(started_at: datetime, completed_at: datetime | None) -> int:
    end = _as_utc(completed_at) or _utcnow()
    start = _as_utc(started_at) or end
    return max(0, int((end - start).total_seconds()))


def _progress_row(db: Session, user_id: int, drill_id: str) -> EndgameProgress:
    row = (
        db.query(EndgameProgress)
        .filter(EndgameProgress.user_id == user_id, EndgameProgress.drill_id == drill_id)
        .first()
    )
    if row is None:
        row = EndgameProgress(user_id=user_id, drill_id=drill_id)
        db.add(row)
        db.flush()
    return row


def _is_locked(db: Session, user_id: int, drill: dict) -> bool:
    prev_id = previous_drill_id(drill["id"])
    if not prev_id:
        return False
    prev = (
        db.query(EndgameProgress)
        .filter(EndgameProgress.user_id == user_id, EndgameProgress.drill_id == prev_id)
        .first()
    )
    return not (prev and prev.completed)


def _progress_out(row: EndgameProgress | None) -> DrillProgressOut:
    if row is None:
        return DrillProgressOut()
    return DrillProgressOut.model_validate(row)


def _stats(db: Session, user_id: int) -> StatsOut:
    rows = db.query(EndgameProgress).filter(EndgameProgress.user_id == user_id).all()
    completed = sum(1 for r in rows if r.completed)
    total_stars = sum(r.stars for r in rows)
    attempts = sum(r.attempts for r in rows)
    completions = sum(r.completions for r in rows)
    hints = sum(r.hints_total for r in rows)
    rate = round(100.0 * completions / attempts, 1) if attempts else None
    gen_completed = sum(1 for r in rows if r.completed and r.drill_id.startswith("gen-"))
    sessions = db.query(EndgameSession).filter(EndgameSession.user_id == user_id).all()
    best_streak = max((s.best_streak for s in sessions), default=0)
    return StatsOut(
        total_drills=len(DRILLS),
        completed=completed,
        total_stars=total_stars,
        max_stars=len(DRILLS) * 3,
        attempts=attempts,
        completions=completions,
        success_rate=rate,
        hints_used=hints,
        best_streak=best_streak,
        generated_completed=gen_completed,
    )


def _attempt_out(
    attempt: EndgameAttempt,
    drill: dict,
    feedback: FeedbackOut | None = None,
    db: Session | None = None,
) -> AttemptOut:
    board = chess.Board(attempt.fen)
    cap_w, cap_b, adv = endgame.captured_and_material(attempt.start_fen, board, drill["player_color"])
    moves = [MoveItem(**m) for m in (attempt.moves or [])]
    stars = accuracy = None
    if attempt.status == "completed":
        stars = endgame.compute_stars(
            attempt.player_moves, drill["star_moves"], attempt.hints_used,
            attempt.mistakes, attempt.solution_revealed,
        )
        accuracy = endgame.compute_accuracy(attempt.mistakes, attempt.hints_used, attempt.solution_revealed)
    nxt = next_drill_id(drill["id"]) if attempt.status == "completed" and not drill.get("generated") else None
    session = None
    if db is not None and attempt.session_id:
        srow = db.get(EndgameSession, attempt.session_id)
        if srow is not None:
            session = SessionOut.model_validate(srow)
    return AttemptOut(
        id=attempt.id,
        drill_id=attempt.drill_id,
        status=attempt.status,
        fail_reason=attempt.fail_reason,
        objective_met=attempt.objective_met,
        fen=attempt.fen,
        start_fen=attempt.start_fen,
        player_color=drill["player_color"],
        turn="white" if board.turn == chess.WHITE else "black",
        is_check=board.is_check(),
        is_checkmate=board.is_checkmate(),
        is_stalemate=board.is_stalemate(),
        is_game_over=board.is_game_over(),
        moves=moves,
        player_moves=attempt.player_moves,
        max_moves=drill["max_moves"],
        moves_left=max(0, drill["max_moves"] - attempt.player_moves),
        last_move=attempt.last_move,
        captured_white=cap_w,
        captured_black=cap_b,
        material_advantage=adv,
        hints_used=attempt.hints_used,
        hint_level=attempt.hint_level,
        mistakes=attempt.mistakes,
        solution_revealed=attempt.solution_revealed,
        eval_cp=attempt.eval_cp,
        eval_mate=attempt.eval_mate,
        objective=drill["objective"],
        objective_label=drill["objective_label"],
        started_at=_as_utc(attempt.started_at),
        completed_at=_as_utc(attempt.completed_at),
        elapsed_seconds=_elapsed(attempt.started_at, attempt.completed_at),
        stars=stars,
        accuracy=accuracy,
        feedback=feedback,
        next_drill_id=nxt,
        engine_available=endgame.engine_available(),
        session_id=attempt.session_id,
        session=session,
    )


def _fail_explanation(drill: dict, reason: str) -> str:
    if reason == "stalemate":
        if drill["category"] == "knights":
            return (
                "Stalemate — a draw. This is the two-knights tragedy: the lone king had no "
                "moves and was not in check. You must give check to keep the game alive. Retry and find the mating check."
            )
        return (
            "Stalemate — a draw. The defender had no legal moves but was not in check. "
            "In winning endgames, always leave the enemy king a square until the final mating check."
        )
    if reason == "out_of_moves":
        return (
            f"You used all {drill['max_moves']} moves without completing the objective. "
            "Retry and use the hints to find the most efficient path — technique is about economy of moves."
        )
    if reason == "wrong_promotion":
        return "You promoted to the wrong piece for this drill. Retry and choose the piece the objective asks for."
    if reason == "promotion":
        return (
            "The opponent promoted — the defence collapsed. In drawn endings, stop the pawn "
            "before it queens: blockade it, check the king away, or find the stalemate resource. Retry."
        )
    if reason == "lost":
        return (
            "The position became decisively lost before the move budget ended. Defence must stay "
            "accurate to the very end — retry and keep the drawing resource alive."
        )
    if reason == "mated":
        return "Your king was checkmated. Retry — keep your king safe while you convert the position."
    return (
        "The position ended in a draw (repetition, the 50-move rule or insufficient material). "
        "Winning endgames must keep making progress — avoid shuffling and retry."
    )


def _record_move(attempt: EndgameAttempt, color: str, move: chess.Move, san: str) -> None:
    ply = len(attempt.moves) + 1
    attempt.moves = [
        *(attempt.moves or []),
        {
            "move_number": (ply + 1) // 2,
            "ply": ply,
            "san": san,
            "uci": move.uci(),
            "color": color,
        },
    ]


def _drill_detail(db: Session, user_id: int, drill: dict) -> DrillDetailOut:
    row = db.query(EndgameProgress).filter(
        EndgameProgress.user_id == user_id, EndgameProgress.drill_id == drill["id"]
    ).first()
    cat = CATEGORY_BY_ID.get(drill["category"]) or TAX_CATEGORY_BY_ID[drill["category"]]
    generated = bool(drill.get("generated"))
    sub = drill.get("subcategory")
    return DrillDetailOut(
        id=drill["id"], category=drill["category"], category_title=cat["title"], level=drill["level"],
        title=drill["title"], tagline=drill["tagline"], difficulty=drill["difficulty"], fen=drill["fen"],
        player_color=drill["player_color"], objective=drill["objective"], objective_label=drill["objective_label"],
        max_moves=drill["max_moves"], star_moves=drill["star_moves"], est_minutes=drill["est_minutes"],
        instructions=drill["instructions"], tips=drill["tips"], theory=cat["theory"],
        hint_count=len(drill["hints"]), strict=drill["strict"], progress=_progress_out(row),
        locked=False if generated else _is_locked(db, user_id, drill),
        next_drill_id=None if generated else next_drill_id(drill["id"]),
        previous_drill_id=None if generated else previous_drill_id(drill["id"]),
        engine_available=endgame.engine_available(),
        generated=generated, challenge_id=drill.get("challenge_id"), hint_max=drill.get("hint_max", 3),
        subcategory=sub, subcategory_title=SUBCATEGORY_BY_ID.get(sub, {}).get("title") if sub else None,
    )


def _persist_generated(db: Session, drill: dict) -> None:
    if not drill.get("generated"):
        return
    if db.get(EndgameGenerated, drill["id"]) is None:
        db.add(EndgameGenerated(
            challenge_id=drill["id"], category=drill["category"],
            difficulty=drill["difficulty"], config=drill,
        ))


def _new_attempt(db: Session, user: User, drill: dict, session_id: int | None = None) -> EndgameAttempt:
    attempt = EndgameAttempt(
        user_id=user.id, drill_id=drill["id"], start_fen=drill["fen"], fen=drill["fen"],
        moves=[], started_at=_utcnow(), session_id=session_id,
    )
    ev = endgame.evaluate_position(drill["fen"], depth=12)
    if ev:
        attempt.eval_cp = ev.get("score_cp")
        attempt.eval_mate = ev.get("mate_moves")
    db.add(attempt)
    row = _progress_row(db, user.id, drill["id"])
    row.attempts += 1
    row.last_played_at = _utcnow()
    return attempt


def _update_session(db: Session, attempt: EndgameAttempt, success: bool, stars: int) -> None:
    if not attempt.session_id:
        return
    s = db.get(EndgameSession, attempt.session_id)
    if s is None or s.status != "active":
        return
    s.total_seconds += _elapsed(attempt.started_at, attempt.completed_at)
    if success:
        s.completed += 1
        s.correct += 1
        s.streak += 1
        s.best_streak = max(s.best_streak, s.streak)
        bonus = {"Beginner": 50, "Intermediate": 100, "Advanced": 150}.get(s.difficulty, 100)
        s.score += stars * 100 + bonus + s.streak * 10
    else:
        s.incorrect += 1
        s.streak = 0
    if s.target_count > 0 and s.completed >= s.target_count:
        s.status = "completed"
        s.ended_at = _utcnow()


def _session_bundle(db: Session, s: EndgameSession, drill: dict, attempt: EndgameAttempt) -> SessionBundleOut:
    return SessionBundleOut(
        session=SessionOut.model_validate(s),
        drill=_drill_detail(db, s.user_id, drill),
        attempt=_attempt_out(attempt, drill, db=db),
    )


@router.get("/drills", response_model=HubOut)
def get_hub(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> HubOut:
    """Catalog + per-drill progress + category summaries + global stats."""
    rows = {
        r.drill_id: r
        for r in db.query(EndgameProgress).filter(EndgameProgress.user_id == user.id).all()
    }
    gen_rows = db.query(EndgameGenerated).all()
    gen_cat = {g.challenge_id: g.category for g in gen_rows}
    gen_cfg = {g.challenge_id: g.config for g in gen_rows}
    sessions = db.query(EndgameSession).filter(EndgameSession.user_id == user.id).all()
    hist = (
        db.query(EndgameHistory)
        .filter(EndgameHistory.user_id == user.id)
        .order_by(EndgameHistory.id.desc())
        .limit(200)
        .all()
    )
    categories: list[CategoryOut] = []
    for cat in CATEGORIES:
        summaries: list[DrillSummaryOut] = []
        cat_completed = cat_stars = 0
        for d in drills_in_category(cat["id"]):
            row = rows.get(d["id"])
            locked = _is_locked(db, user.id, d)
            prog = _progress_out(row)
            if prog.completed:
                cat_completed += 1
                cat_stars += prog.stars
            summaries.append(
                DrillSummaryOut(
                    id=d["id"], category=d["category"], level=d["level"], title=d["title"],
                    tagline=d["tagline"], difficulty=d["difficulty"], est_minutes=d["est_minutes"],
                    objective_label=d["objective_label"], max_moves=d["max_moves"],
                    progress=prog, locked=locked,
                )
            )
        gen_completed = gen_attempts = gen_completions = 0
        for rid, r in rows.items():
            if rid.startswith("gen-") and gen_cat.get(rid) == cat["id"]:
                gen_attempts += r.attempts
                gen_completions += r.completions
                if r.completed:
                    gen_completed += 1
        accuracy = round(100.0 * gen_completions / gen_attempts, 1) if gen_attempts else None
        best_streak = max((s.best_streak for s in sessions if s.category == cat["id"]), default=0)
        recent: list[RecentChallengeOut] = []
        for h in hist:
            if h.category != cat["id"]:
                continue
            cfg = gen_cfg.get(h.challenge_id)
            if not cfg:
                continue
            pr = rows.get(h.challenge_id)
            recent.append(RecentChallengeOut(
                challenge_id=h.challenge_id,
                title=cfg.get("title", "Challenge"),
                difficulty=cfg.get("difficulty", ""),
                result="completed" if (pr and pr.completed) else "attempted",
                stars=pr.stars if pr else 0,
            ))
            if len(recent) >= 5:
                break
        categories.append(
            CategoryOut(
                id=cat["id"], title=cat["title"], glyph=cat["glyph"], accent=cat["accent"],
                tagline=cat["tagline"], description=cat["description"], theory=cat["theory"],
                drills=summaries, completed=cat_completed, total=len(summaries), stars=cat_stars,
                gen_completed=gen_completed, gen_attempts=gen_attempts, best_streak=best_streak,
                accuracy=accuracy, recent=recent,
            )
        )
    return HubOut(categories=categories, stats=_stats(db, user.id))


@router.get("/progress", response_model=StatsOut)
def get_progress(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> StatsOut:
    return _stats(db, user.id)


@router.get("/drills/{drill_id}", response_model=DrillDetailOut)
def get_drill(drill_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DrillDetailOut:
    drill = endgame.get_drill(drill_id, db)
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    return _drill_detail(db, user.id, drill)


@router.get("/drills/{drill_id}/active", response_model=AttemptOut | None)
def get_active_attempt(drill_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Resume an in-progress session after a refresh, if one exists."""
    drill = endgame.get_drill(drill_id, db)
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    attempt = (
        db.query(EndgameAttempt)
        .filter(
            EndgameAttempt.user_id == user.id,
            EndgameAttempt.drill_id == drill_id,
            EndgameAttempt.status == "in_progress",
        )
        .order_by(EndgameAttempt.id.desc())
        .first()
    )
    return _attempt_out(attempt, drill, db=db) if attempt else None


@router.post("/drills/{drill_id}/start", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def start_drill(drill_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AttemptOut:
    drill = endgame.get_drill(drill_id, db)
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    if _is_locked(db, user.id, drill):
        prev = endgame.get_drill(previous_drill_id(drill_id), db)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Locked. Complete “{prev['title']}” first.",
        )
    existing = (
        db.query(EndgameAttempt)
        .filter(
            EndgameAttempt.user_id == user.id,
            EndgameAttempt.drill_id == drill_id,
            EndgameAttempt.status == "in_progress",
        )
        .order_by(EndgameAttempt.id.desc())
        .first()
    )
    if existing:
        return _attempt_out(existing, drill, db=db)

    attempt = _new_attempt(db, user, drill)
    db.commit()
    db.refresh(attempt)
    return _attempt_out(attempt, drill, FeedbackOut(tone="info", message="Drill started. White to move — complete the objective."), db=db)


@router.post("/attempts/{attempt_id}/move", response_model=AttemptOut)
def make_move(attempt_id: int, payload: MoveIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AttemptOut:
    attempt = db.query(EndgameAttempt).filter(
        EndgameAttempt.id == attempt_id, EndgameAttempt.user_id == user.id
    ).first()
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    drill = endgame.get_drill(attempt.drill_id, db)
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    if attempt.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This drill is already finished. Reset to play again.")

    board = chess.Board(attempt.fen)
    player_is_white = drill["player_color"] == "white"
    if (board.turn == chess.WHITE) != player_is_white:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="It is not your turn.")

    try:
        move = chess.Move.from_uci(payload.move.strip())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid move: '{payload.move}'.")
    if move not in board.legal_moves:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That move is not legal in this position.")

    eval_before = (attempt.eval_cp, attempt.eval_mate)
    san = board.san(move)
    history_before = [m["san"] for m in (attempt.moves or [])]
    mover_color = "white" if board.turn == chess.WHITE else "black"
    board.push(move)
    _record_move(attempt, mover_color, move, san)
    attempt.player_moves += 1
    if board.is_check():
        attempt.checks_given += 1
    attempt.last_move = [chess.square_name(move.from_square), chess.square_name(move.to_square)]
    attempt.hint_level = 0

    feedback: FeedbackOut | None = None
    obj = drill["objective"]
    defending = obj["type"] == "defend"

    def is_lost(cp: int | None, mate: int | None) -> bool:
        """Player is White: a decisive edge FOR BLACK means the defence failed."""
        if mate is not None:
            return mate < 0
        return cp is not None and cp <= -300

    def finish_success(msg: str) -> None:
        attempt.status = "completed"
        attempt.objective_met = True
        attempt.completed_at = _utcnow()
        attempt.eval_cp = None
        attempt.eval_mate = 0 if board.is_checkmate() else attempt.eval_mate
        row = _progress_row(db, user.id, drill["id"])
        row.completed = True
        row.completions += 1
        row.last_played_at = _utcnow()
        stars = endgame.compute_stars(attempt.player_moves, drill["star_moves"], attempt.hints_used, attempt.mistakes, attempt.solution_revealed)
        row.stars = max(row.stars, stars)
        row.best_moves = attempt.player_moves if row.best_moves is None else min(row.best_moves, attempt.player_moves)
        secs = _elapsed(attempt.started_at, attempt.completed_at)
        row.best_time_seconds = secs if row.best_time_seconds is None else min(row.best_time_seconds, secs)
        _update_session(db, attempt, True, stars)
        nonlocal feedback
        feedback = FeedbackOut(tone="good", message=msg)

    def finish_fail(reason: str) -> None:
        attempt.status = "failed"
        attempt.fail_reason = reason
        attempt.completed_at = _utcnow()
        row = _progress_row(db, user.id, drill["id"])
        row.last_played_at = _utcnow()
        _update_session(db, attempt, False, 0)
        nonlocal feedback
        feedback = FeedbackOut(tone="bad", message=_fail_explanation(drill, reason))

    # 1) Terminal states first — stalemate is a failure in win drills, but a
    #    SUCCESS in defend drills (a draw is the objective). Never let a
    #    stalemate satisfy a 'mobility 0' style objective.
    if board.is_checkmate():
        finish_success(f"Checkmate! {drill['objective_label']} Objective achieved in {attempt.player_moves} moves.")
    elif board.is_stalemate():
        if defending:
            finish_success("Stalemate — a draw! You saved the game with the stalemate resource.")
        else:
            finish_fail("stalemate")
    elif board.is_insufficient_material():
        if defending:
            finish_success("Insufficient material — a draw! The defence held.")
        else:
            finish_fail("draw_material")
    elif board.can_claim_threefold_repetition():
        if defending:
            finish_success("Threefold repetition — a draw! Excellent defence.")
        else:
            finish_fail("draw_repetition")
    elif board.can_claim_fifty_moves():
        if defending:
            finish_success("Fifty-move rule — a draw! The defence held.")
        else:
            finish_fail("draw_50")
    # 2) Defend drills: surviving the move budget without a lost position wins.
    elif defending and attempt.player_moves >= drill["max_moves"]:
        if is_lost(attempt.eval_cp, attempt.eval_mate):
            finish_fail("lost")
        else:
            finish_success(f"Held the position for {attempt.player_moves} moves — the draw is secured!")
    # 3) Promotion objectives.
    elif move.promotion and obj["type"] == "promote":
        required = obj.get("piece")
        if required is None or chess.piece_symbol(move.promotion) == required:
            finish_success(f"Promoted to a {chess.piece_name(move.promotion)}! Objective achieved.")
        else:
            finish_fail("wrong_promotion")
    # 4) Material objectives (opponent is side to move after the player's move).
    elif obj["type"] == "win_material" and not any(
        p.piece_type == obj["piece_type"] for p in board.piece_map().values() if p.color == board.turn
    ):
        finish_success("Material won! Objective achieved.")
    # 5) Positional objectives (sticky, evaluated right after the player's move).
    elif endgame.objective_met(board, drill, attempt.checks_given):
        finish_success(f"Objective achieved — {drill['objective_label']}")
    # 6) Move budget exhausted.
    elif attempt.player_moves >= drill["max_moves"]:
        finish_fail("out_of_moves")
    else:
        # Strict drills: flag deviation from the model technique.
        if drill["strict"]:
            line = drill["solution_sans"]
            n = len(history_before)
            if n < len(line) and history_before == line[:n] and san != line[n]:
                attempt.mistakes += 1
                feedback = FeedbackOut(tone="warn", message=f"{san} is legal, but the model technique here is {line[n]}. Keep going or reset.")
        # Defender replies.
        history_now = [m["san"] for m in attempt.moves]
        opp_uci, _source = endgame.opponent_move(board, drill, history_now)
        opp_move = chess.Move.from_uci(opp_uci)
        opp_san = board.san(opp_move)
        opp_color = "white" if board.turn == chess.WHITE else "black"
        board.push(opp_move)
        _record_move(attempt, opp_color, opp_move, opp_san)
        attempt.last_move = [chess.square_name(opp_move.from_square), chess.square_name(opp_move.to_square)]

        if board.is_checkmate():
            finish_fail("mated")
        elif board.is_stalemate():
            if defending:
                finish_success("Stalemate — a draw! You saved the game with the stalemate resource.")
            else:
                finish_fail("stalemate")
        elif board.is_insufficient_material() or board.can_claim_threefold_repetition() or board.can_claim_fifty_moves():
            if defending:
                finish_success("Draw claimed — excellent defence!")
            else:
                finish_fail("draw_repetition")
        elif defending and opp_move.promotion:
            finish_fail("promotion")
        else:
            ev = endgame.evaluate_position(board.fen(), depth=12)
            if ev:
                attempt.eval_cp = ev.get("score_cp")
                attempt.eval_mate = ev.get("mate_moves")
                if defending:
                    # Defence grading: flag only the transition into a lost position
                    # (small cp swings are normal in drawn endings).
                    if is_lost(attempt.eval_cp, attempt.eval_mate) and not is_lost(*eval_before):
                        attempt.mistakes += 1
                        feedback = FeedbackOut(tone="warn", message=f"{san} let the attack break through — the position is now lost. Find the drawing resource or reset.")
                # Free-play drills grade by centipawn loss; strict drills are
                # graded by model-line deviation above (a pending tactic can
                # dip in eval before the capture lands, so cp-loss is noise).
                elif not drill["strict"] and (eval_before[0] is not None or eval_before[1] is not None):
                    loss = endgame.mover_loss(eval_before, (attempt.eval_cp, attempt.eval_mate), player_is_white)
                    if loss >= endgame.MISTAKE_MIN:
                        attempt.mistakes += 1
                        if feedback is None:
                            feedback = FeedbackOut(tone="warn", message=f"{san} let the defender improve. Keep the initiative and make progress.")
            if feedback is None:
                extra = " Check!" if board.is_check() else ""
                feedback = FeedbackOut(tone="info", message=f"{san} played.{extra} {drill['max_moves'] - attempt.player_moves} moves left.")

    attempt.fen = board.fen()
    db.commit()
    db.refresh(attempt)
    return _attempt_out(attempt, drill, feedback, db=db)


@router.post("/attempts/{attempt_id}/hint", response_model=HintOut)
def get_hint(attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> HintOut:
    attempt = db.query(EndgameAttempt).filter(
        EndgameAttempt.id == attempt_id, EndgameAttempt.user_id == user.id
    ).first()
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    drill = endgame.get_drill(attempt.drill_id, db)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This drill is finished. Reset to use hints again.")

    level = min(drill.get("hint_max", 3), attempt.hint_level + 1)
    attempt.hint_level = level
    attempt.hints_used += 1
    row = _progress_row(db, user.id, drill["id"])
    row.hints_total += 1
    if attempt.session_id:
        s = db.get(EndgameSession, attempt.session_id)
        if s is not None and s.status == "active":
            s.hints += 1

    text = drill["hints"][level - 1]
    best = None
    if level >= 3:
        history = [m["san"] for m in (attempt.moves or [])]
        best = endgame.best_move_hint(attempt.fen, drill, history, depth=14)
        if best:
            if best["source"] == "engine":
                text = (
                    f"Best move: {best['best_san']} — highlighted on the board. "
                    "This is Stockfish's top choice in the current position."
                )
            else:
                text = f"Best move: {best['best_san']}. {text}"
    db.commit()
    return HintOut(
        level=level, text=text,
        best_uci=best["best_uci"] if best else None,
        best_san=best["best_san"] if best else None,
        from_square=best["from"] if best else None,
        to_square=best["to"] if best else None,
        source=best["source"] if best else None,
        hints_used=attempt.hints_used,
    )


@router.post("/attempts/{attempt_id}/reveal", response_model=RevealOut)
def reveal_solution(attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> RevealOut:
    attempt = db.query(EndgameAttempt).filter(
        EndgameAttempt.id == attempt_id, EndgameAttempt.user_id == user.id
    ).first()
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    drill = endgame.get_drill(attempt.drill_id, db)
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drill not found.")
    attempt.solution_revealed = True
    # Build the solution from the EXACT current board state (never the start
    # FEN, never a cached line): fresh isolated engine analysis + sequential
    # python-chess validation of every move.
    history = [m["san"] for m in (attempt.moves or [])]
    sol = endgame.build_solution(attempt.fen, drill, history)
    db.commit()
    sans = [m["san"] for m in sol["moves"]]
    ends_in_mate = bool(sol["moves"]) and sol["moves"][-1]["is_mate"]
    if sol["error"]:
        note = sol["error"]
    elif sol["source"] == "model":
        note = (
            "Verified technique continuation from your current position — it follows the drill's "
            "model line and reaches the objective." if sol["objective_achieved"]
            else "Verified technique continuation from your current position (model line)."
        )
    else:
        note = (
            "Stockfish's verified best continuation from your current position — every move was "
            "validated legal before display." + (" It reaches the objective." if sol["objective_achieved"] else "")
        )
    if ends_in_mate:
        note += " The final move delivers checkmate."
    return RevealOut(
        model_line=drill["solution_sans"],
        pv_sans=sans,
        note=note,
        solution=sol["moves"],
        start_fen=sol["start_fen"],
        final_fen=sol["final_fen"],
        objective_achieved=sol["objective_achieved"],
        source=sol["source"],
        error=sol["error"],
    )


@router.post("/attempts/{attempt_id}/reset", response_model=AttemptOut)
def reset_attempt(attempt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AttemptOut:
    attempt = db.query(EndgameAttempt).filter(
        EndgameAttempt.id == attempt_id, EndgameAttempt.user_id == user.id
    ).first()
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    drill = endgame.get_drill(attempt.drill_id, db)
    attempt.fen = attempt.start_fen
    attempt.moves = []
    attempt.player_moves = 0
    attempt.status = "in_progress"
    attempt.fail_reason = None
    attempt.objective_met = False
    attempt.hints_used = 0
    attempt.hint_level = 0
    attempt.mistakes = 0
    attempt.solution_revealed = False
    attempt.checks_given = 0
    attempt.last_move = None
    attempt.started_at = _utcnow()
    attempt.completed_at = None
    ev = endgame.evaluate_position(attempt.start_fen, depth=12)
    attempt.eval_cp = ev.get("score_cp") if ev else None
    attempt.eval_mate = ev.get("mate_moves") if ev else None
    db.commit()
    db.refresh(attempt)
    return _attempt_out(attempt, drill, FeedbackOut(tone="info", message="Position reset. White to move — try again."), db=db)


# ---------------------------------------------------------------------------
# Dynamic generation + training sessions
# ---------------------------------------------------------------------------


@router.post("/generate", response_model=DrillDetailOut)
def generate_challenge(payload: GenerateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DrillDetailOut:
    """Generate a fresh, validated, Stockfish-verified challenge.

    With `subcategory` the new Chess.com-style taxonomy generator is used;
    otherwise the legacy category generator.
    """
    if payload.subcategory:
        if payload.subcategory not in SUBCATEGORY_BY_ID:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown subcategory.")
    elif payload.category not in CATEGORY_BY_ID and payload.category not in TAX_CATEGORY_BY_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown category.")
    drill = endgame_gen.generate(db, user.id, payload.category, payload.difficulty, subcategory=payload.subcategory)
    _persist_generated(db, drill)
    db.commit()
    return _drill_detail(db, user.id, drill)


@router.get("/taxonomy", response_model=TaxonomyOut)
def get_taxonomy(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TaxonomyOut:
    """Chess.com-style navigation catalog with per-subcategory training progress."""
    rows = {
        r.drill_id: r
        for r in db.query(EndgameProgress).filter(EndgameProgress.user_id == user.id).all()
    }
    gen_rows = db.query(EndgameGenerated).all()
    sub_of = {g.challenge_id: (g.config or {}).get("subcategory") for g in gen_rows}
    agg: dict[str, list[int]] = {}
    for rid, r in rows.items():
        sub = sub_of.get(rid)
        if not sub:
            continue
        a = agg.setdefault(sub, [0, 0, 0])
        if r.completed:
            a[0] += 1
            a[2] += r.stars
        a[1] += r.attempts
    categories: list[TaxonomyCategoryOut] = []
    for cat in ENDGAME_CATEGORIES:
        subs: list[SubcategoryOut] = []
        cat_completed = 0
        for s in cat["subcategories"]:
            completed, attempts, stars = agg.get(s["id"], [0, 0, 0])
            cat_completed += completed
            subs.append(SubcategoryOut(
                id=s["id"], title=s["title"], kind=s["kind"], blurb=s["blurb"],
                progress=SubcategoryProgressOut(completed=completed, attempts=attempts, stars=stars),
            ))
        categories.append(TaxonomyCategoryOut(
            id=cat["id"], title=cat["title"], glyph=cat["glyph"], accent=cat["accent"],
            tagline=cat["tagline"], theory=cat["theory"], completed=cat_completed, subcategories=subs,
        ))
    return TaxonomyOut(categories=categories, engine_available=endgame.engine_available())


@router.post("/sessions/start", response_model=SessionBundleOut, status_code=status.HTTP_201_CREATED)
def start_session(payload: SessionStartIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SessionBundleOut:
    if payload.category not in CATEGORY_BY_ID:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown category.")
    if payload.count not in (0, 5, 10, 20):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Count must be 5, 10, 20 or 0 (endless).")
    s = EndgameSession(
        user_id=user.id, category=payload.category,
        difficulty=dm.normalize(payload.difficulty), target_count=payload.count,
    )
    db.add(s)
    db.flush()
    drill = endgame_gen.generate(db, user.id, payload.category, payload.difficulty)
    _persist_generated(db, drill)
    attempt = _new_attempt(db, user, drill, session_id=s.id)
    s.current_drill_id = drill["id"]
    db.commit()
    db.refresh(s)
    db.refresh(attempt)
    return _session_bundle(db, s, drill, attempt)


@router.post("/sessions/{session_id}/next", response_model=SessionBundleOut)
def session_next(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SessionBundleOut:
    s = db.query(EndgameSession).filter(EndgameSession.id == session_id, EndgameSession.user_id == user.id).first()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if s.status == "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session target reached — start a new session.")
    if s.status == "ended":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session ended.")
    drill = endgame_gen.generate(db, user.id, s.category, s.difficulty)
    _persist_generated(db, drill)
    attempt = _new_attempt(db, user, drill, session_id=s.id)
    s.current_drill_id = drill["id"]
    db.commit()
    db.refresh(s)
    db.refresh(attempt)
    return _session_bundle(db, s, drill, attempt)


@router.post("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SessionOut:
    s = db.query(EndgameSession).filter(EndgameSession.id == session_id, EndgameSession.user_id == user.id).first()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    if s.status == "active":
        s.status = "ended"
        s.ended_at = _utcnow()
    db.commit()
    db.refresh(s)
    return SessionOut.model_validate(s)


@router.get("/sessions/{session_id}", response_model=SessionBundleOut)
def get_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SessionBundleOut:
    s = db.query(EndgameSession).filter(EndgameSession.id == session_id, EndgameSession.user_id == user.id).first()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    drill = endgame.get_drill(s.current_drill_id, db) if s.current_drill_id else None
    if drill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session has no current challenge.")
    attempt = (
        db.query(EndgameAttempt)
        .filter(EndgameAttempt.user_id == user.id, EndgameAttempt.session_id == s.id,
                EndgameAttempt.drill_id == drill["id"])
        .order_by(EndgameAttempt.id.desc())
        .first()
    )
    if attempt is None:
        attempt = _new_attempt(db, user, drill, session_id=s.id)
        db.commit()
        db.refresh(attempt)
    return _session_bundle(db, s, drill, attempt)