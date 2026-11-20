"""Generators for the Chess.com-style Endgames taxonomy (34 subcategories).

Every candidate is built around a legitimate endgame scenario:
  * constructive templates for known theory (opposition, rook-pawn defence,
    Lucena, Philidor, breakthroughs, edge mating nets),
  * controlled random piece placement for material-imbalance endings,
  * symmetry orbits of verified curated seeds for long techniques.

Candidates carry a `_verify` tag; the orchestrator runs PositionValidator then
SolutionValidator (Stockfish) and discards anything unverified. Win drills must
be engine-winning; defend drills must be engine-drawish; mate drills must have
a replay-verified forced mate. No blind random positions ever reach the user.
"""

from __future__ import annotations

import random

import chess

from app.services.endgame_drills import EDGE_SQUARES
from app.services.endgame_gen import difficulty as dm
from app.services.endgame_gen import symmetry
from app.services.endgame_gen.generators import GENERATORS, H3
from app.services.endgame_gen.taxonomy import SUBCATEGORY_BY_ID

K, Q, R, B, N, P = chess.KING, chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT, chess.PAWN


def _sq(f: int, r: int) -> int:
    return chess.square(f, r)


def _rand_sq(rng, files=range(8), ranks=range(8)) -> int:
    return _sq(rng.choice(list(files)), rng.choice(list(ranks)))


def _free_sq(rng, occupied, files=range(8), ranks=range(8), near=None, radius=3):
    if near is not None:
        pool = [s for s in chess.SQUARES
                if s not in occupied and chess.square_distance(s, near) <= radius]
        if pool:
            return rng.choice(pool)
    for _ in range(60):
        s = _rand_sq(rng, files, ranks)
        if s not in occupied:
            return s
    return None


def _material_of(board: chess.Board) -> dict:
    mat = {"white": {}, "black": {}}
    for pc in board.piece_map().values():
        side = "white" if pc.color == chess.WHITE else "black"
        mat[side][pc.piece_type] = mat[side].get(pc.piece_type, 0) + 1
    return mat


def random_ending(rng, white: list[int], black: list[int], *, close_kings=False,
                  pawn_ranks=range(1, 7), tries=50) -> chess.Board | None:
    """Random LEGAL placement of the given material (kings added implicitly).

    Rejects: adjacent kings, either king in check, terminal states, player
    pieces hanging to the enemy king, and a locked defender. Pawns never land
    on the back rank. Engine verification downstream decides win/draw.
    """
    for _ in range(tries):
        wk, bk = _rand_sq(rng), _rand_sq(rng)
        d = chess.square_distance(wk, bk)
        if d < 2 or (close_kings and d > 3):
            continue
        b = chess.Board(None)
        b.set_piece_at(wk, chess.Piece(K, chess.WHITE))
        b.set_piece_at(bk, chess.Piece(K, chess.BLACK))
        occupied = {wk, bk}
        ok = True
        for color, pieces in ((chess.WHITE, white), (chess.BLACK, black)):
            for pt in pieces:
                s = _free_sq(rng, occupied, ranks=pawn_ranks if pt == P else range(8))
                if s is None:
                    ok = False
                    break
                b.set_piece_at(s, chess.Piece(pt, color))
                occupied.add(s)
            if not ok:
                break
        if not ok:
            continue
        b.turn = chess.WHITE
        if not b.is_valid() or b.is_game_over():
            continue
        if any(b.is_attacked_by(chess.BLACK, s) for s, p in b.piece_map().items()
               if p.color == chess.WHITE and p.piece_type != K):
            continue
        bb = b.copy()
        bb.turn = chess.BLACK
        if not list(bb.legal_moves):
            continue
        return b
    return None


def edge_mate_net(rng, pieces: list[int], tries=40) -> chess.Board | None:
    """Construct a near-mate: lone king on the edge, attacker king close,
    attacking pieces nearby. Engine verifies the forced short mate."""
    for _ in range(tries):
        bk = chess.parse_square(rng.choice(EDGE_SQUARES))
        wk = None
        for _ in range(30):
            s = _rand_sq(rng)
            if s != bk and 2 <= chess.square_distance(s, bk) <= 3:
                wk = s
                break
        if wk is None:
            continue
        b = chess.Board(None)
        b.set_piece_at(bk, chess.Piece(K, chess.BLACK))
        b.set_piece_at(wk, chess.Piece(K, chess.WHITE))
        occupied = {bk, wk}
        ok = True
        for pt in pieces:
            s = _free_sq(rng, occupied, near=bk, radius=3)
            if s is None:
                ok = False
                break
            b.set_piece_at(s, chess.Piece(pt, chess.WHITE))
            occupied.add(s)
        if not ok:
            continue
        b.turn = chess.WHITE
        if not b.is_valid() or b.is_game_over() or b.is_checkmate():
            continue
        return b
    return None


_DEFAULT_HINTS = {
    "checkmate": ["Shrink the enemy king's space step by step.",
                  "Coordinate your pieces with king support — cover every flight square.", H3],
    "promote": ["Improve your worst piece and keep the initiative.",
                "Escort the pawn: control the promotion square before pushing.", H3],
    "win_material": ["Look for forcing moves: checks, forks and skewers.",
                     "Attack the target piece while keeping your king safe.", H3],
    "defend": ["Identify the opponent's threat before every move.",
               "Keep your pieces coordinated — seek the drawing resource (opposition, stalemate, perpetual).", H3],
}


