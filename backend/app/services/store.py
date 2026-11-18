"""Upsert normalized platform games into the DB (dedupe on platform+external_id)."""

from sqlalchemy.orm import Session

from app.models.account import ConnectedAccount
from app.models.game import Game
from app.services.chesscom import DRAW_RESULTS

# Normalized game dict keys produced by services/chesscom.py and services/lichess.py.


def _perspective(item: dict, account_norm: str) -> tuple[str | None, str | None, str | None]:
    """Return (user_color, user_result, opponent) from the account owner's perspective."""
    w = (item.get("white_username") or "").lower()
    b = (item.get("black_username") or "").lower()
    if w == account_norm:
        color, mine = "white", item.get("white_result")
        opponent = item.get("black_username")
    elif b == account_norm:
        color, mine = "black", item.get("black_result")
        opponent = item.get("white_username")
    else:
        return None, None, None
    if "_winner" in item:  # lichess-style: winner is "white" | "black" | None (draw)
        winner = item.get("_winner")
        result = "draw" if winner is None else ("win" if winner == color else "loss")
    else:  # chess.com-style per-player result strings
        mine_s = str(mine or "").lower()
        result = "win" if mine_s == "win" else "draw" if mine_s in DRAW_RESULTS else "loss"
    return color, result, opponent


def upsert_games(
    db: Session, user_id: int, account: ConnectedAccount, items: list[dict]
) -> tuple[int, int]:
    imported, skipped = 0, 0
    norm = (account.platform_username or "").lower()
    for item in items:
        if not item.get("external_id") or not item.get("pgn"):
            skipped += 1
            continue
        exists = (
            db.query(Game)
            .filter(
                Game.user_id == user_id,
                Game.platform == account.platform,
                Game.external_id == item["external_id"],
            )
            .first()
        )
        if exists:
            skipped += 1
            continue
        color, result, opponent = _perspective(item, norm)
        db.add(
            Game(
                user_id=user_id,
                account_id=account.id,
                platform=account.platform,
                external_id=item["external_id"],
                url=item.get("url"),
                pgn=item["pgn"],
                white_username=item.get("white_username"),
                black_username=item.get("black_username"),
                white_rating=item.get("white_rating"),
                black_rating=item.get("black_rating"),
                white_result=item.get("white_result"),
                black_result=item.get("black_result"),
                user_color=color,
                user_result=result,
                opponent=opponent,
                time_control=item.get("time_control"),
                rated=item.get("rated"),
                opening_eco=item.get("opening_eco"),
                opening_name=item.get("opening_name"),
                played_at=item.get("played_at"),
            )
        )
        imported += 1
    db.commit()
    return imported, skipped
