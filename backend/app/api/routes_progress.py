"""US-010: performance tracking over analyzed games + training."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.progress import ProgressReport
from app.services.progress import get_progress_report

router = APIRouter(prefix="/api", tags=["progress"])


@router.get("/progress", response_model=ProgressReport)
def progress(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProgressReport:
    return get_progress_report(db, user.id)