def mk(sub: str, diff: str, title: str, tagline: str, board: chess.Board,
       objective: dict, label: str, ins: list[str], tips: list[str],
       base_max: int, three: int, two: int, est: int, verify: tuple,
       solution=None, strict=False, hints=None) -> dict:
    p = dm.profile(diff)
    defend = objective["type"] == "defend"
    budget = dm.budget(base_max, diff)
    obj_type = objective["type"]
    bk = board.king(chess.BLACK)
    tag = chess.square_name(bk) if bk is not None else ""
    return {
        "id": "",
        "category": SUBCATEGORY_BY_ID[sub]["category"],
        "subcategory": sub,
        "level": 0,
        "title": f"{title} · {tag}",
        "tagline": tagline,
        "difficulty": diff,
        "fen": board.fen(),
        "player_color": "white",
        "objective": objective,
        "objective_label": label,
        "max_moves": budget,
        "star_moves": [budget, budget] if defend else dm.star_moves(three, two, diff),
        "est_minutes": est,
        "instructions": ins,
        "tips": tips,
        "hints": hints or _DEFAULT_HINTS.get(obj_type, _DEFAULT_HINTS["promote"]),
        "solution_sans": solution or [],
        "model_complete": bool(solution),
        "strict": strict,
        "generated": True,
        "hint_max": p["hint_max"],
        "opponent": {"mode": "engine",
                     "depth": max(p["opponent_depth"], 12) if defend else p["opponent_depth"],
                     "skill": 20 if defend else p["opponent_skill"],
                     "movetime_ms": 300, "script": {}},
        "_verify": verify,
        "_material": _material_of(board),
    }


def _retag(cand: dict | None, sub: str) -> dict | None:
    """Reuse a legacy generator candidate inside the new taxonomy."""
    if cand is None:
        return None
    cand["category"] = SUBCATEGORY_BY_ID[sub]["category"]
    cand["subcategory"] = sub
    cand["_material"] = _material_of(chess.Board(cand["fen"]))
    return cand


def _pawn_of(board: chess.Board, color: int) -> int | None:
    for s, p in board.piece_map().items():
        if p.color == color and p.piece_type == P:
            return s
    return None


# ---------------------------------------------------------------------------
# CHECKMATES
# ---------------------------------------------------------------------------


def gen_cm_two_rooks(rng, diff):
    p = dm.profile(diff)
    b = edge_mate_net(rng, [R, R])
    if b is not None:
        yield mk("cm-two-rooks", diff, "Two Rooks Mate Net", "The king is on the edge — roll the ladder.",
                 b, {"type": "checkmate"}, "Deliver checkmate with the two rooks.",
                 ["The rooks cut adjacent ranks/files — the ladder mate.",
                  "Check with one rook; the other covers the escape rank.",
                  "Your king supports; never stalemate."],
                 ["Ladder mate: rook checks, rook covers, repeat until the edge.",
                  "Keep one rook behind the king at all times."],
                 6, 2, 4, 2, ("mate", p["mate_cap"] + 1, 14))
    b = random_ending(rng, [R, R], [], close_kings=p["close_kings"])
    if b is not None:
        yield mk("cm-two-rooks", diff, "Full Two Rooks Mate", "Box, drive and mate with the rook pair.",
                 b, {"type": "checkmate"}, "Deliver checkmate with two rooks and king.",
                 ["Cut the king off with one rook.", "Advance the other rook rank by rank.",
                  "Bring your king up and finish on the edge."],
                 ["The ladder technique mates from any legal position.",
                  "Do not let the king slip past your cutting rook."],
                 18, 12, 18, 4, ("mate", 18, 22))


def _queen_mate(rng, diff, sub):
    p = dm.profile(diff)
    b = edge_mate_net(rng, [Q])
    if b is not None:
        yield mk(sub, diff, "Queen Mate Net", "The king is boxed — find the finishing check.",
                 b, {"type": "checkmate"}, "Deliver checkmate with queen and king.",
                 ["The queen already restricts the king.", "Bring your king closer if needed.",
                  "Deliver the mating check — beware stalemate!"],
                 ["Queen + king mate: the king covers the flight squares the queen cannot.",
                  "A quiet queen move can stalemate — always leave a square until the mate."],
                 6, 2, 4, 2, ("mate", p["mate_cap"] + 1, 14))
    b = random_ending(rng, [Q], [], close_kings=p["close_kings"])
    if b is not None:
        yield mk(sub, diff, "Full Queen Mate", "The complete king + queen technique.",
                 b, {"type": "checkmate"}, "Deliver checkmate with queen and king.",
                 ["Shrink the box with the queen (knight-distance pattern).",
                  "March your king up to support.", "Mate on the edge; avoid stalemate."],
                 ["The queen alone cages the king; the king delivers the final blow.",
                  "Never stalemate a king in the corner."],
                 14, 9, 14, 3, ("mate", 12, 20))


def gen_cm_queen(rng, diff):
    yield from _queen_mate(rng, diff, "cm-queen")


def gen_cm_rook(rng, diff):
    for cand in GENERATORS["rook"].candidates(rng, diff):
        yield _retag(cand, "cm-rook")


def gen_cm_two_bishops(rng, diff):
    p = dm.profile(diff)
    b = edge_mate_net(rng, [B, B])
    if b is not None:
        yield mk("cm-two-bishops", diff, "Two Bishops Mate Net", "Diagonal scissors — finish at the edge.",
                 b, {"type": "checkmate"}, "Deliver checkmate with the bishop pair.",
                 ["The bishops slice adjacent diagonals.", "Your king covers the remaining squares.",
                  "Drive the king to the corner and mate."],
                 ["Bishops mate in ANY corner — unlike bishop + knight.",
                  "Keep the bishops on adjacent diagonals."],
                 6, 2, 4, 2, ("mate", p["mate_cap"] + 1, 14))
    b = random_ending(rng, [B, B], [], close_kings=p["close_kings"])
    if b is not None:
        yield mk("cm-two-bishops", diff, "Full Two Bishops Mate", "The complete bishop-pair technique.",
                 b, {"type": "checkmate"}, "Deliver checkmate with two bishops and king.",
                 ["Centralize your king.", "Use the bishops to shrink the king's diamond.",
                  "Force the king to any corner and deliver mate."],
                 ["The bishop pair mates in any corner of the board.",
                  "King + bishops must coordinate — no piece mates alone."],
                 22, 15, 22, 5, ("mate", 22, 24))


def gen_cm_bishop_knight(rng, diff):
    for cand in GENERATORS["bishop-knight"].candidates(rng, diff):
        yield _retag(cand, "cm-bishop-knight")


