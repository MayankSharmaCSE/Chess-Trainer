# ChessLens backend (FastAPI)
# PRD stack: FastAPI + Python + PostgreSQL + Redis + Stockfish 16
# This folder starts with auth only (US: login/signup). More routers to follow.

## Quickstart (dev, SQLite)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000 --env-file .env
```

`--env-file .env` matters: `app/core/config.py` only reads `os.getenv`, so without it
`.env` (JWT_SECRET, LLM_*) is ignored and defaults are used.

Health:
- `GET /healthz`: liveness only (Render health check), `{"ok": true}`.
- `GET /api/health`: database, Stockfish, AI-coaching config. 200 ok / 503 degraded.
- `GET /api/health/ai` (logged in): one live LLM call with the coaching settings;
  shows latency, `model_used`, or the provider error. In the browser: `/api/bff/health/ai`.
Docs: `http://localhost:8000/docs`

## Auth contract (frozen for frontend)

- `POST /api/auth/signup {username, email, password}` -> `201 {access_token, token_type, user}`
- `POST /api/auth/login {identifier, password}` -> `200 {access_token, token_type, user}` (`identifier` = email or username)
- `GET /api/auth/me` (header `Authorization: Bearer <token>`) -> `200 {id, username, email, created_at}`
- `POST /api/auth/logout` -> `200 {ok: true}` (stateless; client discards token)

## Env

See `.env.example`. `DATABASE_URL` defaults to SQLite `./data.db`.
For Postgres: `DATABASE_URL=postgresql://user:pass@localhost:5432/chesslens`
(`psycopg[binary]` is in requirements; `postgres://` URLs are normalized).

## AI coaching (optional, US-009 Option B)

Set `LLM_API_KEY` (and optionally `LLM_MODEL`, `LLM_BASE_URL`) in `.env`, then restart.
Any OpenAI-compatible Chat Completions endpoint works (OpenAI default; Gemini/OpenRouter
via `LLM_BASE_URL`). Without a key the app runs normally and
`POST /api/training/drills/{id}/coaching` returns `503 {"detail": "AI coaching not configured"}`.

- `{"level": "hint"}`: spoiler-free (best move never sent to the provider; replies naming it are discarded).
- `{"level": "reveal"}`: Stockfish's best move + line are sent and the LLM explains them. The UI's
  "Need a hint?" button shows the best move first, then this explanation (works before solving).
- Response: `{level, text, source}` with `source` = `llm` or `rules-v1` (timeout / failed validation fallback).
- OpenRouter: set `LLM_FALLBACK_MODELS` (comma-separated) to fail over on 429/downtime.
- Cached per drill + level in `training_drills`; `init_db()` adds the coaching columns to older `data.db` files.

## Tests

```bash
pytest -q
```
