"""Show Solution correctness: every displayed move must be legal from the
EXACT current position, SAN must match, and the objective must be detected.

Covers all four legacy categories (from start AND mid-game), generated
taxonomy drills, poisoned-PV truncation, engine-offline handling and
stale-response isolation.
"""

import chess
import pytest

from app.api import routes_endgame as routes
from app.db.base import SessionLocal, init_db
from app.models.endgame import EndgameProgress
from app.models.user import User
from app.schemas.endgame import MoveIn
from app.services import endgame, endgame_gen
from app.services.endgame_drills import DRILL_BY_ID, drills_in_category


@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_user(db_session):
    u = db_session.query(User).filter(User.username == "eg_solution_tester").first()
    if not u:
        u = User(username="eg_solution_tester", email="egsol@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return u


def _unlock(db, user, drill):
    for sib in drills_in_category(drill["category"]):
        if sib["level"] < drill["level"]:
            row = db.query(EndgameProgress).filter(
                EndgameProgress.user_id == user.id, EndgameProgress.drill_id == sib["id"]).first()
            if row is None:
                row = EndgameProgress(user_id=user.id, drill_id=sib["id"])
                db.add(row)
            row.completed = True
    db.commit()


def _assert_legal_line(start_fen, solution):
    """Replay every structured move; assert legality, SAN and fen_after."""
    board = chess.Board(start_fen)
    for raw in solution:
        m = raw if isinstance(raw, dict) else raw.model_dump()
        mv = chess.Move.from_uci(m["uci"])
        assert mv in board.legal_moves, f"illegal move {m['uci']} in {board.fen()}"
        assert board.san(mv) == m["san"], f"SAN mismatch for {m['uci']}"
        assert m["from_square"] == chess.square_name(mv.from_square)
        assert m["to_square"] == chess.square_name(mv.to_square)
        board.push(mv)
        assert board.fen() == m["fen_after"], "fen_after must match the replayed position"
    return board


LEGACY_DRILLS = ["rook-1", "rook-4", "knight-1", "knight-4",
                 "bishop-knight-1", "bishop-knight-5", "pawn-1", "pawn-4", "pawn-5"]


@pytest.mark.parametrize("did", LEGACY_DRILLS)
def test_solution_legal_from_start(db_session, test_user, did):
    drill = DRILL_BY_ID[did]
    _unlock(db_session, test_user, drill)
    att = routes.start_drill(did, db_session, test_user)
    rev = routes.reveal_solution(att.id, db_session, test_user)
    assert rev.error is None
    assert rev.start_fen == att.fen
    assert len(rev.solution) > 0
    final = _assert_legal_line(att.fen, rev.solution)
    if rev.objective_achieved and drill["objective"]["type"] == "checkmate":
        assert final.is_checkmate()


@pytest.mark.parametrize("did", ["rook-4", "pawn-1", "bishop-knight-1"])
def test_solution_from_current_position_midgame(db_session, test_user, did):
    drill = DRILL_BY_ID[did]
    _unlock(db_session, test_user, drill)
    att = routes.start_drill(did, db_session, test_user)
    att = routes.reset_attempt(att.id, db_session, test_user)  # guarantee the start position
    played = 0
    for san in drill["solution_sans"][:6]:
        if att.status != "in_progress" or played >= 2:
            break
        b = chess.Board(att.fen)
        try:
            mv = b.parse_san(san)
        except (ValueError, chess.IllegalMoveError):
            break
        if mv not in b.legal_moves:
            break
        att = routes.make_move(att.id, MoveIn(move=mv.uci()), db_session, test_user)
        played += 1
    assert played >= 1 and att.status == "in_progress"
    current_fen = att.fen
    assert current_fen != drill["fen"], "test must run from a changed position"
    rev = routes.reveal_solution(att.id, db_session, test_user)
    assert rev.error is None
    assert rev.start_fen == current_fen, "solution must start from the CURRENT FEN, not the drill start"
    assert len(rev.solution) > 0
    _assert_legal_line(current_fen, rev.solution)


def test_mate_solution_reaches_checkmate(db_session, test_user):
    drill = DRILL_BY_ID["knight-1"]
    _unlock(db_session, test_user, drill)
    att = routes.start_drill("knight-1", db_session, test_user)
    rev = routes.reveal_solution(att.id, db_session, test_user)
    assert rev.objective_achieved
    final = _assert_legal_line(att.fen, rev.solution)
    assert final.is_checkmate()


def test_poisoned_pv_never_displayed(db_session, test_user, monkeypatch):
    """An engine PV containing an illegal move must never surface: the line
    is rejected, re-analyzed, and an error is returned instead."""
    fen = "8/8/8/4k3/8/2K5/8/3R4 w - - 0 1"
    drill = {
        "objective": {"type": "checkmate"}, "player_color": "white",
        "max_moves": 20, "solution_sans": [], "hints": ["a", "b", "c"],
    }
    calls = {"n": 0}

    def poisoned(f, depth=10):
        calls["n"] += 1
        # d1d4 is legal; a1a8 is illegal (no piece on a1) — must be rejected.
        return {"score_cp": 100, "mate_moves": None, "best_uci": "d1d4",
                "pv_ucis": ["d1d4", "a1a8", "e5e6"], "depth": depth}

    monkeypatch.setattr(endgame, "evaluate_position", poisoned)
    sol = endgame.build_solution(fen, drill, [])
    assert sol["moves"] == [], "no part of a poisoned PV may be displayed"
    assert sol["error"] is not None
    assert calls["n"] >= 2, "a fresh analysis must be requested after an illegal PV"


def test_engine_offline_falls_back_to_model_or_error(db_session, test_user, monkeypatch):
    monkeypatch.setattr(endgame, "evaluate_position", lambda f, depth=10: None)
    # On-path model continuation still works without an engine.
    drill = DRILL_BY_ID["rook-1"]
    sol = endgame.build_solution(drill["fen"], drill, [])
    assert sol["error"] is None and sol["source"] == "model"
    _assert_legal_line(drill["fen"], sol["moves"])
    # Off-path with no engine and no model: meaningful error, never moves.
    bare = {"objective": {"type": "checkmate"}, "player_color": "white",
            "max_moves": 20, "solution_sans": [], "hints": ["a", "b", "c"]}
    sol2 = endgame.build_solution(drill["fen"], bare, ["h2h4"])
    assert sol2["moves"] == [] and sol2["error"]


def test_consecutive_solutions_are_position_isolated(db_session, test_user):
    _unlock(db_session, test_user, DRILL_BY_ID["rook-4"])
    _unlock(db_session, test_user, DRILL_BY_ID["pawn-1"])
    a1 = routes.start_drill("rook-4", db_session, test_user)
    a2 = routes.start_drill("pawn-1", db_session, test_user)
    r1 = routes.reveal_solution(a1.id, db_session, test_user)
    r2 = routes.reveal_solution(a2.id, db_session, test_user)
    assert r1.start_fen == a1.fen and r2.start_fen == a2.fen
    assert r1.start_fen != r2.start_fen
    _assert_legal_line(a1.fen, r1.solution)
    _assert_legal_line(a2.fen, r2.solution)


@pytest.mark.parametrize("sub", ["cm-queen", "pw-winning-kp", "rk-philidor", "im-rook-vs-minor"])
def test_generated_drill_solution_legal(db_session, test_user, sub):
    d = endgame_gen.generate(db_session, test_user.id, "x", "Intermediate", subcategory=sub)
    routes._persist_generated(db_session, d)
    db_session.commit()
    att = routes.start_drill(d["id"], db_session, test_user)
    rev = routes.reveal_solution(att.id, db_session, test_user)
    assert rev.start_fen == att.fen
    if rev.error is None:
        assert len(rev.solution) > 0
        _assert_legal_line(att.fen, rev.solution)