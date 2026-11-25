"""Stockfish concurrency cap: one ~250 MB engine at a time (OOM fix), fair
hand-off from a long analysis to an interactive caller, and recovery of
analyses interrupted by a restart."""

import threading
import time

import pytest

from app.api import routes_analysis
from app.db.base import SessionLocal
from app.models.analysis import GameAnalysis
from app.services.engine_slots import EngineBusyError, EngineSlots


def test_slot_caps_concurrency():
    slots = EngineSlots(1)
    running = 0
    peak = 0
    lock = threading.Lock()

    def worker():
        nonlocal running, peak
        with slots.slot(timeout=5):
            with lock:
                running += 1
                peak = max(peak, running)
            time.sleep(0.05)
            with lock:
                running -= 1

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert peak == 1


def test_busy_slot_times_out_with_runtime_error():
    slots = EngineSlots(1)
    slots.acquire()
    with pytest.raises(EngineBusyError) as exc:
        slots.acquire(timeout=0.05)
    assert isinstance(exc.value, RuntimeError)  # existing engine fallbacks catch it
    slots.release()


def test_long_holder_yields_to_waiter():
    """An analysis holding the slot hands it to a waiting bot move between
    positions, instead of making it wait for the whole game."""
    slots = EngineSlots(1)
    order: list[str] = []
    slots.acquire()  # the "analysis"

    def interactive():
        with slots.slot(timeout=5):
            order.append("interactive")

    t = threading.Thread(target=interactive)
    t.start()
    deadline = time.monotonic() + 2
    while not slots.contended() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert slots.contended()
    slots.yield_to_waiters()  # analysis steps aside, then re-queues
    order.append("analysis-resumed")
    slots.release()
    t.join()
    assert order == ["interactive", "analysis-resumed"]


def _seed_pending(client) -> tuple[int, dict]:
    r = client.post(
        "/api/auth/signup",
        json={"username": "slotuser", "email": "slot@example.com", "password": "password123"},
    )
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    from app.models.game import Game

    with SessionLocal() as db:
        user_id = client.get("/api/auth/me", headers=h).json()["id"]
        g = Game(
            user_id=user_id, platform="lichess", external_id="slot-1",
            pgn="1. e4 e5 *", user_color="white",
        )
        db.add(g)
        db.flush()
        db.add(GameAnalysis(game_id=g.id, user_id=user_id, depth=15, status="pending"))
        db.commit()
        return g.id, h


def test_restart_marks_pending_failed_and_retry_requeues(client, monkeypatch):
    game_id, h = _seed_pending(client)

    # A second click while pending must not queue the game again.
    calls = []
    monkeypatch.setattr(
        routes_analysis.engine, "analyze_game",
        lambda *a, **k: calls.append(1) or {"moves": [], "counts": {}, "engine_version": "x", "depth": 15},
    )
    r = client.post(f"/api/games/{game_id}/analyze?depth=15", headers=h)
    assert r.json()["status"] == "pending"
    assert calls == []

    # Server restart: the stale pending row becomes a retryable failure.
    assert routes_analysis.reset_interrupted_analyses() >= 1
    a = client.get(f"/api/games/{game_id}/analysis", headers=h).json()
    assert a["status"] == "failed"
    assert "restarted" in a["error"]

    # Retry runs it.
    client.post(f"/api/games/{game_id}/analyze?depth=15", headers=h)
    for _ in range(50):
        if client.get(f"/api/games/{game_id}/analysis", headers=h).json()["status"] == "done":
            break
        time.sleep(0.1)
    assert calls == [1]


def test_queueing_more_games_than_db_pool_keeps_site_responsive(client, monkeypatch):
    """Regression: 'analyze all' with 15+ games used to hold one DB connection
    per queued game (pool = 5 + 10 overflow), so later clicks and every other
    page failed with QueuePool timeouts."""
    r = client.post(
        "/api/auth/signup",
        json={"username": "bulkuser", "email": "bulk@example.com", "password": "password123"},
    )
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    user_id = client.get("/api/auth/me", headers=h).json()["id"]
    from app.models.game import Game

    with SessionLocal() as db:
        games = [
            Game(user_id=user_id, platform="lichess", external_id=f"bulk-{i}", pgn="1. e4 e5 *", user_color="white")
            for i in range(25)
        ]
        db.add_all(games)
        db.commit()
        ids = [g.id for g in games]

    gate = threading.Event()
    done_result = {"moves": [], "counts": {}, "engine_version": "x", "depth": 15}
    monkeypatch.setattr(routes_analysis.engine, "analyze_game", lambda *a, **k: gate.wait(30) and done_result)

    t0 = time.monotonic()
    for gid in ids:
        assert client.post(f"/api/games/{gid}/analyze?depth=15", headers=h).status_code == 202
    # Engine is blocked on the first game; everything else is queued.
    assert client.get("/api/games?limit=100", headers=h).status_code == 200
    assert time.monotonic() - t0 < 10  # no 30 s pool timeouts

    gate.set()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        statuses = {client.get(f"/api/games/{gid}/analysis", headers=h).json()["status"] for gid in ids}
        if statuses == {"done"}:
            break
        time.sleep(0.1)
    assert statuses == {"done"}
