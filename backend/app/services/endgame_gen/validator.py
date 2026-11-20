"""PositionValidator + SolutionValidator.

Every generated candidate passes cheap structural checks (python-chess) before
any engine work, then a scenario-appropriate solution verification that reuses
the existing Stockfish integration (app.services.endgame / bot_engine).
Invalid or unverified candidates are discarded by the orchestrator.
"""

from __future__ import annotations

import chess

from app.services import endgame

# Piece signatures per category (player is always White in these drills).
_SIGNATURES = {
    "rook": {chess.KING: 1, chess.ROOK: 1},
    "knights": {chess.KING: 1, chess.KNIGHT: 2},
    "bishop-knight": {chess.KING: 1, chess.BISHOP: 1, chess.KNIGHT: 1},
    "pawn": {chess.KING: 1},  # pawns validated separately (>=1)
}


def structural_ok(board: chess.Board, category: str, objective: dict, material: dict | None = None) -> tuple[bool, str]:
    """Cheap legality + category + non-triviality checks. No engine.

    When `material` is provided ({"white": {piece_type: count}, "black": {...}})
    the exact piece counts are validated against it (new taxonomy generators);
    otherwise the legacy per-category signatures apply.
    """
    if not board.is_valid() or board.status() != chess.STATUS_VALID:
        return False, "invalid placement"
    if board.turn != chess.WHITE:
        return False, "wrong side to move"
    if board.is_game_over():
        return False, "already terminal"
    wk, bk = board.king(chess.WHITE), board.king(chess.BLACK)
    if wk is None or bk is None:
        return False, "missing king"
    if chess.square_distance(wk, bk) < 2:
        return False, "adjacent kings"
    if board.is_check():
        return False, "defender already in check at start"
    if not list(board.legal_moves):
        return False, "no legal move"
    if board.is_insufficient_material():
        return False, "insufficient material"

    white = [p for p in board.piece_map().values() if p.color == chess.WHITE]
    black = [p for p in board.piece_map().values() if p.color == chess.BLACK]

    if material is not None:
        for side, pieces in (("white", white), ("black", black)):
            expected = material.get(side, {})
            for pt in {p.piece_type for p in pieces} | set(expected):
                actual = sum(1 for p in pieces if p.piece_type == pt)
                if actual != expected.get(pt, 0):
                    return False, "wrong material"
    else:
        # Legacy category piece signature.
        sig = _SIGNATURES.get(category, {})
        for pt, n in sig.items():
            if sum(1 for p in white if p.piece_type == pt) != n:
                return False, "wrong white material"
        if category == "pawn":
            if not any(p.piece_type == chess.PAWN for p in white):
                return False, "no white pawn"
            if any(p.piece_type in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT) for p in white):
                return False, "unexpected white piece"
        else:
            if any(p.piece_type == chess.PAWN for p in white):
                return False, "unexpected white pawn"
        if any(p.piece_type == chess.KING for p in black) is False:
            return False, "no black king"
        if sum(1 for p in black if p.piece_type == chess.KING) != 1:
            return False, "black king count"
        allowed_black_extra = {
            "rook": (),
            "knights": (chess.PAWN,),
            "bishop-knight": (),
            "pawn": (chess.PAWN, chess.ROOK),
        }[category]
        for p in black:
            if p.piece_type != chess.KING and p.piece_type not in allowed_black_extra:
                return False, "unexpected black piece"

    # Attacking pieces must not be hanging to the enemy king at start.
    for sq, p in board.piece_map().items():
        if p.color == chess.WHITE and p.piece_type in (chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.QUEEN):
            if board.is_attacked_by(chess.BLACK, sq):
                return False, "attacking piece hanging"

    # Objective must not already be satisfied at the start.
    t = objective.get("type")
    if t == "king_zone":
        if chess.square_name(bk) in objective["squares"]:
            return False, "objective already met"
    elif t == "mobility":
        bb = board.copy()
        bb.turn = chess.BLACK
        if len(list(bb.legal_moves)) <= objective["max"] and not bb.is_check():
            return False, "objective already met"
    elif t == "approach":
        if chess.square_distance(wk, bk) <= objective["distance"]:
            return False, "objective already met"
    elif t == "checkmate":
        if board.is_checkmate():
            return False, "already mate"
    return True, "ok"


def _pv_sans(fen: str, pv_ucis: list[str], limit: int = 12) -> list[str]:
    return endgame.pv_to_sans(fen, pv_ucis, limit=limit)


def verify_short_mate(fen: str, max_mate: int, depth: int = 12) -> list[str] | None:
    """Engine must report a forced mate in <= max_mate; replay PV to confirm mate."""
    ev = endgame.evaluate_position(fen, depth=depth)
    if not ev:
        return None
    mate = ev.get("mate_moves")
    if mate is None or mate <= 0 or mate > max_mate:
        return None
    sans = _pv_sans(fen, ev.get("pv_ucis", []), limit=2 * max_mate + 4)
    board = chess.Board(fen)
    for san in sans:
        try:
            board.push(board.parse_san(san))
        except (ValueError, chess.IllegalMoveError):
            return None
    if not board.is_checkmate():
        return None
    return sans


