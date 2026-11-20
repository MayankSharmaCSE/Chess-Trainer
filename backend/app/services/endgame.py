"""Endgame Drills logic: opponent moves, objective detection, hints and grading.

Reuses the existing Stockfish integration (app.services.bot_engine) — no
duplicate engine implementation. When the binary is unavailable every drill
degrades gracefully to its model solution line and a defensive heuristic.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager

import chess
import chess.engine

from app.services import bot_engine
from app.services.endgame_drills import DRILL_BY_ID
logger = logging.getLogger(__name__)

MATE_CP = bot_engine.MATE_CP
MISTAKE_MIN = bot_engine.MISTAKE_MIN
MATE_DELAY_AS_MISTAKE = 120

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}


def get_drill(drill_id: str, db=None) -> dict | None:
    """Curated catalog first, then persisted dynamically generated challenges."""
    d = DRILL_BY_ID.get(drill_id)
    if d is not None:
        return d
    if db is not None and drill_id.startswith("gen-"):
        from app.models.endgame import EndgameGenerated

        row = db.get(EndgameGenerated, drill_id)
        if row is not None:
            return row.config
    return None


def engine_available() -> bool:
    import os

    path = bot_engine.resolve_stockfish_path()
    return bool(path) and os.path.isfile(path)


@contextmanager
def engine_session(skill_level: int = 20):
    """Yield a configured Stockfish UCI session, or None if unavailable."""
    engine = None
    try:
        engine = bot_engine.StockfishUCIProcess()
        engine.configure(skill_level=skill_level)
        yield engine
    except (FileNotFoundError, OSError, TimeoutError, RuntimeError, chess.engine.EngineError) as e:
        logger.warning("Endgame engine unavailable: %s", e)
        yield None
    finally:
        if engine is not None:
            engine.close()


def evaluate_position(fen: str, depth: int = 12) -> dict | None:
    """White-POV evaluation + best move + PV, or None without an engine."""
    with engine_session() as engine:
        if engine is None:
            return None
        try:
            return engine.evaluate_position(fen, depth=depth)
        except (TimeoutError, RuntimeError, chess.engine.EngineError) as e:
            logger.warning("Endgame evaluation failed: %s", e)
            return None


def _script_key(board: chess.Board) -> str:
    parts = board.fen().split()
    return f"{parts[0]} {parts[1]}"


def _model_reply(drill: dict, history_sans: list[str]) -> str | None:
    """Next opponent SAN from the model line if the player is still on it."""
    line = drill["solution_sans"]
    n = len(history_sans)
    if n < len(line) and history_sans == line[:n]:
        nxt = line[n]
        return nxt
    return None


def heuristic_move(board: chess.Board) -> str:
    """Defensive fallback when no engine and no model line applies.

    The defender (always Black in these drills) keeps its king central and
    mobile, pushes a passed pawn when it has one, and keeps a rook safe.
    """
    legal = list(board.legal_moves)
    if not legal:
        raise ValueError("No legal moves.")
    if len(legal) == 1:
        return legal[0].uci()

    side = board.turn
    enemy = not side
    enemy_king = board.king(enemy)

    # Pawn pushes first (promotion > advance), when not forced to defend.
    if not board.is_check():
        pawn_moves = [m for m in legal if board.piece_at(m.from_square).piece_type == chess.PAWN]
        if pawn_moves:
            promos = [m for m in pawn_moves if m.promotion]
            if promos:
                return promos[0].uci()
            pawn_moves.sort(key=lambda m: chess.square_rank(m.to_square), reverse=(side == chess.BLACK))
            return pawn_moves[0].uci()

    def score(m: chess.Move) -> tuple:
        nb = board.copy()
        nb.push(m)
        king = nb.king(side)
        mobility = len(list(nb.legal_moves))
        centrality = 0
        dist = 0
        if king is not None:
            f, r = chess.square_file(king), chess.square_rank(king)
            centrality = -(abs(f - 3.5) + abs(r - 3.5))
            if enemy_king is not None:
                dist = chess.square_distance(king, enemy_king)
        # Keep a rook out of attack if present.
        rook_safe = 0
        for sq, p in nb.piece_map().items():
            if p.color == side and p.piece_type == chess.ROOK:
                rook_safe = 0 if nb.is_attacked_by(enemy, sq) else 2
        return (mobility + rook_safe, centrality, dist)

    best = max(legal, key=score)
    return best.uci()


def opponent_move(board: chess.Board, drill: dict, history_sans: list[str]) -> tuple[str, str]:
    """Return (uci, source) for the defender's reply.

    Priority: drill script -> Stockfish -> model line -> heuristic.
    """
    opp = drill["opponent"]
    key = _script_key(board)
    if opp.get("script") and key in opp["script"]:
        uci = opp["script"][key]
        try:
            if chess.Move.from_uci(uci) in board.legal_moves:
                return uci, "script"
        except ValueError:
            pass

    with engine_session(skill_level=opp.get("skill", 20)) as engine:
        if engine is not None:
            try:
                uci = engine.get_best_move(
                    fen=board.fen(),
                    depth=opp.get("depth", 10),
                    movetime_ms=opp.get("movetime_ms", 350),
                )
                if chess.Move.from_uci(uci) in board.legal_moves:
                    return uci, "engine"
            except (ValueError, TimeoutError, RuntimeError, chess.engine.EngineError) as e:
                logger.warning("Endgame opponent engine failed: %s", e)

    reply = _model_reply(drill, history_sans)
    if reply:
        try:
            mv = board.parse_san(reply)
            if mv in board.legal_moves:
                return mv.uci(), "model"
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            pass

    return heuristic_move(board), "heuristic"


def objective_met(board_after_player: chess.Board, drill: dict, checks_given: int) -> bool:
    """Evaluate a non-terminal objective right after the player's move.

    The caller must check checkmate/stalemate/draws FIRST (a stalemate is a
    failure in win drills, but a SUCCESS in 'defend' drills — handled by the
    route, which also completes defend drills on budget survival).
    """
    obj = drill["objective"]
    t = obj["type"]
    enemy = board_after_player.turn  # side to move is the defender after player's move
    if t == "checkmate":
        return board_after_player.is_checkmate()
    if t == "king_zone":
        ek = board_after_player.king(enemy)
        return ek is not None and chess.square_name(ek) in obj["squares"]
    if t == "mobility":
        return (
            len(list(board_after_player.legal_moves)) <= obj["max"]
            and not board_after_player.is_check()
        )
    if t == "approach":
        wk = board_after_player.king(not enemy)
        ek = board_after_player.king(enemy)
        return wk is not None and ek is not None and chess.square_distance(wk, ek) <= obj["distance"]
    if t == "checks":
        return checks_given >= obj["count"]
    # promote / win_material are detected by the caller from the move itself.
    return False


def mover_loss(before: tuple, after: tuple, player_is_white: bool) -> int:
    """Centipawn loss from the player's POV; mates collapse to +/-MATE_CP."""

    def value(ev: tuple) -> int:
        cp, mate = ev
        if mate is not None:
            if mate == 0:
                white_wins = True  # MateGiven on the board
            else:
                white_wins = mate > 0
            return MATE_CP if white_wins == player_is_white else -MATE_CP
        cp = cp or 0
        return cp if player_is_white else -cp

    b_cp, b_mate = before
    a_cp, a_mate = after
    if b_mate is not None and a_mate is not None and b_mate != 0 and a_mate != 0:
        if (b_mate > 0) == player_is_white and (a_mate > 0) == player_is_white:
            if abs(a_mate) > abs(b_mate):
                return MATE_DELAY_AS_MISTAKE
    return value(before) - value(after)


