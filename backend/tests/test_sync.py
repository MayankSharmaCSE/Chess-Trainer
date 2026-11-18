"""US-001/US-002 tests: connect (mocked platform API), sync dedupe, library isolation."""

from fastapi.testclient import TestClient

import app.api.routes_sync as routes_sync


def _signup(client: TestClient, username: str, email: str) -> str:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SAMPLE_GAMES = [
    {
        "external_id": "https://www.chess.com/game/live/111",
        "url": "https://www.chess.com/game/live/111",
        "pgn": '[White "FlowUser"]\n\n1. e4 e5 1-0',
        "white_username": "FlowUser",
        "black_username": "OpponentA",
        "white_rating": 1200,
        "black_rating": 1150,
        "white_result": "win",
        "black_result": "checkmated",
        "time_control": "600",
        "rated": True,
        "opening_eco": None,
        "opening_name": "King Pawn Opening",
        "played_at": None,
    },
    {
        "external_id": "abc123",
        "url": "https://lichess.org/abc123",
        "pgn": '[White "OpponentB"]\n\n1. d4 d5 1/2-1/2',
        "white_username": "OpponentB",
        "black_username": "FlowUser",
        "white_rating": 1300,
        "black_rating": 1250,
        "white_result": "draw",
        "black_result": "draw",
        "time_control": "180+0",
        "rated": True,
        "opening_eco": "D00",
        "opening_name": "Queen Pawn Game",
        "played_at": None,
        "_winner": None,
    },
]


def test_full_flow(client: TestClient, monkeypatch):
    token = _signup(client, "flow_user", "flow@example.com")
    monkeypatch.setattr(
        routes_sync.chesscom, "validate_chesscom_user", lambda username, c: "FlowUser"
    )
    monkeypatch.setattr(
        routes_sync.chesscom,
        "fetch_chesscom_games",
        lambda username, max_games, c: list(SAMPLE_GAMES),
    )

    r = client.post(
        "/api/accounts/connect",
        json={"platform": "chesscom", "username": "flowuser"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    account_id = r.json()["id"]
    assert r.json()["username"] == "FlowUser"

    # unknown platform username
    monkeypatch.setattr(routes_sync.chesscom, "validate_chesscom_user", lambda u, c: None)
    bad = client.post(
        "/api/accounts/connect",
        json={"platform": "chesscom", "username": "no_such_user"},
        headers=_auth(token),
    )
    assert bad.status_code == 404
    monkeypatch.setattr(
        routes_sync.chesscom, "validate_chesscom_user", lambda u, c: "FlowUser"
    )

    # invalid platform rejected by schema
    bad_plat = client.post(
        "/api/accounts/connect",
        json={"platform": "chesscube", "username": "x"},
        headers=_auth(token),
    )
    assert bad_plat.status_code == 422

    # sync twice: second run must import 0 (dedupe)
    s1 = client.post(f"/api/accounts/{account_id}/sync?max_games=50", headers=_auth(token))
    assert s1.status_code == 200, s1.text
    assert s1.json()["imported"] == 2
    assert s1.json()["total"] == 2

    s2 = client.post(f"/api/accounts/{account_id}/sync?max_games=50", headers=_auth(token))
    assert s2.json()["imported"] == 0
    assert s2.json()["skipped"] == 2

    # library
    lib = client.get("/api/games?limit=20", headers=_auth(token))
    assert lib.status_code == 200
    assert lib.json()["total"] == 2
    first = lib.json()["games"][0]
    assert first["user_result"] in ("win", "draw", "loss")
    assert first["opponent"] in ("OpponentA", "OpponentB")

    gid = lib.json()["games"][0]["id"]
    detail = client.get(f"/api/games/{gid}", headers=_auth(token))
    assert detail.status_code == 200
    assert "1." in detail.json()["pgn"]

    # isolation: another user sees nothing
    token2 = _signup(client, "other_user", "other@example.com")
    lib2 = client.get("/api/games", headers=_auth(token2))
    assert lib2.json()["total"] == 0
    denied = client.get(f"/api/games/{gid}", headers=_auth(token2))
    assert denied.status_code == 404

    # unauthenticated blocked
    assert client.get("/api/games").status_code == 401
    assert client.get("/api/accounts").status_code == 401
