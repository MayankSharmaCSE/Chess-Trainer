"""US-005 tests: classification math (no engine) + analyze endpoint flow (mocked)."""

import chess.engine
from fastapi.testclient import TestClient

from app.services import engine as engine_svc
from app.services.engine import classify_loss, mover_loss


def _signup(client: TestClient, username: str, email: str) -> str:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def test_classify_thresholds():
    assert classify_loss(0) is None
    assert classify_loss(49) is None
    assert classify_loss(50) == "INACCURACY"
    assert classify_loss(99) == "INACCURACY"
    assert classify_loss(100) == "MISTAKE"
    assert classify_loss(299) == "MISTAKE"
    assert classify_loss(300) == "BLUNDER"


def test_mover_loss_mates():
    mate_for_white = chess.engine.Mate(2)  # white POV
    mated_white = chess.engine.Mate(-1)
    level = chess.engine.Cp(30)
    # Missed mate (white to move): huge loss -> blunder.
    assert mover_loss(mate_for_white, level, True) > 300
    # Got mated: huge loss -> blunder.
    assert mover_loss(level, mated_white, True) > 300
    # Already lost stays lost: ~0.
    assert mover_loss(mated_white, mated_white, True) == 0
    # Normal exchange: symmetric.
    assert mover_loss(chess.engine.Cp(100), chess.engine.Cp(40), True) == 60
    assert mover_loss(chess.engine.Cp(100), chess.engine.Cp(40), False) == -60
    # Delaying forced mate counts as a mistake.
    assert mover_loss(chess.engine.Mate(2), chess.engine.Mate(4), True) == 120


FAKE_RESULT = {
    "moves": [
        {
            "ply": 1,
            "played_san": "e4",
            "played_uci": "e2e4",
            "best_san": "e4",
            "best_uci": "e2e4",
            "pv_sans": ["e4"],
            "eval_before_cp": 30,
            "mate_before": None,
            "eval_after_cp": 35,
            "mate_after": None,
            "cp_loss": -5,
            "classification": None,
            "is_user_move": True,
        },
        {
            "ply": 2,
            "played_san": "Nc6",
            "played_uci": "b8c6",
            "best_san": "e5",
            "best_uci": "e7e5",
            "pv_sans": ["e5"],
            "eval_before_cp": 35,
            "mate_before": None,
            "eval_after_cp": -320,
            "mate_after": None,
            "cp_loss": 355,
            "classification": "BLUNDER",
            "is_user_move": False,
        },
    ],
    "counts": {"BLUNDER": 1, "MISTAKE": 0, "INACCURACY": 0},
    "engine_version": "Stockfish 19 (mock)",
    "depth": 12,
}


def _seed_game(client: TestClient, token: str) -> int:
    # Seed via sync mock: reuse the sync test's approach with a tiny inline game.
    import app.api.routes_sync as routes_sync

    orig_validate = routes_sync.chesscom.validate_chesscom_user
    orig_fetch = routes_sync.chesscom.fetch_chesscom_games
    routes_sync.chesscom.validate_chesscom_user = lambda u, c: "EngineUser"
    routes_sync.chesscom.fetch_chesscom_games = lambda u, m, c: [
        {
            "external_id": "https://www.chess.com/game/live/engine1",
            "url": "https://www.chess.com/game/live/engine1",
            "pgn": '[White "EngineUser"]\n\n1. e4 e5 1-0',
            "white_username": "EngineUser",
            "black_username": "Opp",
            "white_rating": 1200,
            "black_rating": 1100,
            "white_result": "win",
            "black_result": "checkmated",
            "time_control": "600",
            "rated": True,
            "opening_eco": None,
            "opening_name": None,
            "played_at": None,
        }
    ]
    try:
        h = {"Authorization": f"Bearer {token}"}
        r = client.post(
            "/api/accounts/connect",
            json={"platform": "chesscom", "username": "engineuser"},
            headers=h,
        )
        assert r.status_code == 201, r.text
        s = client.post(f"/api/accounts/{r.json()['id']}/sync?max_games=5", headers=h)
        assert s.status_code == 200, s.text
    finally:
        routes_sync.chesscom.validate_chesscom_user = orig_validate
        routes_sync.chesscom.fetch_chesscom_games = orig_fetch
    lib = client.get(
        "/api/games", headers={"Authorization": f"Bearer {token}"}
    )
    return lib.json()["games"][0]["id"]


def test_delivering_checkmate_is_not_a_blunder():
    """Playing mate-in-1 (e.g. Qf7#) must cost 0, for either colour.

    After the mating move Stockfish scores the mated side as Mate(-0); seen
    from White that's MateGiven (White mated) or Mate(-0) (Black mated). Both
    have .mate() == 0, which used to be read as "mate against the mover".
    """
    white_mates_before = chess.engine.PovScore(chess.engine.Mate(1), chess.WHITE).white()
    white_mates_after = chess.engine.PovScore(chess.engine.Mate(-0), chess.BLACK).white()
    assert mover_loss(white_mates_before, white_mates_after, True) == 0
    assert classify_loss(mover_loss(white_mates_before, white_mates_after, True)) is None

    black_mates_before = chess.engine.PovScore(chess.engine.Mate(1), chess.BLACK).white()
    black_mates_after = chess.engine.PovScore(chess.engine.Mate(-0), chess.WHITE).white()
    assert mover_loss(black_mates_before, black_mates_after, False) == 0


def test_analyze_flow(client: TestClient, monkeypatch):
    token = _signup(client, "engine_user", "engine@example.com")
    h = {"Authorization": f"Bearer {token}"}
    game_id = _seed_game(client, token)

    assert client.get(f"/api/games/{game_id}/analysis", headers=h).status_code == 404

    monkeypatch.setattr(
        engine_svc, "analyze_game", lambda pgn, depth, user_color, path="x": FAKE_RESULT
    )
    r = client.post(f"/api/games/{game_id}/analyze?depth=12", headers=h)
    assert r.status_code == 202, r.text
    # Background analysis completes asynchronously: poll until done.
    import time

    body = None
    for _ in range(100):
        g = client.get(f"/api/games/{game_id}/analysis", headers=h)
        assert g.status_code == 200, g.text
        body = g.json()
        if body["status"] == "done":
            break
        time.sleep(0.1)
    assert body is not None and body["status"] == "done", body
    assert body["blunder_count"] == 1
    assert len(body["moves"]) == 2
    assert body["moves"][1]["classification"] == "BLUNDER"
    assert body["moves"][1]["best_san"] == "e5"

    # repeat same depth: no re-run, still done
    r2 = client.post(f"/api/games/{game_id}/analyze?depth=12", headers=h)
    assert r2.json()["status"] == "done"

    # bad depth rejected
    assert client.post(f"/api/games/{game_id}/analyze?depth=99", headers=h).status_code == 422
    # unknown game
    assert client.post("/api/games/999999/analyze", headers=h).status_code == 404
    # isolation
    token2 = _signup(client, "engine_other", "engine2@example.com")
    h2 = {"Authorization": f"Bearer {token2}"}
    assert client.get(f"/api/games/{game_id}/analysis", headers=h2).status_code == 404
    assert client.get(f"/api/games/{game_id}/analysis").status_code == 401