def compute_stars(player_moves: int, star_moves: list[int], hints_used: int, mistakes: int, revealed: bool) -> int:
    three, two = star_moves
    if player_moves <= three and hints_used == 0 and mistakes == 0 and not revealed:
        return 3
    if player_moves <= two and hints_used <= 2 and not revealed:
        return 2
    return 1


def compute_accuracy(mistakes: int, hints_used: int, revealed: bool) -> float:
    acc = 100 - 8 * mistakes - 6 * hints_used - (25 if revealed else 0)
    return round(max(5.0, min(100.0, acc)), 1)


def captured_and_material(start_fen: str, board: chess.Board, player_color: str) -> tuple[list[str], list[str], int]:
    """Captured pieces relative to the drill's START position + material edge."""
    start = chess.Board(start_fen)
    start_counts: dict[str, int] = {}
    for p in start.piece_map().values():
        start_counts[p.symbol()] = start_counts.get(p.symbol(), 0) + 1
    cur_counts: dict[str, int] = {}
    white_mat = black_mat = 0
    for p in board.piece_map().values():
        cur_counts[p.symbol()] = cur_counts.get(p.symbol(), 0) + 1
        v = PIECE_VALUES.get(p.piece_type, 0)
        if p.color == chess.WHITE:
            white_mat += v
        else:
            black_mat += v
    captured_white: list[str] = []
    captured_black: list[str] = []
    for sym, n in start_counts.items():
        missing = n - cur_counts.get(sym, 0)
        if missing > 0:
            if sym.isupper():
                captured_white.extend([sym] * missing)
            else:
                captured_black.extend([sym] * missing)
    advantage = (white_mat - black_mat) if player_color == "white" else (black_mat - white_mat)
    return captured_white, captured_black, advantage