def gen_cm_queen_vs_rook(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [Q], [R], close_kings=p["close_kings"])
    if b is not None:
        yield mk("cm-queen-vs-rook", diff, "Queen vs Rook", "Fork, skewer — win the rook or mate.",
                 b, {"type": "win_material", "piece_type": R}, "Win the black rook (or deliver checkmate).",
                 ["Queen beats rook with forcing tactics.", "Look for checks that fork king and rook.",
                  "Keep your king safe from rook checks."],
                 ["The rook cannot survive repeated queen forks.",
                  "Centralize the queen; dominate the rook's squares."],
                 30, 18, 26, 6, ("winning", 250))
    b = edge_mate_net(rng, [Q])
    if b is not None:
        # reuse a queen mate net but keep the rook on the board for flavour
        rs = _free_sq(rng, set(b.piece_map()), near=b.king(chess.BLACK), radius=4)
        if rs is not None and not b.is_attacked_by(chess.WHITE, rs):
            b.set_piece_at(rs, chess.Piece(R, chess.BLACK))
            if b.is_valid() and not b.is_game_over():
                yield mk("cm-queen-vs-rook", diff, "Queen vs Rook Finish", "Mate before the rook interferes.",
                         b, {"type": "checkmate"}, "Deliver checkmate — the rook cannot save the king.",
                         ["The king is boxed on the edge.", "Find the mating queen check.",
                          "The rook is powerless to help."],
                         ["Calculate the rook's interpositions before committing.",
                          "A forced mate ignores the defender's extra piece."],
                         6, 2, 4, 3, ("mate", p["mate_cap"] + 1, 14))


# ---------------------------------------------------------------------------
# PAWN
# ---------------------------------------------------------------------------


def gen_pw_winning_kp(rng, diff):
    f, r = rng.randint(1, 6), rng.randint(2, 4)
    b = chess.Board(None)
    b.set_piece_at(_sq(f, r), chess.Piece(P, chess.WHITE))
    b.set_piece_at(_sq(f, r + 1), chess.Piece(K, chess.WHITE))
    b.set_piece_at(_sq(f, min(7, r + 3)), chess.Piece(K, chess.BLACK))
    b.turn = chess.WHITE
    b = symmetry.transform_board(b, rng.choice([0, 1]))
    yield mk("pw-winning-kp", diff, "Opposition Win", "King in front, hold the opposition, queen.",
             b, {"type": "promote"}, "Promote the pawn to a queen.",
             ["Your king leads the pawn — the winning setup.",
              "Hold the opposition so the defender must yield.",
              "Advance only when the king controls the key squares."],
             ["King in front + opposition = win.",
              "Do not push the pawn too early."],
             12, 5, 8, 2, ("winning", 120),
             hints=["Improve the king to a key square in front of the pawn.",
                    "Use opposition to force the enemy king aside, then push.", H3])
    yield _retag(GENERATORS["pawn"]._square(rng, diff), "pw-winning-kp")


def _rook_pawn_defense(rng, diff, sub, advanced=False):
    f = rng.choice([0, 7])
    r = rng.randint(3, 4) if advanced else rng.randint(2, 3)
    kf = 1 if f == 0 else 6
    b = chess.Board(None)
    b.set_piece_at(_sq(f, r), chess.Piece(P, chess.BLACK))
    b.set_piece_at(_sq(kf, r), chess.Piece(K, chess.BLACK))
    ws = rng.choice([_sq(f, 0), _sq(kf, 0), _sq(f, 1)])
    if chess.square_distance(ws, _sq(kf, r)) < 2:
        ws = _sq(f, 0)
    b.set_piece_at(ws, chess.Piece(K, chess.WHITE))
    b.turn = chess.WHITE
    if not b.is_valid() or b.is_game_over():
        return None
    return mk(sub, diff, "Rook-Pawn Defence", "The corner stalemate saves the game.",
              b, {"type": "defend"}, "Defend: hold the draw with the corner stalemate resource.",
              ["Rook pawns are drawn when the defender reaches the corner.",
               "Keep your king in front of the pawn.",
               "When the pawn advances, the corner stalemate appears — find it."],
              ["The attacker cannot win if your king owns the promotion corner.",
               "Stalemate is your friend here — a draw is success."],
              12, 12, 12, 3, ("drawish", 70),
              hints=["Head for the corner in front of the pawn.",
                     "Stay on the promotion file; the stalemate net appears when the pawn advances.", H3])


def _king_behind_defense(rng, diff, sub):
    f, r = rng.randint(1, 6), rng.randint(2, 3)
    b = chess.Board(None)
    b.set_piece_at(_sq(f, r), chess.Piece(P, chess.BLACK))
    b.set_piece_at(_sq(f, r + 1), chess.Piece(K, chess.BLACK))
    b.set_piece_at(_sq(f, r - 2), chess.Piece(K, chess.WHITE))
    b.turn = chess.WHITE
    return mk(sub, diff, "Opposition Defence", "The king is behind the pawn — hold the draw.",
              b, {"type": "defend"}, "Defend: hold the opposition and draw.",
              ["The attacker's king is BEHIND the pawn — a theoretical draw.",
               "Keep your king in front, on the pawn's file.",
               "Take the opposition whenever the kings face each other."],
              ["King behind pawn + defender in front = draw with correct defence.",
               "Never let the attacker's king get in front of the pawn."],
              12, 12, 12, 3, ("drawish", 70),
              hints=["Stay in front of the pawn on its file.",
                     "When the kings face each other, it is the attacker's move — he must yield. Mirror his king.", H3])


def gen_pw_drawn_kp(rng, diff):
    yield _rook_pawn_defense(rng, diff, "pw-drawn-kp")
    yield _king_behind_defense(rng, diff, "pw-drawn-kp")


