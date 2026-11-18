"""US-010 tests: progress report (per-game trends, rating, training)."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.base import SessionLocal
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game
from app.models.training import TrainingAttempt, TrainingDrill


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


def _move(game_id, analysis_id, ply, cls, mine=True):
    return MoveAnalysis(
        game_id=game_id, analysis_id=analysis_id, ply=ply,
        played_san="e4", played_uci="e2e4", best_san="e4",
        best_uci="e2e4", pv_sans=["e4"], eval_before_cp=30,
        mate_before=None, eval_after_cp=20, mate_after=None,
        cp_loss=100 if cls else 0, classification=cls, is_user_move=mine,
    )


def _seed(user_id: int):
    db = SessionLocal()
    try:
        g1 = Game(user_id=user_id, platform="chesscom", external_id="p1",
                  pgn="1. e4 e5", user_color="white",
                  white_rating=1200, black_rating=1100,
                  user_result="win", opponent="A",
                  played_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        g2 = Game(user_id=user_id, platform="chesscom", external_id="p2",
                  pgn="1. d4 d5", user_color="black",
                  white_rating=1300, black_rating=1250,
                  user_result="loss", opponent="B",
                  played_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
        db.add_all([g1, g2])
        db.flush()
        a1 = GameAnalysis(game_id=g1.id, user_id=user_id, status="done", depth=12)
        a2 = GameAnalysis(game_id=g2.id, user_id=user_id, status="done", depth=12)
        db.add_all([a1, a2])
        db.flush()
        db.add_all([
            _move(g1.id, a1.id, 5, "BLUNDER"),
            _move(g1.id, a1.id, 6, None),
            _move(g1.id, a1.id, 30, "MISTAKE"),
            _move(g2.id, a2.id, 70, "INACCURACY"),
            _move(g2.id, a2.id, 71, None),
            _move(g2.id, a2.id, 72, "BLUNDER", mine=False),
        ])
        db.flush()
        m5 = db.query(MoveAnalysis).filter_by(game_id=g1.id, ply=5).one()
        m30 = db.query(MoveAnalysis).filter_by(game_id=g1.id, ply=30).one()
        d1 = TrainingDrill(user_id=user_id, game_id=g1.id, move_analysis_id=m5.id,
                           fen_before="start", classification="BLUNDER", phase="Opening",
                           played_san="e4", best_uci="e2e4")
        d2 = TrainingDrill(user_id=user_id, game_id=g1.id, move_analysis_id=m30.id,
                           fen_before="start", classification="MISTAKE", phase="Middlegame",
                           played_san="e4", best_uci="e2e4")
        db.add_all([d1, d2])
        db.flush()
        db.add_all([
            TrainingAttempt(drill_id=d1.id, user_id=user_id, played_uci="e2e4", correct=False),
            TrainingAttempt(drill_id=d1.id, user_id=user_id, played_uci="e2e4", correct=True),
            TrainingAttempt(drill_id=d2.id, user_id=user_id, played_uci="e2e4", correct=False),
        ])
        db.commit()
    finally:
        db.close()


def test_progress_empty(client: TestClient):
    _, token = _signup(client, "prog_empty", "prog_empty@example.com")
    body = client.get("/api/progress", headers=_auth(token)).json()
    assert body["games_analyzed"] == 0
    assert body["insufficient_data"] is True
    assert body["points"] == [] and body["training"] == []
    assert client.get("/api/progress").status_code == 401


def test_progress_report(client: TestClient):
    user_id, token = _signup(client, "prog_user", "prog@example.com")
    _seed(user_id)
    h = _auth(token)
    body = client.get("/api/progress", headers=h).json()

    assert body["games_analyzed"] == 2
    assert body["insufficient_data"] is True  # <3 games
    assert [p["game_id"] for p in body["points"]] == sorted(p["game_id"] for p in body["points"])
    g1p, g2p = body["points"]
    assert (g1p["blunders"], g1p["mistakes"], g1p["user_moves"]) == (1, 1, 3)
    assert abs(g1p["accuracy"] - (1 / 3)) < 1e-6
    assert (g2p["inaccuracies"], g2p["user_moves"]) == (1, 2)
    assert body["avg_blunders_per_game"] == 0.5
    assert abs(body["overall_accuracy"] - 0.4) < 1e-6

    # Rating uses your color: white->1200, black->1250.
    assert [r["rating"] for r in body["rating_trend"]] == [1200, 1250]

    phases = {p["phase"]: p for p in body["phases"]}
    assert phases["Opening"]["blunders"] == 1
    assert phases["Middlegame"]["mistakes"] == 1
    assert phases["Endgame"]["inaccuracies"] == 1

    assert len(body["training"]) == 1
    assert body["training"][0]["attempts"] == 3
    assert body["training"][0]["correct"] == 1
    assert abs(body["training_accuracy"] - (1 / 3)) < 1e-6
    assert body["training_completion_rate"] == 0.5

    _, token2 = _signup(client, "prog_other", "prog2@example.com")
    assert client.get("/api/progress", headers=_auth(token2)).json()["games_analyzed"] == 0
