"""Lazy equivalent-best computation for drills (US-009 refinement).

A move is "equivalent" if the engine judges the resulting position within
EQUIV_CP_TOLERANCE centipawns of the best move's position (mover-perspective).
Mates for the mover always count; getting mated / losing a forced mate never
counts, regardless of tolerance.

Only computed when an attempt is legal but not the exact best move — the
exact-best fast path never touches the engine, keeping grading instant.
Results are cached on the drill (acceptable_ucis) so repeat attempts are free.
"""

import chess
import chess.engine

from app.core.config import STOCKFISH_PATH
from app.services.engine import mover_value
from app.services.engine_slots import slots

EQUIV_CP_TOLERANCE = 15
EQUIV_DEPTH = 15
EQUIV_MULTIPV = 8


def compute_acceptable(
    fen_before: str,
    best_uci: str,
    depth: int = EQUIV_DEPTH,
    engine_path: str = STOCKFISH_PATH,
) -> list[str]:
    """Return UCI moves equivalent to best (incl. best itself). Raises on engine failure."""
    board = chess.Board(fen_before)
    legal = list(board.legal_moves)
    try:
        best_move = chess.Move.from_uci(best_uci)
    except ValueError:
        return [best_uci]
    if best_move not in legal:
        return [best_uci]

    with slots.slot():  # ~250 MB process; see engine_slots
        engine = chess.engine.SimpleEngine.popen_uci(engine_path)
        try:
            mover_is_white = board.turn == chess.WHITE
            # Fast path: use MultiPV once, then score only candidates near the top.
            info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=min(EQUIV_MULTIPV, len(legal)))
            ranked: list[tuple[int, str]] = []
            for slot in info:
                pv = slot.get("pv") or []
                if not pv:
                    continue
                score = slot["score"].pov(chess.WHITE)
                ranked.append((mover_value(score, mover_is_white), pv[0].uci()))
            if not ranked:
                return [best_uci]
            best_value = max(v for v, _ in ranked)
            acceptable = [uci for v, uci in ranked if best_value - v <= EQUIV_CP_TOLERANCE]
            if best_uci not in acceptable:
                acceptable.append(best_uci)
            return acceptable
        finally:
            try:
                engine.quit()
            except chess.engine.EngineError:
                pass


def is_equivalent(fen_before: str, played_uci: str, best_uci: str, acceptable: list[str] | None) -> bool:
    if played_uci == best_uci:
        return False  # exact, not "equivalent"
    return acceptable is not None and played_uci in acceptable
