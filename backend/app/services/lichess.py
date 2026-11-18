"""Lichess public API client (no auth needed for public games). Docs: https://lichess.org/api"""

import json
from datetime import datetime, timezone

import httpx

API = "https://lichess.org"
HEADERS = {
    "User-Agent": "ChessLens/0.1 (chess training app)",
    "Accept": "application/x-ndjson",
}


def _dt(ms: int | None) -> datetime | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


def validate_lichess_user(username: str, client: httpx.Client) -> str | None:
    """Return canonical username if the Lichess profile exists, else None."""
    r = client.get(f"{API}/api/user/{username.strip()}", headers={"User-Agent": HEADERS["User-Agent"]})
    if r.status_code == 404:
        return None
    r.raise_for_status()
    data = r.json()
    return data.get("username") or data.get("id")


def _status_of(g: dict) -> str:
    s = g.get("status")
    if isinstance(s, dict):
        return str(s.get("name") or s.get("id") or "")
    return str(s or "")


def _normalize(g: dict) -> dict:
    players = g.get("players") or {}
    white = players.get("white") or {}
    black = players.get("black") or {}
    w_user = white.get("user") or {}
    b_user = black.get("user") or {}
    clock = g.get("clock") or {}
    if clock.get("initial") is not None:
        tc = f"{int(clock['initial'] / 1000)}+{int(clock.get('increment', 0))}"
    else:
        tc = g.get("speed")
    opening = g.get("opening") or {}
    return {
        "external_id": g.get("id", ""),
        "url": f"https://lichess.org/{g.get('id', '')}",
        "pgn": g.get("pgn") or "",
        "white_username": w_user.get("name"),
        "black_username": b_user.get("name"),
        "white_rating": white.get("rating"),
        "black_rating": black.get("rating"),
        "white_result": _status_of(g),
        "black_result": _status_of(g),
        "time_control": tc,
        "rated": g.get("rated"),
        "opening_eco": opening.get("eco"),
        "opening_name": opening.get("name"),
        "played_at": _dt(g.get("lastMoveAt") or g.get("createdAt")),
        "_winner": g.get("winner"),  # white | black | None(draw)
    }


def fetch_lichess_games(
    username: str,
    max_games: int,
    client: httpx.Client,
    since_ms: int | None = None,
) -> list[dict]:
    """Most-recent-first NDJSON export (lichess sorts dateDesc by default)."""
    params = {"max": max_games, "pgnInJson": "true", "opening": "true"}
    if since_ms:
        params["since"] = since_ms
    r = client.get(f"{API}/api/games/user/{username.strip()}", params=params, headers=HEADERS)
    r.raise_for_status()
    out: list[dict] = []
    for line in r.iter_lines():
        if not line or len(out) >= max_games:
            continue
        try:
            out.append(_normalize(json.loads(line)))
        except (json.JSONDecodeError, AttributeError):
            continue
    return out
