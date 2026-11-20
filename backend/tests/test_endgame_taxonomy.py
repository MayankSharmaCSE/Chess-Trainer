"""Tests for the Chess.com-style Endgames taxonomy: generation across all
34 subcategories, defend-objective flows, anti-repetition and progress."""

import chess
import pytest

from app.api import routes_endgame as routes
from app.db.base import SessionLocal, init_db
from app.models.endgame import EndgameGenerated, EndgameProgress
from app.models.user import User
from app.schemas.endgame import GenerateIn, MoveIn
from app.services import endgame_gen
from app.services.endgame_gen import validator
from app.services.endgame_gen.endgames import SUBGENERATORS
from app.services.endgame_gen.taxonomy import (
    ALL_SUBCATEGORY_IDS,
    ENDGAME_CATEGORIES,
    SUBCATEGORY_BY_ID,
)


@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_user(db_session):
    u = db_session.query(User).filter(User.username == "endgame_tax_tester").first()
    if not u:
        u = User(username="endgame_tax_tester", email="egtax@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return u


def test_taxonomy_shape():
    assert len(ENDGAME_CATEGORIES) == 6
    assert len(ALL_SUBCATEGORY_IDS) == 34
    assert len(set(ALL_SUBCATEGORY_IDS)) == 34
    assert set(SUBGENERATORS) == set(ALL_SUBCATEGORY_IDS)
    for cat in ENDGAME_CATEGORIES:
        assert cat["theory"] and cat["glyph"]
        for s in cat["subcategories"]:
            assert s["kind"] in ("mate", "win", "defend", "technique")
            assert SUBCATEGORY_BY_ID[s["id"]]["category"] == cat["id"]


@pytest.mark.parametrize("sub", ALL_SUBCATEGORY_IDS)
def test_every_subcategory_generates_valid_verified(db_session, test_user, sub):
    cat = SUBCATEGORY_BY_ID[sub]["category"]
    d = endgame_gen.generate(db_session, test_user.id, cat, "Intermediate", subcategory=sub)
    db_session.commit()
    assert d["subcategory"] == sub and d["category"] == cat
    assert d["generated"] and d["id"].startswith("gen-")
    board = chess.Board(d["fen"])
    assert board.is_valid() and not board.is_game_over()
    ok, reason = validator.structural_ok(board, cat, d["objective"], d.get("_material"))
    assert ok, reason
    assert len(d["hints"]) == 3
    if d["objective"]["type"] == "checkmate" and d["solution_sans"]:
        b = chess.Board(d["fen"])
        for san in d["solution_sans"]:
            b.push(b.parse_san(san))
        assert b.is_checkmate(), "mate solution must replay to checkmate"
    if d["objective"]["type"] == "defend":
        assert d["star_moves"][0] == d["max_moves"]


def test_subcategory_no_immediate_repeat(db_session, test_user):
    ids = []
    for _ in range(3):
        d = endgame_gen.generate(db_session, test_user.id, "checkmates", "Intermediate", subcategory="cm-queen")
        db_session.commit()
        ids.append(d["id"])
    assert len(set(ids)) == 3
    assert ids[-1] != ids[-2]


def _custom_defend_drill(db, user, fen: str, max_moves: int, script: dict | None = None) -> dict:
    cfg = {
        "id": "", "category": "pawn", "subcategory": "pw-drawn-kp", "level": 0,
        "title": "Test Defence", "tagline": "test", "difficulty": "Intermediate",
        "fen": fen, "player_color": "white",
        "objective": {"type": "defend"}, "objective_label": "Defend: hold the draw.",
        "max_moves": max_moves, "star_moves": [max_moves, max_moves], "est_minutes": 2,
        "instructions": ["Defend."], "tips": ["Stay calm."],
        "hints": ["Hint one.", "Hint two.", "Hint three."],
        "solution_sans": [], "model_complete": False, "strict": False,
        "generated": True, "hint_max": 3,
        "opponent": {"mode": "script" if script else "engine", "depth": 8, "skill": 10,
                     "movetime_ms": 200, "script": script or {}},
    }
    cid = endgame_gen.challenge_id(fen + str(max_moves) + str(script), cfg["objective"], "Intermediate") + "t"
    cfg["id"] = cid
    cfg["challenge_id"] = cid
    if db.get(EndgameGenerated, cid) is None:
        db.add(EndgameGenerated(challenge_id=cid, category="pawn", difficulty="Intermediate", config=cfg))
    db.commit()
    return cfg


def test_defend_stalemate_is_success(db_session, test_user):
    # White Kf7 + Qg6 vs Kh8: Kf6 stalemates the black king — a draw, hence success.
    fen = "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1"
    cfg = _custom_defend_drill(db_session, test_user, fen, 12)
    attempt = routes.start_drill(cfg["id"], db_session, test_user)
    out = routes.make_move(attempt.id, MoveIn(move="f7f6"), db_session, test_user)
    assert out.status == "completed" and out.objective_met
    assert out.is_stalemate


def test_defend_budget_survival_is_success(db_session, test_user):
    fen = "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1"
    cfg = _custom_defend_drill(db_session, test_user, fen, 1)
    attempt = routes.start_drill(cfg["id"], db_session, test_user)
    # Qg5 does not stalemate; with max_moves=1 the budget branch completes the drill.
    out = routes.make_move(attempt.id, MoveIn(move="g6g5"), db_session, test_user)
    assert out.status == "completed" and out.objective_met


def test_defend_enemy_promotion_fails(db_session, test_user):
    # Black pawn a2 promotes after a quiet white move — defence collapsed.
    fen = "8/8/8/7Q/8/1k6/p7/2K5 w - - 0 1"
    script = {"8/8/8/4Q3/8/1k6/p7/2K5 b": "a2a1q"}
    cfg = _custom_defend_drill(db_session, test_user, fen, 12, script=script)
    attempt = routes.start_drill(cfg["id"], db_session, test_user)
    out = routes.make_move(attempt.id, MoveIn(move="h5e5"), db_session, test_user)
    assert out.status == "failed" and out.fail_reason == "promotion"


def test_generate_route_with_subcategory_and_taxonomy_progress(db_session, test_user):
    detail = routes.generate_challenge(
        GenerateIn(category="checkmates", subcategory="cm-queen", difficulty="Beginner"),
        db_session, test_user,
    )
    assert detail.generated and detail.subcategory == "cm-queen"
    assert detail.subcategory_title == "Queen Mate"
    assert detail.category_title == "Checkmates"
    # Resolves + starts through the standard attempt routes.
    attempt = routes.start_drill(detail.id, db_session, test_user)
    assert attempt.fen == detail.fen
    # Mark progress and verify taxonomy aggregation.
    row = db_session.query(EndgameProgress).filter(
        EndgameProgress.user_id == test_user.id, EndgameProgress.drill_id == detail.id
    ).first()
    row.completed = True
    row.stars = 3
    db_session.commit()
    tax = routes.get_taxonomy(db_session, test_user)
    assert len(tax.categories) == 6
    cm = next(c for c in tax.categories if c.id == "checkmates")
    qm = next(s for s in cm.subcategories if s.id == "cm-queen")
    assert qm.progress.completed >= 1 and qm.progress.stars >= 3
    assert cm.completed >= 1


def test_unknown_subcategory_rejected(db_session, test_user):
    with pytest.raises(Exception):
        routes.generate_challenge(
            GenerateIn(category="checkmates", subcategory="nope"), db_session, test_user
        )