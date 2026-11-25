from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_analysis import reset_interrupted_analyses, router as analysis_router
from app.api.routes_auth import router as auth_router
from app.api.routes_bots import router as bots_router
from app.api.routes_endgame import router as endgame_router
from app.api.routes_health import router as health_router
from app.api.routes_progress import router as progress_router
from app.api.routes_sync import router as sync_router
from app.api.routes_training import router as training_router
from app.api.routes_weaknesses import router as weaknesses_router
from app.core.config import FRONTEND_URL
from app.db.base import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    reset_interrupted_analyses()
    yield


app = FastAPI(title="ChessLens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(bots_router)
app.include_router(endgame_router)
app.include_router(sync_router)
app.include_router(analysis_router)
app.include_router(weaknesses_router)
app.include_router(training_router)
app.include_router(progress_router)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}
