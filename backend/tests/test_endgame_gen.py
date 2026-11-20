"""Tests for the dynamic Endgame generation system, history and sessions."""

import random

import chess
import pytest

from app.api import routes_endgame as routes
from app.db.base import SessionLocal, init_db
from app.models.endgame import EndgameSession
from app.models.user import User
from app.schemas.endgame import GenerateIn, SessionStartIn
from app.services import endgame_gen
from app.services.endgame_gen import validator
from app.services.endgame_gen.generators import GENERATORS, corner_zone


@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_user(db_session):
    u = db_session.query(User).filter(User.username == "endgame_gen_tester").first()
    if not u:
        u = User(username="endgame_gen_tester", email="eggen@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return u


@pytest.mark.parametrize("category", ["rook", "knights", "bishop-knight", "pawn"])
def test_generate_valid_and_verified(db_session, test_user, category):
    d = endgame_gen.generate(db_session, test_user.id, category, "Intermediate")
    db_session.commit()
    board = chess.Board(d["fen"])
    assert board.is_valid() and not board.is_game_over()
    ok, reason = validator.structural_ok(board, category, d["objective"])
    assert ok, reason
    assert d["generated"] and d["id"].startswith("gen-")
    if d["objective"]["type"] == "checkmate" and d["solution_sans"]:
        b = chess.Board(d["fen"])
        for san in d["solution_sans"]:
            b.push(b.parse_san(san))
        assert b.is_checkmate()


def test_generate_distinct_and_no_immediate_repeat(db_session, test_user):
    ids = []
    for _ in range(4):
        d = endgame_gen.generate(db_session, test_user.id, "rook", "Intermediate")
        db_session.commit()
        ids.append(d["id"])
    assert len(set(ids)) == len(ids), "generated challenges must differ"
    assert ids[-1] != ids[-2], "never repeat consecutively"


def test_difficulty_changes_position_and_limits(db_session, test_user):
    beg = endgame_gen.generate(db_session, test_user.id, "rook", "Beginner")
    adv = endgame_gen.generate(db_session, test_user.id, "rook", "Advanced")
    db_session.commit()
    assert beg["hint_max"] == 3 and adv["hint_max"] == 2
    assert beg["opponent"]["depth"] < adv["opponent"]["depth"]


def test_generate_route_persists_and_resolves(db_session, test_user):
    detail = routes.generate_challenge(GenerateIn(category="pawn", difficulty="Beginner"), db_session, test_user)
    assert detail.generated and detail.challenge_id
    # Resolves from DB (not catalog).
    fetched = routes.get_drill(detail.id, db_session, test_user)
    assert fetched.id == detail.id
    attempt = routes.start_drill(detail.id, db_session, test_user)
    assert attempt.status == "in_progress"
    assert attempt.fen == detail.fen
    reset = routes.reset_attempt(attempt.id, db_session, test_user)
    assert reset.player_moves == 0


def test_session_lifecycle_and_counters(db_session, test_user):
    bundle = routes.start_session(SessionStartIn(category="knights", difficulty="Beginner", count=5), db_session, test_user)
    s = bundle.session
    assert s.status == "active" and s.target_count == 5
    first_drill = bundle.drill.id
    assert bundle.attempt.session_id == s.id

    nxt = routes.session_next(s.id, db_session, test_user)
    assert nxt.drill.id != first_drill, "next challenge must differ"
    assert nxt.session.id == s.id

    # Counters via the session-update helper (deterministic, no engine play).
    row = db_session.get(EndgameSession, s.id)
    attempt = routes._new_attempt(db_session, test_user, _drill_cfg(db_session, nxt.drill.id), session_id=s.id)
    attempt.status = "completed"
    attempt.completed_at = attempt.started_at
    routes._update_session(db_session, attempt, True, 3)
    db_session.commit()
    db_session.refresh(row)
    assert row.completed == 1 and row.correct == 1 and row.streak == 1 and row.score > 0
    routes._update_session(db_session, attempt, False, 0)
    db_session.commit()
    db_session.refresh(row)
    assert row.incorrect == 1 and row.streak == 0

    ended = routes.end_session(s.id, db_session, test_user)
    assert ended.status == "ended"


def _drill_cfg(db, drill_id):
    from app.models.endgame import EndgameGenerated
    return db.get(EndgameGenerated, drill_id).config


def test_session_target_completion(db_session, test_user):
    bundle = routes.start_session(SessionStartIn(category="rook", difficulty="Beginner", count=5), db_session, test_user)
    s = db_session.get(EndgameSession, bundle.session.id)
    s.target_count = 1
    attempt = routes._new_attempt(db_session, test_user, _drill_cfg(db_session, bundle.drill.id), session_id=s.id)
    attempt.status = "completed"
    attempt.completed_at = attempt.started_at
    routes._update_session(db_session, attempt, True, 2)
    db_session.commit()
    db_session.refresh(s)
    assert s.status == "completed"
    with pytest.raises(Exception):
        routes.session_next(s.id, db_session, test_user)


def test_endless_session(db_session, test_user):
    bundle = routes.start_session(SessionStartIn(category="pawn", difficulty="Intermediate", count=0), db_session, test_user)
    assert bundle.session.target_count == 0
    assert bundle.session.status == "active"
    routes.end_session(bundle.session.id, db_session, test_user)


# ---------------------------------------------------------------------------
# Regression: candidate construction bugs (bishop ownership, argument order)
# ---------------------------------------------------------------------------


def test_bishop_knight_candidates_bishop_is_white_and_corner_matches():
    rng = random.Random(7)
    gen = GENERATORS["bishop-knight"]
    square_colors = set()
    seen = 0
    for _ in range(40):
        for cand in gen.candidates(rng, "Intermediate"):
            if cand is None:
                continue
            seen += 1
            b = chess.Board(cand["fen"])
            bishops = [(s, p) for s, p in b.piece_map().items() if p.piece_type == chess.BISHOP]
            assert len(bishops) == 1
            sq, piece = bishops[0]
            assert piece.color == chess.WHITE, "bishop must belong to the player"
            is_light = (chess.square_file(sq) + chess.square_rank(sq)) % 2 == 1
            square_colors.add(is_light)
            if cand["objective"]["type"] == "king_zone":
                expected = corner_zone(chess.WHITE if is_light else chess.BLACK)
                assert cand["objective"]["squares"] == expected, "mating zone must match bishop square colour"
    assert seen > 0
    assert square_colors == {True, False}, "both bishop square colours must be generated"


def test_wrong_corner_scenario_is_structurally_valid():
    rng = random.Random(11)
    gen = GENERATORS["bishop-knight"]
    checked = 0
    for _ in range(60):
        cand = gen._wrong_corner(rng, "Intermediate")
        if cand is None:
            continue
        b = chess.Board(cand["fen"])
        ok, reason = validator.structural_ok(b, "bishop-knight", cand["objective"])
        assert ok, reason
        # Black king starts in a corner OUTSIDE the target (bishop-colour) zone.
        bk = chess.square_name(b.king(chess.BLACK))
        assert bk not in cand["objective"]["squares"]
        checked += 1
        if checked >= 10:
            break
    assert checked >= 10


def test_knight_coordination_candidates_build_and_validate():
    rng = random.Random(3)
    gen = GENERATORS["knights"]
    kinds = set()
    for _ in range(60):
        cand = gen._coordination(rng, "Advanced")
        assert cand is not None
        assert isinstance(cand["max_moves"], int) and cand["max_moves"] >= 2
        assert len(cand["hints"]) == 3
        b = chess.Board(cand["fen"])
        ok, reason = validator.structural_ok(b, "knights", cand["objective"])
        assert ok, reason
        kinds.add(cand["objective"]["type"])
        if kinds == {"approach", "checks"}:
            break
    assert kinds == {"approach", "checks"}


def test_beginner_positions_keep_kings_close():
    rng = random.Random(5)
    for gen in (GENERATORS["rook"], GENERATORS["knights"], GENERATORS["bishop-knight"]):
        for _ in range(20):
            for cand in gen.candidates(rng, "Beginner"):
                if cand is None or cand["_verify"][0] == "seed":
                    continue
                if cand["objective"]["type"] not in ("king_zone", "mobility", "approach", "checks"):
                    continue
                b = chess.Board(cand["fen"])
                dist = chess.square_distance(b.king(chess.WHITE), b.king(chess.BLACK))
                assert dist <= 3, "Beginner random scenarios must keep the attacking king close"


def test_knight_generation_survives_seed_exhaustion(db_session):
    u = db_session.query(User).filter(User.username == "eg_gen_repeat").first()
    if not u:
        u = User(username="eg_gen_repeat", email="eggenrepeat@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    ids = []
    for _ in range(12):
        d = endgame_gen.generate(db_session, u.id, "knights", "Intermediate")
        db_session.commit()
        ids.append(d["id"])
    assert len(set(ids)) == len(ids), "12 consecutive knight challenges must all differ"
    assert all(a != b for a, b in zip(ids, ids[1:])), "never repeat consecutively"