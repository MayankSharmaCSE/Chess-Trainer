"""Detailed health checks.

/healthz (main.py) stays a dependency-free liveness probe for Render, so a DB
blip never makes Render restart the container. These routes report on each
dependency instead:

- GET /api/health     public: database, Stockfish, AI-coaching config.
                      200 when DB + Stockfish are up, 503 otherwise.
- GET /api/health/ai  logged-in only: one live call to the LLM provider with
                      the exact coaching settings (costs one request, so it is
                      not public). Shows latency and which model answered.
"""

import os
import time
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import get_current_user
from app.core.config import (
    LLM_BASE_URL,
    LLM_FALLBACK_MODELS,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_REASONING_EFFORT,
    LLM_TIMEOUT_S,
    STOCKFISH_PATH,
)
from app.db.base import engine
from app.models.user import User
from app.services import coaching, mailer
from app.services.engine import get_engine_version

router = APIRouter(prefix="/api/health", tags=["health"])

# The binary is baked into the image, so one successful probe per process is
# enough; failures are retried on every call.
_stockfish_version: str | None = None


def _ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


def _check_database() -> dict:
    start = time.perf_counter()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "dialect": engine.dialect.name, "latency_ms": _ms(start)}
    except Exception as e:  # noqa: BLE001 - reported, never raised
        # Type only: driver messages can include the host/user.
        return {"ok": False, "dialect": engine.dialect.name, "error": type(e).__name__}


def _check_stockfish() -> dict:
    global _stockfish_version
    if _stockfish_version is None:
        _stockfish_version = get_engine_version(STOCKFISH_PATH)
    if _stockfish_version:
        return {"ok": True, "version": _stockfish_version}
    return {"ok": False, "error": f"Stockfish not runnable at '{STOCKFISH_PATH}'"}


def _ai_config() -> dict:
    return {
        "configured": coaching.is_configured(),
        "provider": urlparse(LLM_BASE_URL).hostname,
        "model": LLM_MODEL,
        "fallback_models": LLM_FALLBACK_MODELS,
        "timeout_s": LLM_TIMEOUT_S,
        "max_tokens": LLM_MAX_TOKENS,
        "reasoning_effort": LLM_REASONING_EFFORT or None,
    }


@router.get("")
def health() -> JSONResponse:
    db = _check_database()
    sf = _check_stockfish()
    ok = db["ok"] and sf["ok"]
    body = {
        "status": "ok" if ok else "degraded",
        "commit": (os.getenv("RENDER_GIT_COMMIT") or "")[:7] or None,
        "checks": {"database": db, "stockfish": sf, "ai_coaching": _ai_config(), "email": mailer.status()},
    }
    return JSONResponse(body, status_code=200 if ok else 503)


@router.get("/ai")
def health_ai(_: User = Depends(get_current_user)) -> JSONResponse:
    cfg = _ai_config()
    if not cfg["configured"]:
        return JSONResponse({"ok": False, **cfg, "error": "LLM_API_KEY not set"}, status_code=503)
    start = time.perf_counter()
    try:
        reply, used = coaching.complete(
            "You are a health check. Reply with exactly the word OK.", "ping"
        )
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            {"ok": False, **cfg, "latency_ms": _ms(start),
             "error": f"HTTP {e.response.status_code}: {e.response.text[:300]}"},
            status_code=503,
        )
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
        return JSONResponse(
            {"ok": False, **cfg, "latency_ms": _ms(start), "error": f"{type(e).__name__}: {e}"},
            status_code=503,
        )
    return JSONResponse(
        {"ok": True, **cfg, "model_used": used, "latency_ms": _ms(start), "reply": reply[:80]}
    )
