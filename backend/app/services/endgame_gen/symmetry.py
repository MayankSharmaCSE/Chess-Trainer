"""Board-symmetry randomization of verified seed positions.

The eight dihedral transforms of the board map a legal, verified position to
another legal position with an equally verified solution (chess rules are
symmetric). This yields genuinely different king/rook/bishop/knight/pawn
squares, edges and mating corners while guaranteeing solvability — no blind
random piece placement.
"""

from __future__ import annotations

import chess

from app.services.endgame_drills import DRILL_BY_ID

# (file, rank) -> (file, rank) for the 8 symmetries of the square.
_MAPS = [
    lambda f, r: (f, r),
    lambda f, r: (7 - f, r),
    lambda f, r: (f, 7 - r),
    lambda f, r: (7 - f, 7 - r),
    lambda f, r: (r, f),
    lambda f, r: (7 - r, f),
    lambda f, r: (r, 7 - f),
    lambda f, r: (7 - r, 7 - f),
]

# Curated seeds whose full solution is verified; used for long-mate scenarios.
MATE_SEEDS = {
    "rook": ["rook-4", "rook-5"],
    "knights": ["knight-1", "knight-4", "knight-5"],
    "bishop-knight": ["bishop-knight-5"],
    "pawn": ["pawn-5"],
}


def transform_square(sq: int, k: int) -> int:
    f, r = chess.square_file(sq), chess.square_rank(sq)
    nf, nr = _MAPS[k % 8](f, r)
    return chess.square(nf, nr)


def transform_board(board: chess.Board, k: int) -> chess.Board:
    out = chess.Board(None)
    for sq, piece in board.piece_map().items():
        out.set_piece_at(transform_square(sq, k), piece)
    out.turn = board.turn
    out.castling_rights = 0
    return out


def transform_uci(uci: str, k: int) -> str:
    frm = chess.parse_square(uci[0:2])
    to = chess.parse_square(uci[2:4])
    promo = uci[4:5]
    return chess.square_name(transform_square(frm, k)) + chess.square_name(transform_square(to, k)) + promo


def seed_solution_ucis(seed: dict) -> list[str]:
    board = chess.Board(seed["fen"])
    ucis = []
    for san in seed["solution_sans"]:
        mv = board.parse_san(san)
        ucis.append(mv.uci())
        board.push(mv)
    return ucis


def transform_seed(seed_id: str, k: int) -> dict | None:
    """Return {fen, solution_sans, mate_verified} for a symmetry of a seed."""
    seed = DRILL_BY_ID.get(seed_id)
    if not seed or not seed.get("model_complete"):
        return None
    src = chess.Board(seed["fen"])
    dst = transform_board(src, k)
    if not dst.is_valid() or dst.is_game_over():
        return None
    ucis = [transform_uci(u, k) for u in seed_solution_ucis(seed)]
    board = dst.copy()
    sans = []
    for u in ucis:
        try:
            mv = chess.Move.from_uci(u)
            if mv not in board.legal_moves:
                return None
            sans.append(board.san(mv))
            board.push(mv)
        except (ValueError, chess.IllegalMoveError):
            return None
    if not board.is_checkmate():
        return None
    return {"fen": dst.fen(), "solution_sans": sans, "mate_verified": True}