def gen_pw_intermediate_wins(rng, diff):
    yield _retag(GENERATORS["pawn"]._breakthrough(rng, diff), "pw-intermediate-wins")
    # 2-vs-1 majority with kings far away: create the outside passer.
    f = rng.choice([0, 1, 5, 6])
    r = rng.randint(3, 4)
    b = chess.Board(None)
    b.set_piece_at(_sq(f, r), chess.Piece(P, chess.WHITE))
    b.set_piece_at(_sq(f + 1, r), chess.Piece(P, chess.WHITE))
    b.set_piece_at(_sq(f, r + 1), chess.Piece(P, chess.BLACK))
    b.set_piece_at(_sq(7, 0), chess.Piece(K, chess.WHITE))
    b.set_piece_at(_sq(7, 7), chess.Piece(K, chess.BLACK))
    b.turn = chess.WHITE
    if b.is_valid() and not b.is_game_over():
        yield mk("pw-intermediate-wins", diff, "Majority Breakthrough", "Two vs one — create the passed pawn.",
                 b, {"type": "promote"}, "Create a passed pawn and promote it.",
                 ["You have a 2-vs-1 majority; the kings are far away.",
                  "Advance the candidate pawn — the one without an enemy pawn in front.",
                  "Sacrifice if needed to clear the path."],
                 ["The candidate pawn queens by force when the kings are out of the square.",
                  "Push the unblocked pawn first."],
                 10, 6, 9, 3, ("winning", 150))


def gen_pw_intermediate_draws(rng, diff):
    yield _rook_pawn_defense(rng, diff, "pw-intermediate-draws", advanced=True)
    # Blocked chain: dead draw, but the defender must not blunder the pawn.
    f, r = rng.randint(1, 6), rng.randint(2, 4)
    b = chess.Board(None)
    b.set_piece_at(_sq(f, r), chess.Piece(P, chess.WHITE))
    b.set_piece_at(_sq(f, r + 1), chess.Piece(P, chess.BLACK))
    b.set_piece_at(_sq(f, r - 1), chess.Piece(K, chess.WHITE))
    b.set_piece_at(_sq(f, r + 2), chess.Piece(K, chess.BLACK))
    b.turn = chess.WHITE
    if b.is_valid() and not b.is_game_over():
        yield mk("pw-intermediate-draws", diff, "Blocked Chain Defence", "Locked pawns — do not lose yours.",
                 b, {"type": "defend"}, "Defend: keep the blockade and hold the draw.",
                 ["The pawns are blocked — the position is drawn.",
                  "Keep your king protecting the pawn.",
                  "Do not wander: the attacker wins if your pawn falls."],
                 ["A blocked chain is a fortress — maintain it.",
                  "Opposition matters if the kings race to the pawn."],
                 12, 12, 12, 3, ("drawish", 60))


