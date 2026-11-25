"""Health checks: public dependency report + logged-in live AI ping, and the
OpenRouter `models` fallback list in the coaching payload."""

import httpx
from fastapi.testclient import TestClient

import app.api.routes_health as routes_health
from app.services import coaching


def _token(client: TestClient, username: str) -> str:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": f"{username}@example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def test_liveness_unchanged(client: TestClient):
    assert client.get("/healthz").json() == {"ok": True}


def test_health_reports_dependencies(client: TestClient, monkeypatch):
    monkeypatch.setattr(routes_health, "_stockfish_version", None)
    monkeypatch.setattr(routes_health, "get_engine_version", lambda p: "Stockfish 17.1")
    r = client.get("/api/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["stockfish"] == {"ok": True, "version": "Stockfish 17.1"}
    ai = body["checks"]["ai_coaching"]
    assert "model" in ai and "configured" in ai
    assert "api_key" not in str(body).lower()


def test_health_degraded_without_stockfish(client: TestClient, monkeypatch):
    monkeypatch.setattr(routes_health, "_stockfish_version", None)
    monkeypatch.setattr(routes_health, "get_engine_version", lambda p: None)
    r = client.get("/api/health")
    assert r.status_code == 503
    assert r.json()["status"] == "degraded"
    assert r.json()["checks"]["stockfish"]["ok"] is False


def test_health_ai_requires_login(client: TestClient):
    assert client.get("/api/health/ai").status_code == 401


def test_health_ai_live_ping(client: TestClient, monkeypatch):
    token = _token(client, "healthai")
    monkeypatch.setattr(coaching, "is_configured", lambda: True)
    monkeypatch.setattr(coaching, "complete", lambda s, u: ("OK", "google/gemma-4-26b-a4b-it:free"))
    r = client.get("/api/health/ai", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["model_used"] == "google/gemma-4-26b-a4b-it:free"


def test_health_ai_reports_rate_limit(client: TestClient, monkeypatch):
    token = _token(client, "healthai429")
    monkeypatch.setattr(coaching, "is_configured", lambda: True)

    def rate_limited(s, u):
        req = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        resp = httpx.Response(429, request=req, text='{"error":"rate-limited upstream"}')
        raise httpx.HTTPStatusError("429", request=req, response=resp)

    monkeypatch.setattr(coaching, "complete", rate_limited)
    r = client.get("/api/health/ai", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 503
    assert r.json()["error"].startswith("HTTP 429")


def _capture_payload(monkeypatch, model_used: str) -> dict:
    sent: dict = {}

    def fake_post(url, headers, json, timeout):
        sent.update(json)
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={"model": model_used, "choices": [{"message": {"content": "Nice idea."}}]},
        )

    monkeypatch.setattr(coaching.httpx, "post", fake_post)
    return sent


def test_fallback_models_sent_and_used_model_returned(monkeypatch):
    monkeypatch.setattr(coaching, "LLM_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setattr(coaching, "LLM_FALLBACK_MODELS", ["google/gemma-4-26b-a4b-it:free"])
    sent = _capture_payload(monkeypatch, "google/gemma-4-26b-a4b-it:free")
    text, used = coaching.complete("sys", "user")
    assert sent["model"] == "google/gemma-4-31b-it:free"
    assert sent["models"] == ["google/gemma-4-26b-a4b-it:free"]
    assert (text, used) == ("Nice idea.", "google/gemma-4-26b-a4b-it:free")


def test_no_models_field_without_fallbacks(monkeypatch):
    monkeypatch.setattr(coaching, "LLM_FALLBACK_MODELS", [])
    sent = _capture_payload(monkeypatch, "gpt-4o-mini")
    coaching.complete("sys", "user")
    assert "models" not in sent
