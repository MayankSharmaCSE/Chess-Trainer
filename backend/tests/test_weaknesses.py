"""US-006/US-007 tests: weakness aggregation (phases, openings, evidence)."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.base import SessionLocal
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game


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


def _move(game_id: int, analysis_id: int, ply: int, cls: str | None, mine: bool = True):
    return MoveAnalysis(
        game_id=game_id, analysis_id=analysis_id, ply=ply,
        played_san="e4", played_uci="e2e4", best_san="e4",
        best_uci="e2e4", pv_sans=["e4"], eval_before_cp=30,
        mate_before=None, eval_after_cp=20, mate_after=None,
        cp_loss=10 if cls else 0, classification=cls, is_user_move=mine,
    )


def _seed_report(user_id: int) -> dict:
    db = SessionLocal()
    try:
        g1 = Game(user_id=user_id, platform="chesscom", external_id="w1",
                  pgn="1. e4 e5", opening_name="King Pawn Opening",
                  opponent="OppA", user_result="win")
        g2 = Game(user_id=user_id, platform="chesscom", external_id="w2",
                  pgn="1. d4 d5", opening_name="Queen Pawn Game",
                  opponent="OppB", user_result="loss")
        g3 = Game(user_id=user_id, platform="lichess", external_id="w3",
                  pgn="1. e4 e5", opening_name="King Pawn Opening",
                  opponent="OppC", user_result="draw")
        db.add_all([g1, g2, g3])
        db.flush()
        a1 = GameAnalysis(game_id=g1.id, user_id=user_id, status="done", depth=12)
        a2 = GameAnalysis(game_id=g2.id, user_id=user_id, status="done", depth=12)
        a3 = GameAnalysis(game_id=g3.id, user_id=user_id, status="done", depth=12)
        db.add_all([a1, a2, a3])
        db.flush()
        db.add_all([
            _move(g1.id, a1.id, 5, "BLUNDER"),
            _move(g1.id, a1.id, 30, "MISTAKE"),
            _move(g1.id, a1.id, 31, None),
            _move(g1.id, a1.id, 32, "BLUNDER", mine=False),
            _move(g2.id, a2.id, 70, "INACCURACY"),
            _move(g2.id, a2.id, 71, "BLUNDER"),
            _move(g3.id, a3.id, 10, None),
        ])
        db.commit()
        return {"g1": g1.id, "g2": g2.id, "g3": g3.id}
    finally:
        db.close()


def test_weaknesses_empty(client: TestClient):
    _, token = _signup(client, "weak_empty", "weak_empty@example.com")
    r = client.get("/api/weaknesses", headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["games_analyzed"] == 0
    assert body["user_moves_analyzed"] == 0
    assert body["insufficient_data"] is True
    assert len(body["phases"]) == 3
    assert body["top_openings"] == []
    assert body["sample_games"] == []


def test_weaknesses_aggregation(client: TestClient):
    user_id, token = _signup(client, "weak_user", "weak@example.com")
    ids = _seed_report(user_id)
    body = client.get("/api/weaknesses", headers=_auth(token)).json()
    assert body["games_analyzed"] == 3
    assert body["insufficient_data"] is False
    assert body["user_moves_analyzed"] == 6
    assert body["blunders"] == 2
    assert body["mistakes"] == 1
    assert body["inaccuracies"] == 1
    by_phase = {p["phase"]: p for p in body["phases"]}
    assert by_phase["Opening"]["blunder"] == 1
    assert by_phase["Opening"]["total"] == 1
    assert by_phase["Middlegame"]["mistake"] == 1
    assert by_phase["Endgame"]["blunder"] == 1
    assert by_phase["Endgame"]["inaccuracy"] == 1
    openings = {o["opening"]: o for o in body["top_openings"]}
    assert openings["King Pawn Opening"]["games"] == 2
    assert openings["King Pawn Opening"]["flags"] == 2
    assert openings["Queen Pawn Game"]["games"] == 1
    assert openings["Queen Pawn Game"]["flags"] == 2
    assert len(body["sample_games"]) == 2
    by_id = {s["id"]: s for s in body["sample_games"]}
    assert by_id[ids["g1"]]["flags"] == 2
    assert by_id[ids["g1"]]["opponent"] == "OppA"
    assert by_id[ids["g2"]]["flags"] == 2
    assert by_id[ids["g2"]]["opponent"] == "OppB"


def test_weaknesses_insufficient_and_isolation(client: TestClient):
    user_id, token = _signup(client, "weak_small", "weak_small@example.com")
    db = SessionLocal()
    try:
        g = Game(user_id=user_id, platform="chesscom", external_id="wsmall",
                 pgn="1. e4 e5", opening_name="King Pawn Opening")
        db.add(g)
        db.flush()
        a = GameAnalysis(game_id=g.id, user_id=user_id, status="done", depth=12)
        db.add(a)
        db.flush()
        db.add(_move(g.id, a.id, 8, "BLUNDER"))
        g2 = Game(user_id=user_id, platform="chesscom", external_id="wpending",
                  pgn="1. e4 e5")
        db.add(g2)
        db.flush()
        db.add(GameAnalysis(game_id=g2.id, user_id=user_id, status="pending", depth=12))
        db.commit()
    finally:
        db.close()
    body = client.get("/api/weaknesses", headers=_auth(token)).json()
    assert body["games_analyzed"] == 1
    assert body["insufficient_data"] is True
    _, token2 = _signup(client, "weak_other", "weak_other@example.com")
    assert client.get("/api/weaknesses", headers=_auth(token2)).json()["games_analyzed"] == 0
    assert client.get("/api/weaknesses").status_code == 401


def test_phase_for_ply_boundaries():
    from app.services.weaknesses import phase_for_ply
    assert phase_for_ply(1) == "Opening"
    assert phase_for_ply(20) == "Opening"
    assert phase_for_ply(21) == "Middlegame"
    assert phase_for_ply(60) == "Middlegame"
    assert phase_for_ply(61) == "Endgame"


def _seed_dated(user_id: int, prefix: str) -> dict:
    """Three analyzed games, one flag each, ordered by play date.

    ``prefix`` namespaces external_id, which is globally unique across the
    shared test DB.
    """
    db = SessionLocal()
    try:
        specs = [
            (f"{prefix}-old", datetime(2024, 1, 1, tzinfo=timezone.utc), 5, "BLUNDER"),
            (f"{prefix}-mid", datetime(2024, 2, 1, tzinfo=timezone.utc), 30, "MISTAKE"),
            (f"{prefix}-new", datetime(2024, 3, 1, tzinfo=timezone.utc), 70, "INACCURACY"),
        ]
        ids: dict[str, int] = {}
        for ext, played_at, ply, cls in specs:
            g = Game(user_id=user_id, platform="chesscom", external_id=ext,
                     pgn="1. e4 e5", opening_name="King Pawn Opening",
                     opponent=ext, user_result="win", played_at=played_at)
            db.add(g)
            db.flush()
            a = GameAnalysis(game_id=g.id, user_id=user_id, status="done", depth=12)
            db.add(a)
            db.flush()
            db.add(_move(g.id, a.id, ply, cls))
            ids[ext.split("-")[-1]] = g.id
        db.commit()
        return ids
    finally:
        db.close()


def test_weaknesses_last_n_orders_by_played_date(client: TestClient):
    user_id, token = _signup(client, "weak_lastn", "weak_lastn@example.com")
    ids = _seed_dated(user_id, "lastn")

    # last=1 -> newest game only (the inaccuracy).
    body = client.get("/api/weaknesses?last=1", headers=_auth(token)).json()
    assert body["games_analyzed"] == 1
    assert body["inaccuracies"] == 1
    assert body["blunders"] == 0 and body["mistakes"] == 0
    assert [g["id"] for g in body["sample_games"]] == [ids["new"]]

    # last=2 -> two newest (inaccuracy + mistake), oldest excluded.
    body = client.get("/api/weaknesses?last=2", headers=_auth(token)).json()
    assert body["games_analyzed"] == 2
    assert body["inaccuracies"] == 1 and body["mistakes"] == 1
    assert body["blunders"] == 0


def test_weaknesses_explicit_game_ids_and_precedence(client: TestClient):
    user_id, token = _signup(client, "weak_ids", "weak_ids@example.com")
    ids = _seed_dated(user_id, "ids")

    # Explicit selection of the oldest game only.
    body = client.get(f"/api/weaknesses?game_ids={ids['old']}", headers=_auth(token)).json()
    assert body["games_analyzed"] == 1
    assert body["blunders"] == 1

    # game_ids takes precedence over last.
    body = client.get(
        f"/api/weaknesses?last=1&game_ids={ids['old']},{ids['mid']}",
        headers=_auth(token),
    ).json()
    assert body["games_analyzed"] == 2
    assert body["blunders"] == 1 and body["mistakes"] == 1

    # Malformed game_ids -> 400.
    assert client.get("/api/weaknesses?game_ids=1,abc", headers=_auth(token)).status_code == 400


def test_weakness_games_lists_analyzed_newest_first(client: TestClient):
    user_id, token = _signup(client, "weak_games", "weak_games@example.com")
    ids = _seed_dated(user_id, "games")
    # An extra synced-but-unanalyzed game must not appear in the picker.
    db = SessionLocal()
    try:
        db.add(Game(user_id=user_id, platform="chesscom", external_id="games-unanalyzed",
                    pgn="1. e4 e5", played_at=datetime(2024, 4, 1, tzinfo=timezone.utc)))
        db.commit()
    finally:
        db.close()

    r = client.get("/api/weaknesses/games", headers=_auth(token))
    assert r.status_code == 200, r.text
    listed = r.json()
    assert [g["id"] for g in listed] == [ids["new"], ids["mid"], ids["old"]]
    assert listed[0]["opening_name"] == "King Pawn Opening"
    assert "flags" not in listed[0]
