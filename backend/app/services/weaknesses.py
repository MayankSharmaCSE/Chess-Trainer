"""US-006/US-007: weakness aggregation over completed Stockfish analyses.

Only the requesting user's *own* moves (MoveAnalysis.is_user_move=True)
from analyses with status="done" are counted, so opponent mistakes never
pollute the map.

Phase buckets (documented choice; PRD does not fix ply cutoffs):
  Opening    ply <= 20
  Middlegame 21 <= ply <= 60
  Endgame    ply > 60

A report with fewer than MIN_GAMES_FOR_PATTERNS analyzed games sets
insufficient_data=True (PRD: "Not enough data to identify recurring
weaknesses").
"""

from collections import Counter

from sqlalchemy.orm import Session

from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game
from app.schemas.weaknesses import EvidenceGame, OpeningStat, PhaseBucket, WeaknessReport

MIN_GAMES_FOR_PATTERNS = 3
MAX_OPENINGS = 5
MAX_EVIDENCE = 5

PHASES = ("Opening", "Middlegame", "Endgame")


def phase_for_ply(ply: int) -> str:
    if ply <= 20:
        return "Opening"
    if ply <= 60:
        return "Middlegame"
    return "Endgame"


def _opening_key(game: Game) -> str:
    name = (game.opening_name or "").strip()
    return name or "Unknown"


def get_weakness_report(
    db: Session,
    user_id: int,
    *,
    limit: int | None = None,
    game_ids: list[int] | None = None,
) -> WeaknessReport:
    """Aggregate weaknesses over the user's completed analyses.

    Scope selection (both ordered by play date, newest first, matching the
    game library):
      * ``game_ids`` restricts the report to an explicit set of games (manual
        selection). When provided it takes precedence over ``limit``.
      * ``limit`` keeps only the N most recently played analyzed games.
    Only games with a completed analysis carry mistake data, so the pool is
    the user's ``status="done"`` analyses.
    """
    query = (
        db.query(GameAnalysis)
        .join(Game, Game.id == GameAnalysis.game_id)
        .filter(
            GameAnalysis.user_id == user_id,
            GameAnalysis.status == "done",
            Game.user_id == user_id,
        )
    )
    if game_ids:
        query = query.filter(GameAnalysis.game_id.in_(game_ids))
    query = query.order_by(Game.played_at.desc().nullslast(), Game.id.desc())
    if limit is not None and not game_ids:
        query = query.limit(limit)
    analyses = query.all()
    games_analyzed = len(analyses)
    if games_analyzed == 0:
        return WeaknessReport(
            games_analyzed=0,
            user_moves_analyzed=0,
            blunders=0,
            mistakes=0,
            inaccuracies=0,
            phases=[PhaseBucket(phase=p, blunder=0, mistake=0, inaccuracy=0, total=0) for p in PHASES],
            top_openings=[],
            sample_games=[],
            insufficient_data=True,
        )

    analysis_ids = [a.id for a in analyses]
    analyzed_game_ids = [a.game_id for a in analyses]
    games = db.query(Game).filter(Game.id.in_(analyzed_game_ids), Game.user_id == user_id).all()
    game_by_id = {g.id: g for g in games}

    user_moves = (
        db.query(MoveAnalysis)
        .filter(MoveAnalysis.analysis_id.in_(analysis_ids), MoveAnalysis.is_user_move.is_(True))
        .order_by(MoveAnalysis.ply)
        .all()
    )

    blunders = mistakes = inaccuracies = 0
    phase_counts: dict[str, Counter] = {p: Counter() for p in PHASES}
    opening_games: dict[str, set[int]] = {}
    opening_flags: Counter = Counter()
    game_flags: Counter = Counter()

    for m in user_moves:
        cls = (m.classification or "").upper() or None
        phase = phase_for_ply(m.ply)
        game = game_by_id.get(m.game_id)
        key = _opening_key(game) if game is not None else "Unknown"
        opening_games.setdefault(key, set()).add(m.game_id)
        if cls == "BLUNDER":
            blunders += 1
            phase_counts[phase]["BLUNDER"] += 1
            opening_flags[key] += 1
            game_flags[m.game_id] += 1
        elif cls == "MISTAKE":
            mistakes += 1
            phase_counts[phase]["MISTAKE"] += 1
            opening_flags[key] += 1
            game_flags[m.game_id] += 1
        elif cls == "INACCURACY":
            inaccuracies += 1
            phase_counts[phase]["INACCURACY"] += 1
            opening_flags[key] += 1
            game_flags[m.game_id] += 1

    # Ensure every analyzed game's opening appears even with zero flags.
    for g in games:
        opening_games.setdefault(_opening_key(g), set()).add(g.id)

    phases = [
        PhaseBucket(
            phase=p,
            blunder=phase_counts[p]["BLUNDER"],
            mistake=phase_counts[p]["MISTAKE"],
            inaccuracy=phase_counts[p]["INACCURACY"],
            total=phase_counts[p]["BLUNDER"] + phase_counts[p]["MISTAKE"] + phase_counts[p]["INACCURACY"],
        )
        for p in PHASES
    ]

    top_openings = sorted(
        (
            OpeningStat(opening=name, games=len(gids), flags=opening_flags.get(name, 0))
            for name, gids in opening_games.items()
        ),
        key=lambda o: (-o.flags, -o.games, o.opening.lower()),
    )[:MAX_OPENINGS]

    flagged_games = [game_by_id[gid] for gid in game_flags if gid in game_by_id]
    # Most flags first; ties -> newer game (higher id) first for determinism.
    flagged_games.sort(key=lambda g: (-game_flags[g.id], -g.id))
    sample_games = [
        EvidenceGame(
            id=g.id,
            opponent=g.opponent,
            played_at=g.played_at,
            user_result=g.user_result,
            flags=game_flags[g.id],
        )
        for g in flagged_games[:MAX_EVIDENCE]
    ]

    return WeaknessReport(
        games_analyzed=games_analyzed,
        user_moves_analyzed=len(user_moves),
        blunders=blunders,
        mistakes=mistakes,
        inaccuracies=inaccuracies,
        phases=phases,
        top_openings=top_openings,
        sample_games=sample_games,
        insufficient_data=games_analyzed < MIN_GAMES_FOR_PATTERNS,
    )
