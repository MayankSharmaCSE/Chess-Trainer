import os

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data.db")
# Hosts (e.g. Render) hand out "postgres://" or "postgresql://"; pin the
# psycopg 3 driver explicitly so the URL works on any SQLAlchemy 2.x.
for _prefix in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_prefix):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_prefix):]
        break
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
STOCKFISH_PATH = os.getenv("STOCKFISH_PATH", "stockfish")
ANALYSIS_DEFAULT_DEPTH = int(os.getenv("ANALYSIS_DEFAULT_DEPTH", "15"))
ANALYSIS_MAX_DEPTH = 22

# US-009 Option B: LLM grounded coaching (Stockfish facts -> LLM prose).
# Leave LLM_API_KEY empty to run without AI coaching; the app falls back to
# rules-v1 text and the coaching endpoint returns 503. Any OpenAI-compatible
# endpoint works via LLM_BASE_URL (OpenAI default; Gemini/OpenRouter OK).
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai-compatible")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
LLM_TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "20"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "150"))
# Optional: sent as `reasoning_effort` for thinking models (Qwen/GPT-OSS/Gemini).
# e.g. "none" (Ollama Qwen, Groq Qwen), "low" (GPT-OSS, Gemini 3). Empty = not sent.
LLM_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "").strip()
# OpenRouter only: comma-separated backup models, tried in order when LLM_MODEL
# errors (429 rate limit, downtime). Sent as the `models` array. Empty = off,
# so other OpenAI-compatible providers never see the unknown field.
LLM_FALLBACK_MODELS = [
    m.strip() for m in os.getenv("LLM_FALLBACK_MODELS", "").split(",") if m.strip()
]
