"""US-001 connect + US-002 sync + game library."""

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.account import ConnectedAccount
from app.models.game import Game
from app.models.user import User
from app.schemas.sync import (
    AccountOut,
    ConnectIn,
    GameDetailOut,
    GamesPage,
    GameSummaryOut,
    SyncOut,
)
from app.services import chesscom, lichess
from app.services.store import upsert_games

router = APIRouter(prefix="/api", tags=["sync"])


def _client() -> httpx.Client:
    return httpx.Client(timeout=20.0, follow_redirects=True)


def _validate(platform: str, username: str, client: httpx.Client) -> str | None:
    if platform == "chesscom":
        return chesscom.validate_chesscom_user(username, client)
    return lichess.validate_lichess_user(username, client)


def _fetch(platform: str, username: str, max_games: int, client: httpx.Client) -> list[dict]:
    if platform == "chesscom":
        return chesscom.fetch_chesscom_games(username, max_games, client)
    return lichess.fetch_lichess_games(username, max_games, client)


def _out(account: ConnectedAccount) -> AccountOut:
    return AccountOut(
        id=account.id,
        platform=account.platform,
        username=account.platform_username,
        status=account.status,
        game_count=account.game_count,
        last_synced_at=account.last_synced_at,
        created_at=account.created_at,
    )


@router.post("/accounts/connect", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def connect(body: ConnectIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    username = body.username.strip()
    try:
        with _client() as client:
            canonical = _validate(body.platform, username, client)
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Platform API is unreachable. Retry in a bit.",
        )
    if canonical is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {body.platform} user named '{username}'. Check the spelling.",
        )
    norm = canonical.lower()
    account = (
        db.query(ConnectedAccount)
        .filter(
            ConnectedAccount.user_id == user.id,
            ConnectedAccount.platform == body.platform,
            ConnectedAccount.platform_username_norm == norm,
        )
        .first()
    )
    if account:
        account.platform_username = canonical
        account.status = "connected"
    else:
        account = ConnectedAccount(
            user_id=user.id,
            platform=body.platform,
            platform_username=canonical,
            platform_username_norm=norm,
        )
        db.add(account)
    db.commit()
    db.refresh(account)
    return _out(account)


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    accounts = (
        db.query(ConnectedAccount)
        .filter(ConnectedAccount.user_id == user.id)
        .order_by(ConnectedAccount.created_at)
        .all()
    )
    return [_out(a) for a in accounts]


@router.delete("/accounts/{account_id}")
def disconnect(account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    account = (
        db.query(ConnectedAccount)
        .filter(ConnectedAccount.id == account_id, ConnectedAccount.user_id == user.id)
        .first()
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    db.delete(account)  # imported games are kept
    db.commit()
    return {"ok": True}


@router.post("/accounts/{account_id}/sync", response_model=SyncOut)
def sync(
    account_id: int,
    max_games: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = (
        db.query(ConnectedAccount)
        .filter(ConnectedAccount.id == account_id, ConnectedAccount.user_id == user.id)
        .first()
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
    try:
        with _client() as client:
            items = _fetch(account.platform, account.platform_username, max_games, client)
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Platform API is unreachable. Retry in a bit.",
        )
    imported, skipped = upsert_games(db, user.id, account, items)
    total = db.query(Game).filter(Game.user_id == user.id).count()
    account.game_count = total
    account.last_synced_at = datetime.now(timezone.utc)
    newest = (
        db.query(Game.played_at)
        .filter(Game.user_id == user.id, Game.played_at.isnot(None))
        .order_by(Game.played_at.desc())
        .first()
    )
    if newest:
        account.last_synced_played_at = newest[0]
    db.commit()
    return SyncOut(
        imported=imported, skipped=skipped, total=total, last_synced_at=account.last_synced_at
    )


@router.get("/games", response_model=GamesPage)
def list_games(
    platform: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Game).filter(Game.user_id == user.id)
    if platform:
        q = q.filter(Game.platform == platform)
    total = q.count()
    games = q.order_by(Game.played_at.desc().nullslast(), Game.id.desc()).offset(offset).limit(limit).all()
    return GamesPage(games=[GameSummaryOut.model_validate(g) for g in games], total=total)


@router.get("/games/{game_id}", response_model=GameDetailOut)
def game_detail(game_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    game = (
        db.query(Game).filter(Game.id == game_id, Game.user_id == user.id).first()
    )
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")
    return GameDetailOut.model_validate(game)
