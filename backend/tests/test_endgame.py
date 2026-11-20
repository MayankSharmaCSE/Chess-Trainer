"""Tests for Endgame Drills.

Part 1 validates EVERY drill's starting FEN and model solution line with
python-chess (no engine needed) — the correctness guarantee for the catalog.
Part 2 exercises the API lifecycle (start, move, hint, reveal, reset, complete,
fail, progression) through the route functions, mirroring tests/test_bots.py.
"""

import chess
import pytest
from fastapi import HTTPException

from app.api import routes_endgame as routes
from app.db.base import SessionLocal, init_db
from app.models.user import User
from app.schemas.endgame import MoveIn
from app.services import endgame
from app.services.endgame_drills import CATEGORIES, DRILLS, DRILL_BY_ID, drills_in_category


@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_user(db_session):
    u = db_session.query(User).filter(User.username == "endgame_tester").first()
    if not u:
        u = User(username="endgame_tester", email="endgame@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return u


# ---------------------------------------------------------------------------
# Part 1 — catalog integrity (pure python-chess, no engine)
# ---------------------------------------------------------------------------


def test_catalog_shape():
    assert len(CATEGORIES) == 4
    assert len(DRILLS) == 20
    assert len(DRILL_BY_ID) == 20
    for cat in CATEGORIES:
        siblings = drills_in_category(cat["id"])
        assert len(siblings) == 5
        assert [d["level"] for d in siblings] == [1, 2, 3, 4, 5]
    for d in DRILLS:
        assert len(d["hints"]) == 3
        assert len(d["star_moves"]) == 2
        assert d["star_moves"][0] <= d["star_moves"][1] <= d["max_moves"]
        assert d["player_color"] == "white"
        assert d["difficulty"] in ("Beginner", "Intermediate", "Advanced")
        assert d["instructions"] and d["tips"]


@pytest.mark.parametrize("drill", DRILLS, ids=[d["id"] for d in DRILLS])
def test_starting_fen_is_valid(drill):
    board = chess.Board(drill["fen"])
    assert board.is_valid(), f"{drill['id']} invalid FEN"
    assert board.status() == chess.STATUS_VALID, f"{drill['id']} status {board.status()}"
    assert not board.is_game_over(), f"{drill['id']} already over at start"
    assert board.turn == chess.WHITE, f"{drill['id']} must be white to move"
    assert board.king(chess.WHITE) is not None and board.king(chess.BLACK) is not None


@pytest.mark.parametrize("drill", DRILLS, ids=[d["id"] for d in DRILLS])
def test_model_line_is_legal_and_completes(drill):
    board = chess.Board(drill["fen"])
    promoted = False
    promoted_piece = None
    checks = 0
    for san in drill["solution_sans"]:
        move = board.parse_san(san)  # raises on illegal/ambiguous SAN
        assert move in board.legal_moves, f"{drill['id']} illegal model move {san}"
        if move.promotion:
            promoted = True
            promoted_piece = chess.piece_symbol(move.promotion)
        board.push(move)
        if board.is_check():
            checks += 1
    if not drill["model_complete"]:
        return  # partial illustrative opening (bishop-knight-4); legality is enough
    obj = drill["objective"]
    t = obj["type"]
    if t == "checkmate":
        assert board.is_checkmate(), f"{drill['id']} model line does not mate"
    elif t == "promote":
        assert promoted, f"{drill['id']} model line never promotes"
        if obj.get("piece"):
            assert promoted_piece == obj["piece"], f"{drill['id']} promoted to wrong piece"
    elif t == "win_material":
        assert not any(
            p.piece_type == obj["piece_type"] and p.color == chess.BLACK
            for p in board.piece_map().values()
        ), f"{drill['id']} model line does not win the material"
    else:
        assert endgame.objective_met(board, drill, checks), f"{drill['id']} model line misses objective"


def test_two_knights_theory_is_accurate():
    # The lone-king drill must be a mate-in-1 net (mate possible only after a
    # defender error), and the forced-mate drills must include a black pawn.
    k1 = DRILL_BY_ID["knight-1"]
    b = chess.Board(k1["fen"])
    assert not b.is_game_over()
    assert b.is_checkmate() is False
    # Nec2# is mate
    b.push(b.parse_san("Nec2#"))
    assert b.is_checkmate()
    # a quiet move stalemates (the core lesson)
    b2 = chess.Board(k1["fen"])
    b2.push(b2.parse_san("Kc2"))
    assert b2.is_stalemate()
    for did in ("knight-4", "knight-5"):
        board = chess.Board(DRILL_BY_ID[did]["fen"])
        assert any(p.piece_type == chess.PAWN and p.color == chess.BLACK for p in board.piece_map().values())


# ---------------------------------------------------------------------------
# Part 2 — API lifecycle
# ---------------------------------------------------------------------------


def test_hub_and_locking(db_session, test_user):
    hub = routes.get_hub(db_session, test_user)
    assert len(hub.categories) == 4
    assert hub.stats.total_drills == 20
    rook = next(c for c in hub.categories if c.id == "rook")
    assert rook.drills[0].locked is False
    assert rook.drills[1].locked is True  # level 2 locked until level 1 done


def test_start_locked_drill_forbidden(db_session, test_user):
    with pytest.raises(HTTPException) as exc:
        routes.start_drill("rook-2", db_session, test_user)
    assert exc.value.status_code == 403


def test_start_and_move_rook_drill(db_session, test_user):
    attempt = routes.start_drill("rook-1", db_session, test_user)
    assert attempt.status == "in_progress"
    assert attempt.fen == DRILL_BY_ID["rook-1"]["fen"]
    assert attempt.player_moves == 0

    # Illegal move rejected.
    with pytest.raises(HTTPException) as exc:
        routes.make_move(attempt.id, MoveIn(move="e2e4"), db_session, test_user)
    assert exc.value.status_code == 400

    # Legal rook move d1d4 (Rd4).
    after = routes.make_move(attempt.id, MoveIn(move="d1d4"), db_session, test_user)
    assert after.player_moves == 1
    assert len(after.moves) == 2  # player + defender reply
    assert after.moves[0].san == "Rd4"
    assert after.turn == "white"
    assert after.last_move is not None

    # Idempotent start returns the same in-progress attempt.
    again = routes.start_drill("rook-1", db_session, test_user)
    assert again.id == attempt.id


def test_hint_levels_and_reset(db_session, test_user):
    attempt = routes.start_drill("rook-1", db_session, test_user)
    h1 = routes.get_hint(attempt.id, db_session, test_user)
    assert h1.level == 1 and h1.text
    h2 = routes.get_hint(attempt.id, db_session, test_user)
    assert h2.level == 2
    h3 = routes.get_hint(attempt.id, db_session, test_user)
    assert h3.level == 3
    assert h3.best_san and h3.from_square and h3.to_square
    assert h3.hints_used == 3

    reset = routes.reset_attempt(attempt.id, db_session, test_user)
    assert reset.player_moves == 0
    assert reset.moves == []
    assert reset.hints_used == 0
    assert reset.status == "in_progress"
    assert reset.fen == DRILL_BY_ID["rook-1"]["fen"]


def test_reveal_solution(db_session, test_user):
    attempt = routes.start_drill("rook-1", db_session, test_user)
    rev = routes.reveal_solution(attempt.id, db_session, test_user)
    assert rev.model_line == DRILL_BY_ID["rook-1"]["solution_sans"]
    assert rev.solution_revealed is True


def test_complete_knight_mate_and_unlock(db_session, test_user):
    attempt = routes.start_drill("knight-1", db_session, test_user)
    done = routes.make_move(attempt.id, MoveIn(move="e3c2"), db_session, test_user)  # Nec2#
    assert done.status == "completed"
    assert done.is_checkmate
    assert done.objective_met
    assert done.stars == 3  # 1 move, no hints, no mistakes
    assert done.accuracy == 100.0
    assert done.next_drill_id == "knight-2"

    # knight-2 now unlocked.
    detail = routes.get_drill("knight-2", db_session, test_user)
    assert detail.locked is False
    stats = routes.get_progress(db_session, test_user)
    assert stats.completed >= 1
    assert stats.success_rate is not None


def test_stalemate_failure_then_retry(db_session, test_user):
    attempt = routes.start_drill("knight-1", db_session, test_user)
    failed = routes.make_move(attempt.id, MoveIn(move="c1c2"), db_session, test_user)  # Kc2?? stalemate
    assert failed.status == "failed"
    assert failed.fail_reason == "stalemate"
    assert failed.is_stalemate
    assert failed.feedback and failed.feedback.tone == "bad"
    # Retry resets to a fresh, playable attempt.
    retry = routes.reset_attempt(attempt.id, db_session, test_user)
    assert retry.status == "in_progress"
    assert retry.player_moves == 0


def test_underpromotion_fork_wins_rook(db_session, test_user):
    # Unlock pawn-4 by recording its prerequisites as completed.
    for pid in ("pawn-1", "pawn-2", "pawn-3"):
        row = routes._progress_row(db_session, test_user.id, pid)
        row.completed = True
    db_session.commit()
    attempt = routes.start_drill("pawn-4", db_session, test_user)
    after_fork = routes.make_move(attempt.id, MoveIn(move="f7f8n"), db_session, test_user)  # f8=N+
    assert after_fork.status == "in_progress"
    assert after_fork.moves[0].san == "f8=N+"
    assert after_fork.player_moves == 1
    assert after_fork.mistakes == 0  # the correct tactic is not flagged
    # Capture the rook with the new knight.
    done = routes.make_move(attempt.id, MoveIn(move="f8h7"), db_session, test_user)  # Nxh7
    assert done.status == "completed"
    assert done.objective_met
    assert "r" in done.captured_black  # the black rook was captured


def test_active_attempt_resume(db_session, test_user):
    attempt = routes.start_drill("pawn-1", db_session, test_user)
    routes.make_move(attempt.id, MoveIn(move="d6e6"), db_session, test_user)  # Ke6
    active = routes.get_active_attempt("pawn-1", db_session, test_user)
    assert active is not None
    assert active.id == attempt.id
    assert active.player_moves == 1