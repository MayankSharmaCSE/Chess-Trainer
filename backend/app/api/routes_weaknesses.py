"""US-006/US-007: weakness report over completed analyses."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.analysis import GameAnalysis
from app.models.game import Game
from app.models.user import User
from app.schemas.weaknesses import AnalyzedGame, WeaknessReport
from app.services.weaknesses import get_weakness_report

router = APIRouter(prefix="/api", tags=["weaknesses"])


def _parse_game_ids(raw: str | None) -> list[int] | None:
    """Parse a comma-separated ``game_ids`` query value into a list of ints."""
    if not raw:
        return None
    ids: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="game_ids must be comma-separated integers.",
            )
    return ids or None


@router.get("/weaknesses", response_model=WeaknessReport)
def weaknesses(
    last: int | None = Query(default=None, ge=1, le=200),
    game_ids: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeaknessReport:
    """Weakness map over analyzed games.

    ``last`` limits the report to the N most recently played analyzed games;
    ``game_ids`` (comma-separated) restricts it to an explicit selection and
    takes precedence over ``last``. With neither, all analyzed games are used.
    """
    return get_weakness_report(db, user.id, limit=last, game_ids=_parse_game_ids(game_ids))


@router.get("/weaknesses/games", response_model=list[AnalyzedGame])
def weakness_games(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[AnalyzedGame]:
    """Analyzed games available for manual selection (newest played first)."""
    games = (
        db.query(Game)
        .join(GameAnalysis, GameAnalysis.game_id == Game.id)
        .filter(
            Game.user_id == user.id,
            GameAnalysis.user_id == user.id,
            GameAnalysis.status == "done",
        )
        .order_by(Game.played_at.desc().nullslast(), Game.id.desc())
        .all()
    )
    return [
        AnalyzedGame(
            id=g.id,
            opponent=g.opponent,
            played_at=g.played_at,
            user_result=g.user_result,
            opening_name=g.opening_name,
        )
        for g in games
    ]
