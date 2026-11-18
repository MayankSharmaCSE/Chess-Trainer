"""US-010: performance tracking over time.

Sources (all already in the DB):
- done GameAnalyses + user MoveAnalyses -> per-game accuracy + blunder/mistake/
  inaccuracy rates, phase trends (same ply buckets as weaknesses).
- Game.user_color + white/black_rating -> rating trend (your rating per game).
- TrainingAttempts (+ drills) -> attempts/day, training accuracy, completion.

`insufficient_data` mirrors the weaknesses threshold (<3 analyzed games):
trends need evidence before they mean anything.
"""

from collections import Counter, defaultdict
from datetime import timezone

from sqlalchemy.orm import Session

from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game
from app.models.training import TrainingAttempt, TrainingDrill
from app.schemas.progress import (
    GamePoint,
    PhaseTrend,
    ProgressReport,
    RatingPoint,
    TrainingPoint,
)
from app.services.weaknesses import MIN_GAMES_FOR_PATTERNS, PHASES, phase_for_ply


def _rating_for(game: Game) -> int | None:
    if game.user_color == "white":
        return game.white_rating
    if game.user_color == "black":
        return game.black_rating
    return game.white_rating or game.black_rating


def _sort_key(g: Game):
    played = g.played_at
    if played is not None and played.tzinfo is None:
        played = played.replace(tzinfo=timezone.utc)
    return (played is None, played, g.id)


def get_progress_report(db: Session, user_id: int) -> ProgressReport:
    analyses = (
        db.query(GameAnalysis)
        .filter(GameAnalysis.user_id == user_id, GameAnalysis.status == "done")
        .all()
    )
    drills = db.query(TrainingDrill).filter(TrainingDrill.user_id == user_id).all()
    attempts = (
        db.query(TrainingAttempt)
        .filter(TrainingAttempt.user_id == user_id)
        .order_by(TrainingAttempt.created_at)
        .all()
    )

    if not analyses:
        return ProgressReport(
            games_analyzed=0, points=[], rating_trend=[],
            avg_blunders_per_game=0.0, avg_mistakes_per_game=0.0,
            avg_inaccuracies_per_game=0.0, overall_accuracy=None,
            phases=[PhaseTrend(phase=p, blunders=0, mistakes=0, inaccuracies=0, total=0) for p in PHASES],
            training=[], training_accuracy=None, training_completion_rate=None,
            insufficient_data=True,
        )

    by_game = {a.game_id: a for a in analyses}
    games = db.query(Game).filter(Game.id.in_(list(by_game)), Game.user_id == user_id).all()
    games.sort(key=_sort_key)
    moves = (
        db.query(MoveAnalysis)
        .filter(
            MoveAnalysis.analysis_id.in_([a.id for a in analyses]),
            MoveAnalysis.is_user_move.is_(True),
        )
        .all()
    )
    by_game_moves: dict[int, list[MoveAnalysis]] = defaultdict(list)
    for m in moves:
        by_game_moves[m.game_id].append(m)

    points: list[GamePoint] = []
    rating_trend: list[RatingPoint] = []
    phase_counts: dict[str, Counter] = {p: Counter() for p in PHASES}
    total_user_moves = flagged = 0
    for g in games:
        gmoves = by_game_moves.get(g.id, [])
        b = sum(1 for m in gmoves if (m.classification or "").upper() == "BLUNDER")
        mi = sum(1 for m in gmoves if (m.classification or "").upper() == "MISTAKE")
        ina = sum(1 for m in gmoves if (m.classification or "").upper() == "INACCURACY")
        for m in gmoves:
            cls = (m.classification or "").upper()
            if cls in ("BLUNDER", "MISTAKE", "INACCURACY"):
                phase_counts[phase_for_ply(m.ply)][cls] += 1
        n = len(gmoves)
        total_user_moves += n
        flagged += b + mi + ina
        rating = _rating_for(g)
        points.append(GamePoint(
            game_id=g.id, played_at=g.played_at, user_result=g.user_result,
            user_rating=rating, opponent=g.opponent, opening=(g.opening_name or "").strip() or None,
            blunders=b, mistakes=mi, inaccuracies=ina, user_moves=n,
            accuracy=((n - (b + mi + ina)) / n) if n else None,
        ))
        if rating is not None:
            rating_trend.append(RatingPoint(played_at=g.played_at, rating=rating))

    n_games = len(games)
    phases = [
        PhaseTrend(
            phase=p, blunders=phase_counts[p]["BLUNDER"], mistakes=phase_counts[p]["MISTAKE"],
            inaccuracies=phase_counts[p]["INACCURACY"],
            total=phase_counts[p]["BLUNDER"] + phase_counts[p]["MISTAKE"] + phase_counts[p]["INACCURACY"],
        )
        for p in PHASES
    ]

    per_day: dict[str, dict[str, int]] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for a in attempts:
        day = a.created_at.date().isoformat() if a.created_at else "unknown"
        per_day[day]["attempts"] += 1
        if a.correct:
            per_day[day]["correct"] += 1
    training = [
        TrainingPoint(day=d, attempts=v["attempts"], correct=v["correct"])
        for d, v in sorted(per_day.items())
    ]
    solved_ids = {a.drill_id for a in attempts if a.correct}
    total_drills = len(drills)

    return ProgressReport(
        games_analyzed=n_games, points=points, rating_trend=rating_trend,
        avg_blunders_per_game=sum(p.blunders for p in points) / n_games,
        avg_mistakes_per_game=sum(p.mistakes for p in points) / n_games,
        avg_inaccuracies_per_game=sum(p.inaccuracies for p in points) / n_games,
        overall_accuracy=((total_user_moves - flagged) / total_user_moves) if total_user_moves else None,
        phases=phases, training=training,
        training_accuracy=(sum(1 for a in attempts if a.correct) / len(attempts)) if attempts else None,
        training_completion_rate=(len(solved_ids) / total_drills) if total_drills else None,
        insufficient_data=n_games < MIN_GAMES_FOR_PATTERNS,
    )