def verify_winning(fen: str, depth: int = 12, min_cp: int = 120) -> bool:
    """Player (White, to move) must be clearly winning / not a theoretical draw."""
    ev = endgame.evaluate_position(fen, depth=depth)
    if not ev:
        # No engine: fall back to structural theory for KR / KBN (always win).
        return True
    mate = ev.get("mate_moves")
    if mate is not None:
        return mate > 0
    cp = ev.get("score_cp")
    return cp is not None and cp >= min_cp


def verify_drawish(fen: str, max_cp: int = 80, depth: int = 14) -> bool:
    """Defend drills: the position must be a theoretical draw (engine-balanced).

    Rejects positions where the attacker has a forced mate or a decisive edge.
    Without an engine, constructive defence templates are accepted (their draw
    status is established theory: Philidor, rook-pawn corner, opposition).
    """
    ev = endgame.evaluate_position(fen, depth=depth)
    if not ev:
        return True
    mate = ev.get("mate_moves")
    if mate is not None:
        return mate >= 0  # defender mating the attacker is fine; being mated is not
    cp = ev.get("score_cp")
    return cp is not None and abs(cp) <= max_cp


def _greedy_sim(fen: str, objective: dict, budget: int, metric) -> bool:
    """Fast python-chess sim: greedy player vs the defensive heuristic opponent."""
    board = chess.Board(fen)
    checks = 0
    for _ in range(budget):
        legal = list(board.legal_moves)
        if not legal:
            return False
        best = None
        best_score = None
        for mv in legal:
            nb = board.copy()
            nb.push(mv)
            if nb.is_checkmate():
                return True
            sc = metric(nb)
            if best_score is None or sc < best_score:
                best_score, best = sc, mv
        board.push(best)
        if board.is_check():
            checks += 1
        if endgame.objective_met(board, {"objective": objective}, checks):
            return True
        if board.is_game_over():
            return False
        # heuristic defender
        try:
            opp = chess.Move.from_uci(endgame.heuristic_move(board))
            board.push(opp)
        except ValueError:
            return False
        if board.is_game_over():
            return False
    return False


def _zone_metric(targets):
    def m(b):
        bk = b.king(b.turn)
        wk = b.king(not b.turn)
        z = min(chess.square_distance(bk, chess.parse_square(s)) for s in targets)
        return z * 10 + chess.square_distance(wk, bk)
    return m


def _mobility_metric(b):
    return len(list(b.legal_moves)) if not b.is_check() else 100


def _approach_metric(b):
    return chess.square_distance(b.king(chess.WHITE), b.king(chess.BLACK))


def _checks_metric(b):
    return 0 if b.is_check() else 1


def verify_objective_reachable(fen: str, objective: dict, budget: int) -> bool:
    t = objective["type"]
    if t == "king_zone":
        return _greedy_sim(fen, objective, budget, _zone_metric(objective["squares"]))
    if t == "mobility":
        return _greedy_sim(fen, objective, budget, _mobility_metric)
    if t == "approach":
        return _greedy_sim(fen, objective, budget, _approach_metric)
    if t == "checks":
        return _greedy_sim(fen, objective, budget, _checks_metric)
    return True


def _pawn_push_metric(b):
    pawns = [s for s, p in b.piece_map().items() if p.color == chess.WHITE and p.piece_type == chess.PAWN]
    if not pawns:
        return 99
    return min(7 - chess.square_rank(s) for s in pawns)


def verify_promotion_reachable(fen: str, budget: int) -> bool:
    board = chess.Board(fen)
    for _ in range(budget):
        legal = list(board.legal_moves)
        promos = [m for m in legal if m.promotion]
        if promos:
            return True
        if not legal:
            return False
        best = min(legal, key=lambda m: _pawn_push_metric(_pushed(board, m)))
        board.push(best)
        if board.is_game_over():
            return False
        try:
            board.push(chess.Move.from_uci(endgame.heuristic_move(board)))
        except ValueError:
            return False
        if board.is_game_over():
            return False
    return False


def _pushed(board: chess.Board, mv: chess.Move) -> chess.Board:
    nb = board.copy()
    nb.push(mv)
    return nb


def verify_fork_wins_rook(fen: str) -> bool:
    """Underpromotion fork: after N-promotion with check, every reply allows NxR."""
    board = chess.Board(fen)
    promo = [m for m in board.legal_moves if m.promotion == chess.KNIGHT]
    if not promo:
        return False
    for mv in promo:
        nb = board.copy()
        nb.push(mv)
        if not nb.is_check():
            continue
        ok = True
        for reply in list(nb.legal_moves):
            rb = nb.copy()
            rb.push(reply)
            knight_sq = mv.to_square
            rook_sq = next((s for s, p in rb.piece_map().items()
                            if p.color == chess.BLACK and p.piece_type == chess.ROOK), None)
            if rook_sq is None:
                continue
            cap = chess.Move(knight_sq, rook_sq)
            if cap not in rb.legal_moves or not rb.is_capture(cap):
                ok = False
                break
        if ok:
            return True
    return False