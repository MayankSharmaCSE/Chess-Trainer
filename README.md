# Chess-Trainer (ChessLens)

Import your Lichess / Chess.com games, find your mistakes with Stockfish, and train on them.

- `frontend/`: Next.js app (UI + `/api/bff` proxy to the backend)
- `backend/`: FastAPI + Stockfish + SQLAlchemy (SQLite locally, Postgres in production)

Local setup: see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Deployment (Render)

| Service | Type | Root dir | URL |
|---|---|---|---|
| chesslens-web | Node web service | `frontend` | https://chesslens-web.onrender.com |
| chesslens-api | Docker web service (`backend/Dockerfile`, Stockfish 17) | `backend` | https://chesslens-api-tscv.onrender.com |
| chesslens-db | Render Postgres | n/a | internal |

Pushes to `main` auto-deploy both services.

Environment:
- **chesslens-web**: `BACKEND_URL` (backend URL), `NODE_VERSION=22`
- **chesslens-api**: `DATABASE_URL` (internal Postgres URL), `JWT_SECRET`, `STOCKFISH_PATH=/usr/games/stockfish`,
  optional `LLM_*` for AI coaching (see `backend/.env.example`)

Health:
- `GET /healthz`: liveness (used by Render)
- `GET /api/health`: database, Stockfish, AI-coaching config
- `GET /api/bff/health/ai` on the frontend (logged in): live AI-provider check
