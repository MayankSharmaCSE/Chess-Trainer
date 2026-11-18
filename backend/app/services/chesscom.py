"""Chess.com public API client (no auth needed). Docs: https://www.chess.com/news/view/published-data-api"""

from datetime import datetime, timezone

import httpx

API = "https://api.chess.com/pub"
HEADERS = {"User-Agent": "ChessLens/0.1 (chess training app)"}
MAX_ARCHIVES_PER_SYNC = 12

DRAW_RESULTS = {"agreed", "stalemate", "repetition", "insufficient", "50move", "timevsinsufficient"}


def _dt(epoch_seconds: int | None) -> datetime | None:
    if not epoch_seconds:
        return None
    return datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)


def validate_chesscom_user(username: str, client: httpx.Client) -> str | None:
    """Return canonical username if the Chess.com profile exists, else None."""
    r = client.get(f"{API}/player/{username.strip()}", headers=HEADERS)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json().get("username")


def _normalize(g: dict) -> dict:
    white = g.get("white") or {}
    black = g.get("black") or {}
    eco_url = (g.get("eco") or "").rstrip("/")
    opening_name = eco_url.split("/")[-1].replace("-", " ") if eco_url else None
    return {
        "external_id": g.get("url", ""),
        "url": g.get("url"),
        "pgn": g.get("pgn") or "",
        "white_username": white.get("username"),
        "black_username": black.get("username"),
        "white_rating": white.get("rating"),
        "black_rating": black.get("rating"),
        "white_result": white.get("result"),
        "black_result": black.get("result"),
        "time_control": str(g.get("time_control")) if g.get("time_control") else None,
        "rated": g.get("rated"),
        "opening_eco": None,
        "opening_name": opening_name,
        "played_at": _dt(g.get("end_time")),
    }


def fetch_chesscom_games(username: str, max_games: int, client: httpx.Client) -> list[dict]:
    """Newest-first games across monthly archives (stops once max_games is reached)."""
    r = client.get(f"{API}/player/{username}/games/archives", headers=HEADERS)
    r.raise_for_status()
    archives: list[str] = r.json().get("archives", [])
    out: list[dict] = []
    for archive_url in reversed(archives[-MAX_ARCHIVES_PER_SYNC:]):
        if len(out) >= max_games:
            break
        ar = client.get(archive_url, headers=HEADERS)
        ar.raise_for_status()
        # Archives are oldest-first; reverse so newest come first.
        for g in reversed(ar.json().get("games", [])):
            if len(out) >= max_games:
                break
            if g.get("pgn"):
                out.append(_normalize(g))
    return out
