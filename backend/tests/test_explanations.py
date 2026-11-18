"""US-008 tests: grounded rule-based explanations (no LLM, fully deterministic)."""

from fastapi.testclient import TestClient

from app.db.base import SessionLocal
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.services.explanations import explain_move, ground_position


def _signup(client: TestClient, username: str, email: str) -> tuple:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["user"]["id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1/2-1/2'


def _seed(user_id: int, ext: str = "expl1"):
    from app.models.game import Game
    db = SessionLocal()
    try:
        g = Game(user_id=user_id, platform="chesscom", external_id=ext,
                 pgn=PGN, user_color="white", opening_name="Ruy Lopez")
        db.add(g)
        db.flush()
        a = GameAnalysis(game_id=g.id, user_id=user_id, status="done",
                         depth=12, blunder_count=1)
        db.add(a)
        db.flush()
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=3, played_san="Nf3",
            played_uci="g1f3", best_san="d4", best_uci="d2d4",
            pv_sans=["d4", "exd4", "Nxd4"], eval_before_cp=25,
            mate_before=None, eval_after_cp=-310, mate_after=None,
            cp_loss=335, classification="BLUNDER", is_user_move=True))
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=4, played_san="Nc6",
            played_uci="b8c6", best_san="Nc6", best_uci="b8c6",
            pv_sans=["Nc6"], eval_before_cp=-310, mate_before=None,
            eval_after_cp=-305, mate_after=None, cp_loss=-5,
            classification=None, is_user_move=False))
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=5, played_san="Bb5",
            played_uci="f1b5", best_san="Bb5", best_uci="f1b5",
            pv_sans=["Bb5"], eval_before_cp=-305, mate_before=None,
            eval_after_cp=-300, mate_after=None, cp_loss=-5,
            classification=None, is_user_move=True))
        db.commit()
        return g.id
    finally:
        db.close()


def test_ground_position():
    before, after = ground_position(PGN, 3)
    assert "w KQkq" in before  # white to move before ply 3
    assert "b KQkq" in after
    assert ground_position(PGN, 99) is None
    assert ground_position("not a game", 1) is None


def test_explain_blunder_cites_evidence(client: TestClient):
    from app.db.base import init_db
    from app.models.game import Game
    init_db()
    db = SessionLocal()
    try:
        g = db.query(Game).filter_by(external_id="cite").first()
        if g is None:
            user_id, _ = _signup(client, "expl_cite", "cite@example.com")
            g = Game(user_id=user_id, platform="x",
                     external_id="cite", pgn=PGN)
            db.add(g)
            db.commit()
            db.refresh(g)
        m = MoveAnalysis(game_id=g.id, analysis_id=1, ply=3,
                         played_san="Nf3", played_uci="g1f3",
                         best_san="d4", best_uci="d2d4",
                         pv_sans=["d4", "exd4"], eval_before_cp=25,
                         mate_before=None, eval_after_cp=-310,
                         mate_after=None, cp_loss=335,
                         classification="BLUNDER", is_user_move=True)
        text = explain_move(g, m)
        assert "Nf3" in text and "d4" in text and "blunder" in text
        assert "+0.2" in text and "-3.1" in text
    finally:
        db.close()


def test_explanation_endpoint(client: TestClient):
    user_id, token = _signup(client, "expl_user", "expl@example.com")
    gid = _seed(user_id)

    r = client.get(f"/api/games/{gid}/moves/3/explanation", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ply"] == 3
    assert body["classification"] == "BLUNDER"
    assert body["source"] == "rules-v1"
    assert "Nf3" in body["explanation"]
    assert "d4" in body["explanation"]

    # Cached: second call identical, one row stored.
    r2 = client.get(f"/api/games/{gid}/moves/3/explanation", headers=_auth(token))
    assert r2.json()["explanation"] == body["explanation"]

    # Clean user move: no flag language.
    ok = client.get(f"/api/games/{gid}/moves/5/explanation", headers=_auth(token))
    assert ok.status_code == 200
    assert "no blunder" in ok.json()["explanation"].lower()

    # Opponent move: 404. Unknown ply: 404. No-auth: 401.
    assert client.get(f"/api/games/{gid}/moves/4/explanation", headers=_auth(token)).status_code == 404
    assert client.get(f"/api/games/{gid}/moves/99/explanation", headers=_auth(token)).status_code == 404
    assert client.get(f"/api/games/{gid}/moves/3/explanation").status_code == 401

    # Isolation: another user cannot read it.
    _, token2 = _signup(client, "expl_other", "expl2@example.com")
    assert client.get(f"/api/games/{gid}/moves/3/explanation", headers=_auth(token2)).status_code == 404