def pv_to_sans(fen: str, pv_ucis: list[str], limit: int = 8) -> list[str]:
    board = chess.Board(fen)
    sans: list[str] = []
    for u in pv_ucis[:limit]:
        try:
            mv = chess.Move.from_uci(u)
            if mv not in board.legal_moves:
                break
            sans.append(board.san(mv))
            board.push(mv)
        except (ValueError, chess.IllegalMoveError):
            break
    return sans


# ---------------------------------------------------------------------------
# Verified, objective-aware solution builder (Show Solution)
# ---------------------------------------------------------------------------


def _record_move(board: chess.Board, mv: chess.Move) -> dict:
    """SAN + metadata for a move, computed on the live temporary board."""
    mover = board.turn
    san = board.san(mv)
    is_capture = board.is_capture(mv)
    promo = chess.piece_symbol(mv.promotion) if mv.promotion else None
    board.push(mv)
    return {
        "san": san,
        "uci": mv.uci(),
        "from_square": chess.square_name(mv.from_square),
        "to_square": chess.square_name(mv.to_square),
        "color": "white" if mover == chess.WHITE else "black",
        "fen_after": board.fen(),
        "is_capture": is_capture,
        "is_check": board.is_check(),
        "is_mate": board.is_checkmate(),
        "promotion": promo,
    }


def _line_from_ucis(fen: str, ucis: list[str], limit: int) -> tuple[list[dict], str | None, str | None]:
    """Sequentially validate UCI moves on a temporary board.

    Returns (moves, bad_uci, bad_fen). Stops BEFORE any illegal move — an
    illegal move is never recorded or displayed.
    """
    board = chess.Board(fen)
    moves: list[dict] = []
    for u in ucis[:limit]:
        try:
            mv = chess.Move.from_uci(u)
        except ValueError:
            return moves, u, board.fen()
        if mv not in board.legal_moves:
            return moves, u, board.fen()
        moves.append(_record_move(board, mv))
    return moves, None, None


def _line_from_sans(fen: str, sans: list[str], limit: int) -> tuple[list[dict], str | None, str | None]:
    board = chess.Board(fen)
    moves: list[dict] = []
    for san in sans[:limit]:
        try:
            mv = board.parse_san(san)
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            return moves, san, board.fen()
        if mv not in board.legal_moves:
            return moves, san, board.fen()
        moves.append(_record_move(board, mv))
    return moves, None, None


def _solution_reaches_objective(fen: str, moves: list[dict], drill: dict) -> bool:
    """Replay a validated line and detect the objective exactly as the move
    route does (terminal states first, evaluated right after each player move)."""
    board = chess.Board(fen)
    player = chess.WHITE if drill["player_color"] == "white" else chess.BLACK
    obj = drill["objective"]
    checks = 0
    player_moves = 0
    for m in moves:
        mv = chess.Move.from_uci(m["uci"])
        mover = board.turn
        board.push(mv)
        if mover != player:
            continue
        player_moves += 1
        if board.is_check():
            checks += 1
        if board.is_checkmate():
            return True
        if board.is_stalemate() or board.is_insufficient_material() \
                or board.can_claim_threefold_repetition() or board.can_claim_fifty_moves():
            if obj["type"] == "defend":
                return True
            continue
        if obj["type"] == "promote" and mv.promotion:
            required = obj.get("piece")
            if required is None or chess.piece_symbol(mv.promotion) == required:
                return True
        elif obj["type"] == "win_material":
            if not any(p.piece_type == obj["piece_type"] for p in board.piece_map().values() if p.color != player):
                return True
        elif obj["type"] == "defend":
            if player_moves >= drill["max_moves"]:
                return True
        elif objective_met(board, drill, checks):
            return True
    return False


