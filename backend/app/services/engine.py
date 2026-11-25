"""Stockfish analysis over a saved PGN (US-005).

Evals are White-POV. Mate scores use a large constant so any mate swing
(missed mate, got mated) counts as a blunder; delaying a forced mate counts
as a mistake.
"""

import chess
import chess.engine
import chess.pgn

from app.core.config import ANALYSIS_MAX_DEPTH, STOCKFISH_PATH
from app.services.engine_slots import analysis_lock, slots

MATE_CP = 100_000
BLUNDER_MIN = 300
MISTAKE_MIN = 100
INACCURACY_MIN = 50
MATE_DELAY_AS_MISTAKE = 120
MAX_PLIES = 240


def classify_loss(cp_loss: int) -> str | None:
    if cp_loss >= BLUNDER_MIN:
        return "BLUNDER"
    if cp_loss >= MISTAKE_MIN:
        return "MISTAKE"
    if cp_loss >= INACCURACY_MIN:
        return "INACCURACY"
    return None


def mover_value(white_score: chess.engine.Score, mover_is_white: bool) -> int:
    """Centipawn value from the mover's perspective (mates collapse to +/-MATE_CP)."""
    if white_score.is_mate():
        m = white_score.mate() or 0
        if m == 0:
            # Checkmate already on the board: python-chess reports MateGiven when
            # White delivered it and Mate(-0) when White is mated; both .mate() == 0.
            white_wins = white_score == chess.engine.MateGiven
        else:
            white_wins = m > 0
        return MATE_CP if white_wins == mover_is_white else -MATE_CP
    cp = white_score.score() or 0
    return cp if mover_is_white else -cp


def mover_loss(
    before_white: chess.engine.Score,
    after_white: chess.engine.Score,
    mover_is_white: bool,
) -> int:
    # Delaying a forced mate: flag as a mistake even though cp delta is ~0.
    if (
        before_white.is_mate()
        and after_white.is_mate()
        and ((before_white.mate() or 0) > 0) == mover_is_white
        and ((after_white.mate() or 0) > 0) == mover_is_white
    ):
        b, a = abs(before_white.mate() or 0), abs(after_white.mate() or 0)
        if a > b:
            return MATE_DELAY_AS_MISTAKE
    return mover_value(before_white, mover_is_white) - mover_value(after_white, mover_is_white)


def _split(score: chess.engine.Score) -> tuple[int | None, int | None]:
    if score.is_mate():
        return None, score.mate()
    return score.score(), None


def get_engine_version(engine_path: str = STOCKFISH_PATH) -> str | None:
    try:
        with slots.slot():
            engine = chess.engine.SimpleEngine.popen_uci(engine_path)
            name = engine.id.get("name")
            engine.quit()
        return str(name) if name else None
    except (OSError, RuntimeError, chess.engine.EngineError):
        return None


def analyze_game(
    pgn: str,
    depth: int,
    user_color: str | None = None,
    engine_path: str = STOCKFISH_PATH,
) -> dict:
    """Run Stockfish over the mainline. Returns {moves: [...], ...} (raises on failure)."""
    depth = max(1, min(ANALYSIS_MAX_DEPTH, depth))
    game = chess.pgn.read_game(__import__("io").StringIO(pgn))
    if game is None:
        raise ValueError("Could not parse PGN.")
    moves = list(game.mainline_moves())[:MAX_PLIES]

    board = game.board()
    positions = [board.copy()]
    for m in moves:
        board.push(m)
        positions.append(board.copy())
    version, white_evals, best_ucis, pvs = _evaluate_positions(positions, depth, engine_path)

    out: list[dict] = []
    counts = {"BLUNDER": 0, "MISTAKE": 0, "INACCURACY": 0}
    for i, move in enumerate(moves):
        pos = positions[i]
        mover_is_white = pos.turn == chess.WHITE
        loss = mover_loss(white_evals[i], white_evals[i + 1], mover_is_white)
        cls = classify_loss(loss)
        if cls:
            counts[cls] += 1
        probe = pos.copy()
        best_san = None
        if best_ucis[i]:
            try:
                best_san = probe.san(chess.Move.from_uci(best_ucis[i]))  # type: ignore[arg-type]
            except (ValueError, chess.InvalidMoveError):
                best_san = None
        e_before, m_before = _split(white_evals[i])
        e_after, m_after = _split(white_evals[i + 1])
        out.append(
            {
                "ply": i + 1,
                "played_san": pos.san(move),
                "played_uci": move.uci(),
                "best_san": best_san,
                "best_uci": best_ucis[i],
                "pv_sans": pvs[i],
                "eval_before_cp": e_before,
                "mate_before": m_before,
                "eval_after_cp": e_after,
                "mate_after": m_after,
                "cp_loss": loss,
                "classification": cls,
                "is_user_move": user_color in ("white", "black")
                and ((user_color == "white") == mover_is_white),
            }
        )
    return {"moves": out, "counts": counts, "engine_version": version, "depth": depth}


def _evaluate_positions(
    positions: list[chess.Board], depth: int, engine_path: str
) -> tuple[str, list[chess.engine.Score], list[str | None], list[list[str]]]:
    """Evaluate every position with ONE Stockfish process, memory-safely.

    Analyses queue on `analysis_lock` (one game at a time) and hold an engine
    slot (see engine_slots). Between positions, if an interactive caller is
    waiting, the engine is shut down and the slot handed over, then the
    analysis respawns and continues where it left off.
    """
    white_evals: list[chess.engine.Score] = []
    best_ucis: list[str | None] = []
    pvs: list[list[str]] = []
    with analysis_lock:
        slots.acquire(timeout=None)
        engine = None
        try:
            engine = chess.engine.SimpleEngine.popen_uci(engine_path)
            version = str(engine.id.get("name") or "")
            for pos in positions:
                if slots.contended():
                    engine.quit()
                    engine = None
                    slots.yield_to_waiters()
                    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
                info = engine.analyse(pos, chess.engine.Limit(depth=depth))
                white_evals.append(info["score"].pov(chess.WHITE))
                pv = info.get("pv") or []
                best_ucis.append(pv[0].uci() if pv else None)
                pv_sans: list[str] = []
                pv_board = pos.copy()
                for pv_move in pv[:4]:
                    try:
                        pv_sans.append(pv_board.san(pv_move))
                        pv_board.push(pv_move)
                    except (ValueError, chess.InvalidMoveError):
                        break
                pvs.append(pv_sans)
        finally:
            if engine is not None:
                try:
                    engine.quit()
                except chess.engine.EngineError:
                    pass
            slots.release()
    return version, white_evals, best_ucis, pvs