def gen_pw_advanced_wins(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [P, P, P], [P, P], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("pw-advanced-wins", diff, "Multi-Pawn Conversion", "Three vs two — find the winning plan.",
                 b, {"type": "promote"}, "Promote a pawn (convert the winning ending).",
                 ["You have a pawn majority — create a passed pawn.",
                  "Activate your king before pushing.",
                  "Calculate the pawn races: who queens first?"],
                 ["Connected passers support each other.",
                  "The king is a fighting piece in pawn endings."],
                 18, 11, 16, 4, ("winning", 150))


def gen_pw_advanced_draws(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [P, P], [P, P], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("pw-advanced-draws", diff, "Complex Pawn Defence", "Equal pawns — hold the balance.",
                 b, {"type": "defend"}, "Defend: hold the draw in the complex pawn ending.",
                 ["Material is equal but the position is tense.",
                  "Keep your king active and your pawns defended.",
                  "Watch for enemy breakthroughs and king invasions."],
                 ["Pawn endings are decided by king activity and tempi.",
                  "A single wrong pawn move can lose — calculate."],
                 14, 14, 14, 4, ("drawish", 50))


# ---------------------------------------------------------------------------
# MINOR PIECE
# ---------------------------------------------------------------------------


def gen_mp_bishop(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [B, P], [], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("mp-bishop", diff, "Bishop + Pawn Win", "Escort the pawn with the bishop.",
                 b, {"type": "promote"}, "Promote the pawn (bishop + king support).",
                 ["The bishop controls the promotion diagonal.",
                  "Use the king to shoulder the enemy king away.",
                  "Promote when the path is clear."],
                 ["Bishop + pawn vs king wins when the king leads.",
                  "Watch for stalemate tricks with rook pawns."],
                 16, 9, 14, 3, ("winning", 150))
    # same-colour bishops with a pawn
    color = rng.choice([0, 1])
    for _ in range(30):
        b = random_ending(rng, [B, P], [B], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        if b is None:
            break
        bs = [s for s, pc in b.piece_map().items() if pc.piece_type == B]
        if all((chess.square_file(s) + chess.square_rank(s)) % 2 == color for s in bs):
            yield mk("mp-bishop", diff, "Same-Colour Bishop Win", "King activity decides.",
                     b, {"type": "promote"}, "Promote the pawn in the same-colour bishop ending.",
                     ["Both bishops run on the same colour.", "Activate your king — it decides these endings.",
                      "Push the pawn when the enemy king is cut off."],
                     ["Same-colour bishop endings are won by the more active king.",
                      "The defender's bishop cannot stop a pawn on the other colour."],
                     18, 11, 16, 4, ("winning", 150))
            break


def gen_mp_knight(rng, diff):
    p = dm.profile(diff)
    if rng.random() < 0.6:
        b = random_ending(rng, [N, P], [], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        if b is not None:
            yield mk("mp-knight", diff, "Knight + Pawn Win", "The knight escorts the passer.",
                     b, {"type": "promote"}, "Promote the pawn (knight + king support).",
                     ["The knight covers the promotion square's approaches.",
                      "Bring your king up — knights are slow alone.",
                      "Beware stalemate when the enemy king is boxed."],
                     ["Knight + pawn wins when the king leads and the knight controls key squares.",
                      "The knight cannot lose a tempo — triangulate with the king."],
                     18, 11, 16, 4, ("winning", 150))
    else:
        legacy = GENERATORS["knights"]
        yield _retag(legacy._coordination(rng, diff), "mp-knight")
        yield _retag(legacy._recognize(rng, diff), "mp-knight")


def gen_mp_bishop_vs_knight(rng, diff):
    p = dm.profile(diff)
    if rng.random() < 0.5:
        b = random_ending(rng, [B, P], [N], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        title, tag = "Bishop vs Knight", "The bishop dominates open diagonals."
    else:
        b = random_ending(rng, [N, P], [B], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        title, tag = "Knight vs Bishop", "The knight needs closed terrain and outposts."
    if b is not None:
        yield mk("mp-bishop-vs-knight", diff, title, tag,
                 b, {"type": "promote"}, "Promote the pawn — win the minor-piece battle.",
                 ["You have the pawn — convert the advantage.",
                  "Restrict the enemy minor piece with your king.",
                  "Promote when the defender cannot sacrifice for the pawn."],
                 ["Bishop beats knight in open positions; knight thrives in closed ones.",
                  "The defender will try to sacrifice the piece for your pawn — prevent it."],
                 18, 11, 16, 4, ("winning", 150))


def gen_mp_same_bishops(rng, diff):
    p = dm.profile(diff)
    color = rng.choice([0, 1])
    for _ in range(30):
        b = random_ending(rng, [B, P, P], [B], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        if b is None:
            break
        bs = [s for s, pc in b.piece_map().items() if pc.piece_type == B]
        if all((chess.square_file(s) + chess.square_rank(s)) % 2 == color for s in bs):
            yield mk("mp-same-bishops", diff, "Same-Colour Bishops", "Two pawns, same colour — convert.",
                     b, {"type": "promote"}, "Promote a pawn in the same-colour bishop ending.",
                     ["Same-colour bishops: the active king wins.",
                      "Advance the pawns together; fix the enemy bishop.",
                      "Create a passed pawn on the colour your bishop owns."],
                     ["The defender's bishop is tied to your pawns' colour.",
                      "King invasion decides — march it to the key squares."],
                     20, 12, 18, 4, ("winning", 150))
            break


def gen_mp_opposite_bishops(rng, diff):
    p = dm.profile(diff)
    f, r = rng.randint(1, 5), rng.randint(2, 4)
    for _ in range(30):
        b = chess.Board(None)
        wk, bk = _rand_sq(rng), _rand_sq(rng)
        if chess.square_distance(wk, bk) < 2:
            continue
        b.set_piece_at(wk, chess.Piece(K, chess.WHITE))
        b.set_piece_at(bk, chess.Piece(K, chess.BLACK))
        occ = {wk, bk}
        for i in range(3):
            s = _sq(f + i, r)
            if s in occ:
                break
            b.set_piece_at(s, chess.Piece(P, chess.WHITE))
            occ.add(s)
        else:
            bp = _free_sq(rng, occ, ranks=range(1, 7))
            wb = _free_sq(rng, occ | {bp})
            bb = _free_sq(rng, occ | {bp, wb})
            if None in (bp, wb, bb):
                continue
            if (chess.square_file(wb) + chess.square_rank(wb)) % 2 == (chess.square_file(bb) + chess.square_rank(bb)) % 2:
                continue
            b.set_piece_at(bp, chess.Piece(P, chess.BLACK))
            b.set_piece_at(wb, chess.Piece(B, chess.WHITE))
            b.set_piece_at(bb, chess.Piece(B, chess.BLACK))
            b.turn = chess.WHITE
            if not b.is_valid() or b.is_game_over():
                continue
            if any(b.is_attacked_by(chess.BLACK, s) for s, pc in b.piece_map().items()
                   if pc.color == chess.WHITE and pc.piece_type != K):
                continue
            yield mk("mp-opposite-bishops", diff, "Opposite-Colour Bishops", "Three connected passers beat the draw.",
                     b, {"type": "promote"}, "Promote a pawn — connected passers win.",
                     ["Opposite-colour bishops draw even two pawns down — but three connected passers win.",
                      "Advance the pawns as a unit on your bishop's colour.",
                      "The enemy bishop cannot stop pawns on the other colour."],
                     ["The defender's bishop is powerless against the other colour complex.",
                      "Keep the pawns connected; do not let them be blockaded."],
                     20, 12, 18, 5, ("winning", 150))
            break


def gen_mp_advanced(rng, diff):
    p = dm.profile(diff)
    cfg = rng.choice([([B, N, P], [B, P]), ([N, N, P], [B, P]), ([B, P, P], [N, P])])
    b = random_ending(rng, cfg[0], cfg[1], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("mp-advanced", diff, "Mixed Minors", "Coordinate bishops and knights to convert.",
                 b, {"type": "promote"}, "Promote a pawn in the mixed minor-piece ending.",
                 ["Coordinate your minors: bishop on diagonals, knight on outposts.",
                  "Activate the king — it tips the balance.",
                  "Create and escort a passed pawn."],
                 ["Two minors outfight one when they coordinate.",
                  "Trade into a won pawn ending when possible."],
                 22, 14, 20, 5, ("winning", 150))


# ---------------------------------------------------------------------------
# ROOK
# ---------------------------------------------------------------------------


def gen_rk_basic(rng, diff):
    for cand in GENERATORS["rook"].candidates(rng, diff):
        yield _retag(cand, "rk-basic")


def gen_rk_rook_pawn_vs_king(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [R, P], [], close_kings=p["close_kings"], pawn_ranks=range(3, 6))
    if b is not None:
        ps = _pawn_of(b, chess.WHITE)
        bk = b.king(chess.BLACK)
        if ps is not None and bk is not None and chess.square_distance(ps, bk) >= 3:
            yield mk("rk-rook-pawn-vs-king", diff, "Rook + Pawn Escort", "Cut the king off, march the pawn.",
                     b, {"type": "promote"}, "Promote the pawn with rook and king support.",
                     ["The rook cuts the enemy king off from the pawn.",
                      "Bring your king up to escort.", "Push the pawn when the coast is clear."],
                     ["Rook + pawn vs king is a routine win — keep the king cut off.",
                      "Beware stalemate when the enemy king is boxed in a corner."],
                     18, 11, 16, 4, ("winning", 150))


def gen_rk_rook_vs_pawn(rng, diff):
    # Constructive: advanced black pawn with its king adjacent; white rook
    # behind the pawn on its file, white king nearby. Engine rejects the
    # theoretical draws (rook pawn + close king).
    for _ in range(40):
        f = rng.randint(0, 7)
        r = rng.choice([1, 2])
        ps = _sq(f, r)
        bk = rng.choice([s for s in chess.SQUARES if chess.square_distance(s, ps) == 1])
        rr = rng.randint(min(r + 2, 7), 7)
        rs = _sq(f, rr)
        if rs in (ps, bk):
            continue
        near = [s for s in chess.SQUARES
                if s not in (ps, bk, rs) and chess.square_distance(s, ps) <= 3
                and chess.square_distance(s, bk) >= 2]
        if not near:
            continue
        wk = rng.choice(near)
        b = chess.Board(None)
        b.set_piece_at(ps, chess.Piece(P, chess.BLACK))
        b.set_piece_at(bk, chess.Piece(K, chess.BLACK))
        b.set_piece_at(rs, chess.Piece(R, chess.WHITE))
        b.set_piece_at(wk, chess.Piece(K, chess.WHITE))
        b.turn = chess.WHITE
        if not b.is_valid() or b.is_game_over():
            continue
        if b.is_attacked_by(chess.BLACK, rs):
            continue
        yield mk("rk-rook-vs-pawn", diff, "Rook vs Passed Pawn", "Stop the passer — win the pawn.",
                 b, {"type": "win_material", "piece_type": P}, "Win the black pawn (or deliver checkmate).",
                 ["The pawn is dangerous — the enemy king supports it.",
                  "Your rook attacks the pawn from behind; bring your king up.",
                  "Force the enemy king away, then capture the pawn."],
                 ["Rook vs pawn on the 7th: the king's position decides.",
                  "Check the king away, then capture the pawn."],
                 18, 10, 16, 4, ("winning", 200))
        return


def gen_rk_rook_pawn_endings(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [R, P], [R], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("rk-rook-pawn-endings", diff, "Rook + Pawn vs Rook", "The most common endgame — convert.",
                 b, {"type": "promote"}, "Promote the pawn (or win the rook / mate).",
                 ["Keep your rook active — behind the passed pawn.",
                  "Cut the enemy king off along a file or rank.",
                  "Advance the pawn with king support; watch for checks."],
                 ["Active rook + king activity > passive defence.",
                  "The defender seeks Philidor or frontal checks — know both."],
                 26, 16, 24, 6, ("winning", 150))


def gen_rk_lucena(rng, diff):
    from app.services import endgame as eg

    f = rng.randint(3, 5)
    b = chess.Board(None)
    b.set_piece_at(_sq(f, 7), chess.Piece(K, chess.WHITE))
    b.set_piece_at(_sq(f, 6), chess.Piece(P, chess.WHITE))
    b.set_piece_at(_sq(f + 2, 6), chess.Piece(K, chess.BLACK))
    b.set_piece_at(_sq(f - 3, 1), chess.Piece(R, chess.BLACK))
    b.set_piece_at(_sq(f - 1, 0), chess.Piece(R, chess.WHITE))
    b.turn = chess.WHITE
    if rng.random() < 0.5:
        b = symmetry.transform_board(b, 1)
    if not b.is_valid() or b.is_game_over():
        return
    # Derive the teaching line from a DEEP engine search, validated by replay.
    # It must actually promote the pawn — the whole point of the Lucena.
    sans: list[str] = []
    for depth in (18, 24):
        ev = eg.evaluate_position(b.fen(), depth=depth)
        if not ev or not ev.get("pv_ucis"):
            continue
        moves, bad, _bad_fen = eg._line_from_ucis(b.fen(), ev["pv_ucis"], limit=40)
        if bad is None and moves and any(m["promotion"] for m in moves):
            sans = [m["san"] for m in moves]
            break
    yield mk("rk-lucena", diff, "Lucena Position", "Build the bridge — the winning method.",
             b, {"type": "promote"}, "Promote the pawn using the bridge technique.",
             ["Your king is in front of the pawn on the 7th — the Lucena.",
              "The enemy king is cut off, but checks will harass your king.",
              "Build the bridge: rook to the 4th rank to shelter the king."],
             ["The bridge: park the rook on the 4th rank so it can block the checks from behind.",
              "March the king out, shelter behind the rook, then queen the pawn."],
             16, 9, 14, 4, ("winning", 120), solution=sans or None,
             hints=["Your king must leave the promotion square — prepare a shelter from checks.",
                    "Swing the rook to the 4th rank: it will block the enemy rook's checks (the bridge).", H3])


def gen_rk_philidor(rng, diff):
    # True Philidor (K+R vs K+R+P, mirrored so White defends): black pawn on
    # the 4th rank with its king beside it and its rook cutting the white king
    # off on the 2nd rank; white king in front of the pawn, white rook on the
    # 3rd rank forbidding the black king's advance. When ...e3 comes, the rook
    # drops to the back rank and checks from behind — the textbook draw.
    f = rng.randint(1, 6)
    kf = f + rng.choice([-1, 1])
    if not 0 <= kf <= 7:
        kf = f - (kf - f)
    # Rooks on opposite wings: they must not attack each other, and the white
    # rook must stay out of the black king's reach.
    rf_white = 7 if kf <= 3 else 0
    rf_black = 7 - rf_white
    b = chess.Board(None)
    b.set_piece_at(_sq(f, 3), chess.Piece(P, chess.BLACK))
    b.set_piece_at(_sq(kf, 3), chess.Piece(K, chess.BLACK))
    b.set_piece_at(_sq(rf_black, 1), chess.Piece(R, chess.BLACK))
    b.set_piece_at(_sq(f, 0), chess.Piece(K, chess.WHITE))
    b.set_piece_at(_sq(rf_white, 2), chess.Piece(R, chess.WHITE))
    b.turn = chess.WHITE
    if not b.is_valid() or b.is_game_over():
        return
    if b.is_attacked_by(chess.BLACK, _sq(f, 0)):
        return
    yield mk("rk-philidor", diff, "Philidor Defence", "Third-rank fence, then checks from behind.",
             b, {"type": "defend"}, "Defend: hold the Philidor draw (rook vs rook + pawn).",
             ["Your rook on the 3rd rank cuts the enemy king off — keep it there.",
              "Your king stays in front of the pawn; the enemy rook keeps it frozen.",
              "When the pawn advances to the 3rd rank, drop your rook to the back rank and check from behind."],
             ["Philidor's method: the fence until ...e3, then perpetual checks from behind.",
              "The pawn blocks its own king's shelter — the checks never end."],
             14, 14, 14, 4, ("drawish", 160),
             hints=["Keep the rook on the third rank — the enemy king cannot cross it.",
                    "After the pawn advances to the third rank, move the rook to the eighth rank and check from behind.", H3])


def gen_rk_advanced(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [R, P, P], [R, P], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("rk-advanced", diff, "Advanced Rook Ending", "Two pawns vs one — precise conversion.",
                 b, {"type": "promote"}, "Promote a pawn in the multi-pawn rook ending.",
                 ["Rook activity first — behind your passers.",
                  "Create a passed pawn with the majority.",
                  "Cut the enemy king off; advance with king support."],
                 ["In rook endings, an active rook is worth a pawn.",
                  "Do not push pawns prematurely — improve the king and rook first."],
                 30, 19, 28, 7, ("winning", 150))


# ---------------------------------------------------------------------------
# QUEEN
# ---------------------------------------------------------------------------


def gen_q_basic(rng, diff):
    yield from _queen_mate(rng, diff, "q-basic")


def gen_q_defending(rng, diff):
    p = dm.profile(diff)
    for _ in range(3):
        b = random_ending(rng, [Q], [Q, P], close_kings=p["close_kings"], pawn_ranks=range(1, 3))
        if b is None:
            continue
        ps = _pawn_of(b, chess.BLACK)
        bk = b.king(chess.BLACK)
        wk = b.king(chess.WHITE)
        if ps is None or bk is None or wk is None:
            continue
        if chess.square_distance(ps, bk) <= 2 and chess.square_distance(wk, _sq(chess.square_file(ps), 0)) <= 2:
            yield mk("q-defending", diff, "Queen Ending Defence", "Pawn down — seek the perpetual.",
                     b, {"type": "defend"}, "Defend: hold the draw with checks and blockade.",
                     ["You are a pawn down in a queen ending — but it is drawn with precise defence.",
                      "Keep your king near the promotion square.",
                      "Use your queen for checks and to blockade the pawn."],
                     ["Queen endings offer perpetual-check resources.",
                      "Do not trade queens — the pawn ending is lost."],
                     14, 14, 14, 4, ("drawish", 90))
    # Reliable fallback: pure queens — avoid the perpetual, never hang the queen.
    b = random_ending(rng, [Q], [Q], close_kings=p["close_kings"])
    if b is not None:
        yield mk("q-defending", diff, "Queen vs Queen", "Equal material — survive the checks.",
                 b, {"type": "defend"}, "Defend: hold the draw in the queen ending.",
                 ["Material is equal — the position is drawn.",
                  "Answer checks carefully; keep your king sheltered.",
                  "Never hang your queen to a fork or skewer."],
                 ["Queen vs queen is a theoretical draw — precision keeps it so.",
                  "Perpetual check is the standard drawing resource."],
                 12, 12, 12, 3, ("drawish", 60))


def gen_q_advanced(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [Q, P], [Q], close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("q-advanced", diff, "Queen + Pawn vs Queen", "Pawn up — convert with checks.",
                 b, {"type": "promote"}, "Promote the pawn (or win the queen / mate).",
                 ["You are a pawn up — the win requires precise queen play.",
                  "Advance the pawn under queen cover.",
                  "Watch for perpetual checks — keep your king sheltered."],
                 ["Queen + pawn vs queen is won when the pawn is far advanced and the king safe.",
                  "Trade queens only into a won pawn ending."],
                 24, 15, 22, 6, ("winning", 200))


def gen_q_vs_pawn(rng, diff):
    # Constructive: pawn on the 7th with its king adjacent; queen and attacking
    # king far away. The engine filter rejects the theoretical rook-pawn draws.
    for _ in range(40):
        f = rng.randint(0, 7)
        ps = _sq(f, 1)
        neighbors = [s for s in chess.SQUARES if chess.square_distance(s, ps) == 1]
        bk = rng.choice(neighbors)
        wq = _free_sq(rng, {ps, bk})
        if wq is None or chess.square_distance(wq, ps) < 3:
            continue
        wk = _free_sq(rng, {ps, bk, wq})
        if wk is None or chess.square_distance(wk, bk) < 3:
            continue
        b = chess.Board(None)
        b.set_piece_at(ps, chess.Piece(P, chess.BLACK))
        b.set_piece_at(bk, chess.Piece(K, chess.BLACK))
        b.set_piece_at(wq, chess.Piece(Q, chess.WHITE))
        b.set_piece_at(wk, chess.Piece(K, chess.WHITE))
        b.turn = chess.WHITE
        if not b.is_valid() or b.is_game_over():
            continue
        if b.is_attacked_by(chess.BLACK, wq):
            continue
        yield mk("q-vs-pawn", diff, "Queen vs Pawn on the 7th", "Checks, pins, king march — win the pawn.",
                 b, {"type": "win_material", "piece_type": P}, "Win the pawn on the 7th (or deliver checkmate).",
                 ["The pawn is one step from queening — the king supports it.",
                  "Check the king, pin the pawn, force the king in front of it.",
                  "March your king up while the queen harasses; then capture."],
                 ["The winning method: checks until the enemy king blocks its own pawn, then approach.",
                  "Rook pawns (a/h) with the king close are drawn — this one is winnable."],
                 16, 9, 14, 4, ("winning", 200),
                 hints=["Force the enemy king in front of its pawn with checks — it blocks the promotion.",
                        "While the king is stuck, march your own king closer; then win the pawn.", H3])
        return


# ---------------------------------------------------------------------------
# IMBALANCES
# ---------------------------------------------------------------------------


def gen_im_rook_vs_minor(rng, diff):
    p = dm.profile(diff)
    minor = rng.choice([B, N])
    b = random_ending(rng, [R], [minor], close_kings=p["close_kings"])
    if b is not None:
        name = "Bishop" if minor == B else "Knight"
        yield mk("im-rook-vs-minor", diff, f"Rook vs {name}", "Convert the exchange.",
                 b, {"type": "win_material", "piece_type": minor}, f"Win the black {name.lower()} (or deliver checkmate).",
                 ["The rook dominates the lone minor piece.",
                  "Cut the king off; attack the minor piece with rook and king.",
                  "Force a fork or zugzwang to win the piece."],
                 ["Rook vs minor is a forced win — technique, not luck.",
                  "Keep the minor piece restricted; it cannot defend everything."],
                 28, 18, 26, 6, ("winning", 150))


def gen_im_rook_vs_two_minor(rng, diff):
    p = dm.profile(diff)
    b = random_ending(rng, [B, N], [R], close_kings=p["close_kings"])
    if b is not None:
        yield mk("im-rook-vs-two-minor", diff, "Two Minors vs Rook", "Coordinate — the fortress holds.",
                 b, {"type": "defend"}, "Defend: hold the draw with bishop and knight.",
                 ["Two minors usually hold against a rook — coordinate them.",
                  "Keep the pieces defended; avoid forks.",
                  "Your king helps cover the colour the bishop cannot."],
                 ["The rook wins only if it forks or traps a minor piece.",
                  "Bishop + knight cover both colour complexes — stay compact."],
                 16, 16, 16, 4, ("drawish", 160))


def gen_im_queen_vs_two_rooks(rng, diff):
    p = dm.profile(diff)
    for white, black in (([Q], [R, R]), ([Q, P], [R, R])):
        b = random_ending(rng, white, black, close_kings=p["close_kings"], pawn_ranks=range(2, 6))
        if b is not None:
            yield mk("im-queen-vs-two-rooks", diff, "Queen vs Two Rooks", "The rooks are loose — fork them.",
                     b, {"type": "win_material", "piece_type": R}, "Win a rook with the queen (or mate).",
                     ["Two rooks beat a queen only when they coordinate.",
                      "Here the rooks are disconnected — find the fork.",
                      "Check the king and attack a rook simultaneously."],
                     ["Queen forks win loose rooks — calculate every check.",
                      "Keep your king safe from the rook battery."],
                     26, 16, 24, 6, ("winning", 200))
            break


def gen_im_basic(rng, diff):
    p = dm.profile(diff)
    cfg = rng.choice([
        ([R], [N, P], N, "Rook vs Knight + Pawn"),
        ([Q], [R, N], R, "Queen vs Rook + Knight"),
        ([R, B], [R], R, "Rook + Bishop vs Rook"),
    ])
    white, black, target, title = cfg
    b = random_ending(rng, white, black, close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        yield mk("im-basic", diff, title, "Convert the material edge.",
                 b, {"type": "win_material", "piece_type": target}, "Win the target piece (or deliver checkmate).",
                 ["You have the material edge — convert it.",
                  "Restrict the enemy pieces; create forcing threats.",
                  "Win the target piece or force a winning trade."],
                 ["Material advantages win with active pieces and king support.",
                  "Avoid stalemate tricks when the defender is desperate."],
                 28, 18, 26, 6, ("winning", 150))


def gen_im_advanced(rng, diff):
    p = dm.profile(diff)
    cfg = rng.choice([
        ([R, R], [Q, P], Q, "Two Rooks vs Queen + Pawn"),
        ([Q, P], [R, N, P], R, "Queen + Pawn vs Rook + Knight"),
    ])
    white, black, target, title = cfg
    b = random_ending(rng, white, black, close_kings=p["close_kings"], pawn_ranks=range(2, 6))
    if b is not None:
        obj = {"type": "win_material", "piece_type": target}
        yield mk("im-advanced", diff, title, "Complex imbalance — precise play wins.",
                 b, obj, "Win the target piece (or promote / mate).",
                 ["A complex material fight — calculate forcing lines.",
                  "Coordinate your pieces; exploit the loose enemy piece.",
                  "Convert by winning material or promoting."],
                 ["In complex imbalances, activity and coordination decide.",
                  "Keep your king safe — tactics revolve around it."],
                 30, 20, 28, 7, ("winning", 150))


SUBGENERATORS = {
    "cm-two-rooks": gen_cm_two_rooks,
    "cm-queen": gen_cm_queen,
    "cm-rook": gen_cm_rook,
    "cm-two-bishops": gen_cm_two_bishops,
    "cm-bishop-knight": gen_cm_bishop_knight,
    "cm-queen-vs-rook": gen_cm_queen_vs_rook,
    "pw-winning-kp": gen_pw_winning_kp,
    "pw-drawn-kp": gen_pw_drawn_kp,
    "pw-intermediate-wins": gen_pw_intermediate_wins,
    "pw-intermediate-draws": gen_pw_intermediate_draws,
    "pw-advanced-wins": gen_pw_advanced_wins,
    "pw-advanced-draws": gen_pw_advanced_draws,
    "mp-bishop": gen_mp_bishop,
    "mp-knight": gen_mp_knight,
    "mp-bishop-vs-knight": gen_mp_bishop_vs_knight,
    "mp-same-bishops": gen_mp_same_bishops,
    "mp-opposite-bishops": gen_mp_opposite_bishops,
    "mp-advanced": gen_mp_advanced,
    "rk-basic": gen_rk_basic,
    "rk-rook-pawn-vs-king": gen_rk_rook_pawn_vs_king,
    "rk-rook-vs-pawn": gen_rk_rook_vs_pawn,
    "rk-rook-pawn-endings": gen_rk_rook_pawn_endings,
    "rk-lucena": gen_rk_lucena,
    "rk-philidor": gen_rk_philidor,
    "rk-advanced": gen_rk_advanced,
    "q-basic": gen_q_basic,
    "q-defending": gen_q_defending,
    "q-advanced": gen_q_advanced,
    "q-vs-pawn": gen_q_vs_pawn,
    "im-rook-vs-minor": gen_im_rook_vs_minor,
    "im-rook-vs-two-minor": gen_im_rook_vs_two_minor,
    "im-queen-vs-two-rooks": gen_im_queen_vs_two_rooks,
    "im-basic": gen_im_basic,
    "im-advanced": gen_im_advanced,
}