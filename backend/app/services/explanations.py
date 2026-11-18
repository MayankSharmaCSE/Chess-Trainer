"""US-008: grounded rule-based move explanations (no LLM / no API key needed).

Every sentence must cite Stockfish evidence already stored in MoveAnalysis:
played move, eval swing, best move + PV. Nothing is invented: if the engine
found no flag, the explanation says the move kept the evaluation.

python-chess replays the PGN to ground the move number, side to move, and the
FEN before/after — the explanation references those facts only.
"""

import chess
import chess.pgn

from app.models.analysis import MoveAnalysis
from app.models.game import Game


def _fmt_cp(cp: int | None, mate: int | None) -> str:
    if mate == 0:
        return "checkmate"  # mate already on the board (sign carries no meaning)
    if mate is not None:
        sign = "+" if mate > 0 else "-"
        return f"{sign}M{abs(mate)}"
    if cp is None:
        return "unknown"
    sign = "+" if cp > 0 else ""
    return f"{sign}{cp / 100:.1f}"


def _side(ply: int) -> str:
    return "White" if ply % 2 == 1 else "Black"


def _move_no(ply: int) -> int:
    return (ply + 1) // 2


def ground_position(pgn: str, ply: int) -> tuple[str, str] | None:
    """Return (fen_before, fen_after) for a 1-based ply, or None if unparseable."""
    try:
        game = chess.pgn.read_game(__import__("io").StringIO(pgn))
        if game is None:
            return None
        board = game.board()
        moves = list(game.mainline_moves())
        if ply < 1 or ply > len(moves):
            return None
        for m in moves[: ply - 1]:
            board.push(m)
        before = board.fen()
        board.push(moves[ply - 1])
        return before, board.fen()
    except (ValueError, IndexError):
        return None


def _header(move: MoveAnalysis) -> str:
    before = _fmt_cp(move.eval_before_cp, move.mate_before)
    after = _fmt_cp(move.eval_after_cp, move.mate_after)
    return (
        f"Move {_move_no(move.ply)} ({_side(move.ply)}): {move.played_san} — "
        f"evaluation {before} → {after}"
    )


def _mate_for(mate: int | None, white: bool) -> bool:
    """True if `mate` (White-POV, moves) is a forced mate in favour of `white`'s side."""
    return mate is not None and mate != 0 and (mate > 0) == white


def _severity(move: MoveAnalysis, cls: str) -> str:
    kind = {"BLUNDER": "a blunder", "MISTAKE": "a mistake"}.get(cls, "an inaccuracy")
    mover_white = move.ply % 2 == 1
    had_mate = _mate_for(move.mate_before, mover_white)
    keeps_mate = _mate_for(move.mate_after, mover_white)
    if had_mate and keeps_mate:
        return f"{kind}: the forced mate is still there, but it now takes longer"
    if had_mate:
        return f"{kind}: it lets a forced mate slip away"
    if _mate_for(move.mate_after, not mover_white):
        return f"{kind}: it allows the opponent a forced mate"
    verb = "slips" if kind == "an inaccuracy" else "drops"
    return f"{kind}: it {verb} about {move.cp_loss / 100:.1f} pawns of evaluation"


def mistake_line(move: MoveAnalysis) -> str:
    """First sentence of explain_move: played move, eval swing, severity.

    Never mentions the best move or PV, so it is safe as a spoiler-free
    drill hint (US-009 rules-v1 coaching fallback).
    """
    cls = (move.classification or "").upper()
    if not cls:
        return f"{_header(move)}."
    return f"{_header(move)}: {_severity(move, cls)}."


def explain_move(game: Game, move: MoveAnalysis) -> str:
    cls = (move.classification or "").upper() or None
    side = _side(move.ply)
    header = _header(move)
    pv = " ".join(move.pv_sans or [])

    if cls is None:
        tail = "kept the evaluation steady: no blunder, mistake, or inaccuracy was flagged."
        if move.best_san and move.best_san != move.played_san:
            tail += f" Stockfish preferred {move.best_san} here, but the difference was below the flag threshold."
        else:
            tail += " It matches (or is within tolerance of) Stockfish's best move."
        return f"{header}. {side} {tail}"

    parts = [mistake_line(move)]
    if move.best_san:
        best_bit = f"Instead, {move.best_san} held the balance"
        if pv and len((move.pv_sans or [])) > 1:
            best_bit += f" (idea: {pv})"
        best_bit += "."
        parts.append(best_bit)
    else:
        parts.append("Stockfish found no single best move to recommend here.")
    if move.mate_before is not None or move.mate_after is not None:
        parts.append("Note: a forced mate was on the board, so small move-order details mattered a lot.")
    return " ".join(parts)