def build_solution(fen: str, drill: dict, history_sans: list[str]) -> dict:
    """Build a verified, objective-aware solution from the EXACT current FEN.

    Priority:
      * checkmate drills: a fully replay-verified engine mating line; else the
        curated model continuation when the player is still on that path.
      * other drills: the model continuation when on-path (it teaches the
        intended technique), else the engine's best continuation.
    Every move is validated sequentially with python-chess (UCI -> legal check
    -> push -> SAN). An invalid engine PV is logged and re-analyzed once; the
    line is truncated before any illegal move. Nothing unverified is returned.
    """
    obj_type = drill["objective"]["type"]
    is_mate = obj_type == "checkmate"
    out = {
        "start_fen": fen,
        "moves": [],
        "final_fen": fen,
        "objective_achieved": False,
        "source": "none",
        "error": None,
    }

    # 1) Model continuation — only when the played history is a strict prefix
    #    of the model line, so it starts exactly from the current position.
    model_moves: list[dict] = []
    line = drill.get("solution_sans") or []
    n = len(history_sans)
    if line and n < len(line) and history_sans == line[:n]:
        mm, bad, bad_fen = _line_from_sans(fen, line[n:], limit=60)
        if bad is not None:
            logger.warning("Model continuation invalid at %s (fen=%s); discarding", bad, bad_fen)
        else:
            model_moves = mm

    # 2) Fresh, isolated engine analysis of the current position.
    depth = 18 if is_mate else 16
    engine_moves: list[dict] = []
    ev = evaluate_position(fen, depth=depth)
    for attempt in range(2):
        if not ev or not ev.get("pv_ucis"):
            break
        mate_seen = ev.get("mate_moves")
        limit = 60 if (is_mate and mate_seen is not None and mate_seen > 0) else 12
        em, bad, bad_fen = _line_from_ucis(fen, ev["pv_ucis"], limit=limit)
        if bad is None:
            engine_moves = em
            break
        logger.warning("Solution PV illegal: uci=%s fen=%s (attempt %d) — requesting fresh analysis", bad, bad_fen, attempt + 1)
        ev = evaluate_position(fen, depth=depth)

    # 3) Objective-aware selection.
    model_mate = bool(model_moves) and model_moves[-1]["is_mate"]
    engine_mate = bool(engine_moves) and engine_moves[-1]["is_mate"]
    chosen: list[dict] = []
    source = "none"
    if is_mate:
        if engine_mate:
            chosen, source = engine_moves, "engine"
        elif model_mate:
            chosen, source = model_moves, "model"
        elif engine_moves:
            chosen, source = engine_moves, "engine"
        elif model_moves:
            chosen, source = model_moves, "model"
    else:
        if model_moves:
            chosen, source = model_moves, "model"
        elif engine_moves:
            chosen, source = engine_moves, "engine"

    if not chosen:
        out["error"] = (
            "No verified solution is available from this position right now "
            "(engine offline or no clean continuation found). Try Reset, or request a hint."
        )
        return out

    out["moves"] = chosen
    out["final_fen"] = chosen[-1]["fen_after"]
    out["source"] = source
    out["objective_achieved"] = _solution_reaches_objective(fen, chosen, drill)
    return out


def best_move_hint(fen: str, drill: dict, history_sans: list[str], depth: int = 14) -> dict | None:
    """Level-3 hint: engine best move (SAN + squares), or model-line fallback."""
    ev = evaluate_position(fen, depth=depth)
    if ev and ev.get("best_uci"):
        try:
            board = chess.Board(fen)
            mv = chess.Move.from_uci(ev["best_uci"])
            if mv in board.legal_moves:
                return {
                    "best_uci": ev["best_uci"],
                    "best_san": board.san(mv),
                    "from": chess.square_name(mv.from_square),
                    "to": chess.square_name(mv.to_square),
                    "source": "engine",
                }
        except (ValueError, chess.IllegalMoveError):
            pass
    # Fallback: next player move from the model line.
    line = drill["solution_sans"]
    n = len(history_sans)
    if n < len(line) and history_sans == line[:n]:
        try:
            board = chess.Board(fen)
            mv = board.parse_san(line[n])
            if mv in board.legal_moves:
                return {
                    "best_uci": mv.uci(),
                    "best_san": line[n],
                    "from": chess.square_name(mv.from_square),
                    "to": chess.square_name(mv.to_square),
                    "source": "model",
                }
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            pass
    return None