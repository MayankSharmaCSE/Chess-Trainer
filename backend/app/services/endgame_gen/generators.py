"""Category generators: RookEndgameGenerator, TwoKnightsGenerator,
BishopKnightGenerator, PawnEndgameGenerator.

Each yields candidate drills built around a legitimate endgame scenario with
controlled random parameters (king/rook/bishop/knight/pawn squares, edge,
mating corner, side conditions, objective, move budget). Candidates carry a
`_verify` tag; the orchestrator runs PositionValidator + SolutionValidator and
discards anything unverified. Long-mate scenarios use symmetry orbits of
verified curated seeds so a mating line always exists.
"""

from __future__ import annotations

import random

import chess

from app.services.endgame_drills import EDGE_SQUARES
from app.services.endgame_gen import difficulty as dm
from app.services.endgame_gen import symmetry

LIGHT_ZONE = ["a8", "b8", "a7", "b7", "h1", "g1", "h2", "g2"]
DARK_ZONE = ["a1", "b1", "a2", "b2", "h8", "g8", "h7", "g7"]


def corner_zone(bishop_color: int) -> list[str]:
    return LIGHT_ZONE if bishop_color == chess.WHITE else DARK_ZONE


def _sq(f: int, r: int) -> int:
    return chess.square(f, r)


def _pos_tag(fen: str) -> str:
    """A chess-meaningful, position-distinct suffix for the challenge title."""
    b = chess.Board(fen)
    bk = b.king(chess.BLACK)
    return chess.square_name(bk) if bk is not None else ""


def _base(category, diff, title, tagline, fen, objective, objective_label,
          instructions, tips, hints, base_max, three, two, est, verify,
          solution=None, strict=False) -> dict:
    p = dm.profile(diff)
    return {
        "id": "",  # assigned by orchestrator
        "category": category,
        "level": 0,
        "title": f"{title} · {_pos_tag(fen)}",
        "tagline": tagline,
        "difficulty": diff,
        "fen": fen,
        "player_color": "white",
        "objective": objective,
        "objective_label": objective_label,
        "max_moves": dm.budget(base_max, diff),
        "star_moves": dm.star_moves(three, two, diff),
        "est_minutes": est,
        "instructions": instructions,
        "tips": tips,
        "hints": hints,
        "solution_sans": solution or [],
        "model_complete": bool(solution),
        "strict": strict,
        "generated": True,
        "hint_max": p["hint_max"],
        "opponent": {"mode": "engine", "depth": p["opponent_depth"], "skill": p["opponent_skill"],
                     "movetime_ms": 300, "script": {}},
        "_verify": verify,
    }


H3 = "The engine's best move is highlighted on the board — play it and keep the technique going."


def _rand_square(rng, files=range(8), ranks=range(8)):
    return _sq(rng.choice(list(files)), rng.choice(list(ranks)))


def _free(rng, occupied, files=range(8), ranks=range(8)):
    for _ in range(60):
        s = _rand_square(rng, files, ranks)
        if s not in occupied:
            return s
    return None


class RookEndgameGenerator:
    category = "rook"

    def candidates(self, rng: random.Random, diff: str):
        p = dm.profile(diff)
        yield self._near_mate(rng, diff, p)
        yield self._drive(rng, diff)
        yield self._cage(rng, diff)
        yield self._full_mate(rng, diff)

    def _near_mate(self, rng, diff, p):
        t = rng.randint(1, 6)
        off = rng.randint(-1, 1)
        t2 = rng.choice([x for x in range(8) if abs(x - t) >= 2])
        b = chess.Board(None)
        b.set_piece_at(_sq(t, 7), chess.Piece(chess.KING, chess.BLACK))
        b.set_piece_at(_sq(max(0, min(7, t + off)), 5), chess.Piece(chess.KING, chess.WHITE))
        b.set_piece_at(_sq(t2, 6), chess.Piece(chess.ROOK, chess.WHITE))
        b.turn = chess.WHITE
        b = symmetry.transform_board(b, rng.randrange(8))
        return _base(
            "rook", diff, "Rook Mate Net", "The king is boxed on the edge — finish it.",
            b.fen(), {"type": "checkmate"}, "Deliver checkmate with rook and king.",
            ["The black king is confined to the edge.", "Bring your king to opposition if needed.",
             "Slide the rook to the edge rank for mate.", "Never stalemate: keep one escape square until the mating check."],
            ["Rook checks from behind drive the king; the king covers the flight squares.",
             "Opposition + back-rank rook check is the mating pattern."],
            ["The enemy king is already on the edge — shrink its box to zero.",
             "Your king and the rook together cover every escape; find the checking rook move.", H3],
            6, 2, 4, 2, ("short_mate", p["mate_cap"]),
        )

    def _drive(self, rng, diff):
        b = self._random_kr(rng, central=True, close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        return _base(
            "rook", diff, "Drive to the Edge", "Cut the board and herd the king outward.",
            b.fen(), {"type": "king_zone", "squares": EDGE_SQUARES},
            "Drive the black king to any edge square (rank 1/8 or file a/h).",
            ["Use the rook to cut a file or rank.", "March your king up to support the rook.",
             "Check from behind to push the king toward the edge."],
            ["The rook alone cannot drive the king — your king must join.",
             "Keep the rook behind the king, never let it slip past."],
            ["Cut the board with the rook, then squeeze with your king.",
             "Work on the side where your king can approach fastest.", H3],
            14, 9, 14, 3, ("winning",),
        )

    def _cage(self, rng, diff):
        b = self._random_kr(rng, central=True, close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        return _base(
            "rook", diff, "Shrink the Box", "Restrict the king to a tiny cage.",
            b.fen(), {"type": "mobility", "max": 3},
            "Cage the black king to 3 or fewer legal moves (without check).",
            ["Cut a line with the rook.", "Step your king closer to cover escapes.",
             "Reduce the king to three moves or fewer — a quiet cage, not a check."],
            ["Count the enemy king's escapes after each move.",
             "Rook on a cutting line + king nearby closes the box."],
            ["Build a box: rook cuts one direction, king covers the rest.",
             "Aim for a position where the king has only three squares.", H3],
            12, 5, 9, 3, ("winning",),
        )

    def _full_mate(self, rng, diff):
        seed = rng.choice(symmetry.MATE_SEEDS["rook"])
        t = symmetry.transform_seed(seed, rng.randrange(8))
        if not t:
            return None
        return _base(
            "rook", diff, "Full Rook Checkmate", "Box, drive, oppose, mate — the complete technique.",
            t["fen"], {"type": "checkmate"}, "Deliver checkmate with rook and king.",
            ["Cut off and box the king.", "Drive it to the edge.", "Take opposition with your king.",
             "Mate on the edge rank; avoid stalemate."],
            ["The mating pattern: enemy king on edge, your king in opposition, rook checks the edge rank.",
             "If the king heads to a corner, wait with the rook — do not stalemate."],
            ["Drive the king to the edge with the rook while your king marches up.",
             "Aim for opposition near the edge, then the back-rank rook check.", H3],
            22, 16, 22, 5, ("seed",), solution=t["solution_sans"],
        )

    def _random_kr(self, rng, central=False, close_kings=False):
        for _ in range(40):
            bk = _rand_square(rng, range(1, 7), range(2, 6) if central else range(8))
            wk = _free(rng, {bk})
            rk = _free(rng, {bk, wk})
            if wk is None or rk is None:
                continue
            if chess.square_distance(wk, bk) < 2:
                continue
            if close_kings and chess.square_distance(wk, bk) > 3:
                continue
            b = chess.Board(None)
            b.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
            b.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
            b.set_piece_at(rk, chess.Piece(chess.ROOK, chess.WHITE))
            b.turn = chess.WHITE
            if b.is_check() or b.is_attacked_by(chess.BLACK, rk):
                continue
            if b.is_attacked_by(chess.WHITE, bk):
                continue  # defender cannot start in check (illegal position)
            return b
        return None


class TwoKnightsGenerator:
    category = "knights"

    def candidates(self, rng, diff):
        p = dm.profile(diff)
        yield self._mate_net_pawn(rng, diff, p)
        yield self._lone_trap(rng, diff)
        yield self._coordination(rng, diff)
        yield self._recognize(rng, diff)

    def _mate_net_pawn(self, rng, diff, p):
        b = chess.Board(None)
        b.set_piece_at(_sq(0, 0), chess.Piece(chess.KING, chess.BLACK))   # a1
        b.set_piece_at(_sq(2, 1), chess.Piece(chess.KING, chess.WHITE))   # c2
        b.set_piece_at(_sq(0, 3), chess.Piece(chess.KNIGHT, chess.WHITE))  # a4
        b.set_piece_at(_sq(3, 1), chess.Piece(chess.KNIGHT, chess.WHITE))  # d2
        b.set_piece_at(_sq(0, 2), chess.Piece(chess.PAWN, chess.BLACK))    # a3
        b.turn = chess.WHITE
        b = symmetry.transform_board(b, rng.randrange(8))
        return _base(
            "knights", diff, "Pawn-Assisted Mate", "The defender's pawn removes stalemate — mate is forced.",
            b.fen(), {"type": "checkmate"}, "Deliver checkmate; Black's own pawn makes it possible.",
            ["Black has a pawn that gives it a move, so stalemate tricks vanish.",
             "Drive the king to the corner and force the pawn forward.", "Close the net with the knights."],
            ["Two knights CAN force mate when the defender has a pawn.",
             "The pawn blocks its own king's escape — use that."],
            ["Your king must cover the escape squares next to the corner.",
             "Force the pawn to advance, blocking the last flight square.", H3],
            6, 3, 5, 4, ("short_mate", max(3, p["mate_cap"])),
        )

    def _lone_trap(self, rng, diff):
        t = symmetry.transform_seed("knight-1", rng.randrange(8))
        if not t:
            return None
        return _base(
            "knights", diff, "Mate or Stalemate", "One move mates; most moves draw. Find it.",
            t["fen"], {"type": "checkmate"}, "Deliver checkmate — careful, most moves stalemate!",
            ["Two knights cannot force mate vs a lone king — but Black blundered into a net.",
             "The black king has no moves; any quiet move stalemates.", "Find the checking move that mates."],
            ["Both knights may check, but only one keeps every escape covered.",
             "This is the heart of the two-knights endgame."],
            ["Black has zero legal moves — you MUST give check.",
             "Look for a knight check that keeps the remaining escape covered.", H3],
            3, 1, 2, 2, ("seed",), solution=t["solution_sans"], strict=True,
        )

    def _coordination(self, rng, diff):
        kind = rng.choice(["approach", "checks"])
        # Approach must not already be satisfied at the start.
        min_dist = 3 if kind == "approach" else 2
        b = self._random_knn(rng, close_kings=dm.profile(diff)["close_kings"], min_dist=min_dist)
        if b is None:
            return None
        if kind == "approach":
            obj = {"type": "approach", "distance": 2}
            label = "Bring your king within 2 squares of the black king."
            ins = ["Knights need their king — march it into the fight.",
                   "Use the knights to herd the king toward your approaching king."]
        else:
            obj = {"type": "checks", "count": 2}
            label = "Deliver 2 checks with your knights."
            ins = ["Coordinate the knights to check the king repeatedly.",
                   "Checks restrict the king and improve your pieces."]
        return _base(
            "knights", diff, "Knight Coordination", "Two knights and a king working as one.",
            b.fen(), obj, label, ins,
            ["Knights cover one colour complex; the king covers the rest.",
             "Mate is not forceable vs a lone king — focus on coordination.",
             "Use checks to gain tempi and reposition."],
            ["Improve your worst piece (often the king) while knights check.",
             "Activate the king and herd with knight checks; coordinate both knights to cover complementary squares.", H3],
            10, 4, 7, 3, ("objective",),
        )

    def _recognize(self, rng, diff):
        b = self._random_knn(rng, close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        return _base(
            "knights", diff, "Cage, Not Mate", "Recognize the limit: cage the king, don't chase mate.",
            b.fen(), {"type": "mobility", "max": 2},
            "Cage the black king to 2 or fewer legal moves (without check).",
            ["Two knights cannot force mate vs a lone king — accept the drawish truth.",
             "Instead, demonstrate control: cage the king to two moves.",
             "Avoid stalemate while caging."],
            ["This teaches the limitation: control is possible, forced mate is not.",
             "A cage plus king support restricts the king dramatically."],
            ["Build a cage with knights + king around the enemy king.",
             "Reduce escapes to two without giving check (which would be stalemate risk).", H3],
            12, 4, 8, 4, ("objective",),
        )

    def _random_knn(self, rng, close_kings=False, min_dist=2):
        for _ in range(40):
            bk = _rand_square(rng, range(1, 7), range(1, 7))
            wk = _free(rng, {bk}, range(8), range(8))
            n1 = _free(rng, {bk, wk})
            n2 = _free(rng, {bk, wk, n1})
            if wk is None or n1 is None or n2 is None:
                continue
            if chess.square_distance(wk, bk) < min_dist:
                continue
            if close_kings and chess.square_distance(wk, bk) > 3:
                continue
            b = chess.Board(None)
            b.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
            b.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
            b.set_piece_at(n1, chess.Piece(chess.KNIGHT, chess.WHITE))
            b.set_piece_at(n2, chess.Piece(chess.KNIGHT, chess.WHITE))
            b.turn = chess.WHITE
            if b.is_check() or b.is_attacked_by(chess.BLACK, n1) or b.is_attacked_by(chess.BLACK, n2):
                continue
            if b.is_attacked_by(chess.WHITE, bk):
                continue  # defender cannot start in check (illegal position)
            if b.is_stalemate():
                continue
            return b
        return None


class BishopKnightGenerator:
    category = "bishop-knight"

    def candidates(self, rng, diff):
        yield self._corner_drive(rng, diff)
        yield self._wrong_corner(rng, diff)
        yield self._cage(rng, diff)
        yield self._full_mate(rng, diff)

    def _random_kbn(self, rng, bk=None, bishop_color=None, close_kings=False):
        for _ in range(40):
            bs = _rand_square(rng)
            # Square colour: (file+rank) odd = light. The bishop always belongs
            # to White; `color` tracks its SQUARE colour (WHITE=light, BLACK=dark)
            # so the mating corner zone matches the bishop.
            color = chess.WHITE if (chess.square_file(bs) + chess.square_rank(bs)) % 2 == 1 else chess.BLACK
            if bishop_color is not None and color != bishop_color:
                continue
            bk = bk if bk is not None else _rand_square(rng, range(1, 7), range(1, 7))
            if bs == bk:
                continue  # bishop must not overwrite the defender king
            wk = _free(rng, {bk, bs})
            ns = _free(rng, {bk, bs, wk})
            if wk is None or ns is None:
                continue
            if chess.square_distance(wk, bk) < 2:
                continue
            if close_kings and chess.square_distance(wk, bk) > 3:
                continue
            b = chess.Board(None)
            b.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
            b.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
            b.set_piece_at(bs, chess.Piece(chess.BISHOP, chess.WHITE))
            b.set_piece_at(ns, chess.Piece(chess.KNIGHT, chess.WHITE))
            b.turn = chess.WHITE
            if b.is_check() or b.is_attacked_by(chess.BLACK, bs) or b.is_attacked_by(chess.BLACK, ns):
                continue
            if b.is_attacked_by(chess.WHITE, bk):
                continue  # defender cannot start in check (illegal position)
            return b, color
        return None, None

    def _corner_drive(self, rng, diff):
        b, color = self._random_kbn(rng, close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        cname = "light" if color == chess.WHITE else "dark"
        # The corner is a TECHNIQUE STEP, not the finish: the challenge is only
        # complete on actual checkmate (KBN mate takes up to 33 moves, so the
        # budget matches the full-mate drill, not a short drive).
        return _base(
            "bishop-knight", diff, "Drive to the Correct Corner",
            f"Your {cname}-squared bishop mates in the {cname} corners.",
            b.fen(), {"type": "checkmate"},
            f"Deliver checkmate in a {cname} corner (the bishop's colour).",
            ["Identify the correct mating corner from your bishop's colour.",
             "Drive the king toward that corner with bishop + knight + king.",
             "Keep the king boxed; do not let it escape to the centre.",
             "Reaching the corner is not the end — deliver checkmate there; avoid stalemate."],
            ["A light-squared bishop mates at a8/h1; dark at a1/h8.",
             "The knight covers the squares the bishop cannot."],
            [f"Your bishop is {cname}-squared — aim for the {cname} corners.",
             "Centralize the king and herd with bishop diagonals + knight jumps.", H3],
            34, 24, 32, 10, ("winning",),
        )

    def _wrong_corner(self, rng, diff):
        # start the black king in a WRONG corner for a random bishop square colour
        color = rng.choice([chess.WHITE, chess.BLACK])
        wrong = DARK_ZONE if color == chess.WHITE else LIGHT_ZONE
        bk = chess.parse_square(rng.choice(wrong[:2] + wrong[4:6]))
        b, _ = self._random_kbn(rng, bk=bk, bishop_color=color,
                               close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        zone = corner_zone(color)
        cname = "light" if color == chess.WHITE else "dark"
        return _base(
            "bishop-knight", diff, "Transfer from the Wrong Corner", "The W-pattern: move the king to the right corner.",
            b.fen(), {"type": "king_zone", "squares": zone},
            f"The king hides in a wrong corner — transfer it to a {cname} corner.",
            ["The king is in a corner your bishop cannot mate in.",
             "Transfer it along the edge to the correct corner (W-pattern).",
             "Keep the cage tight during the transfer."],
            ["Never let the king escape to the centre mid-transfer.",
             "The knight traces a W while bishop + king seal escapes."],
            [f"Target the {cname} corners; the current corner is wrong.",
             "Slide the king along the edge with knight checks and bishop cuts.", H3],
            30, 20, 28, 7, ("winning",),
        )

    def _cage(self, rng, diff):
        b, color = self._random_kbn(rng, close_kings=dm.profile(diff)["close_kings"])
        if b is None:
            return None
        return _base(
            "bishop-knight", diff, "Bishop + Knight Cage", "Coordinate all three pieces to shrink the box.",
            b.fen(), {"type": "mobility", "max": 3},
            "Cage the black king to 3 or fewer legal moves (without check).",
            ["Bishop covers one colour, knight the other, king the adjacent squares.",
             "Shrink the box to three moves or fewer."],
            ["Centralize the king as the anchor of the cage.",
             "Count escapes after each move."],
            ["Anchor with your king; bishop + knight take the outer squares.",
             "Aim for a three-square cage without checking.", H3],
            18, 6, 12, 5, ("winning",),
        )

    def _full_mate(self, rng, diff):
        t = symmetry.transform_seed("bishop-knight-5", rng.randrange(8))
        if not t:
            return None
        return _base(
            "bishop-knight", diff, "Full Bishop & Knight Mate", "The complete technique against best defence.",
            t["fen"], {"type": "checkmate"}, "Deliver checkmate with bishop, knight and king.",
            ["Drive the king to the edge.", "Transfer to the correct corner (W-pattern).",
             "Support with your king and deliver the final mate.", "Budget up to ~33 moves."],
            ["The mate must occur in a corner of the bishop's colour.",
             "If the king reaches the wrong corner, transfer it along the edge."],
            ["Centralize and drive to the edge, then aim for the bishop's corner.",
             "Keep the king boxed; the final pattern is king + bishop + knight at the corner.", H3],
            40, 30, 40, 12, ("seed",), solution=t["solution_sans"],
        )


class PawnEndgameGenerator:
    category = "pawn"

    def candidates(self, rng, diff):
        yield self._opposition(rng, diff)
        yield self._square(rng, diff)
        yield self._breakthrough(rng, diff)
        yield self._fork(rng, diff)
        yield self._promotion_mate(rng, diff)

    def _opposition(self, rng, diff):
        f = rng.randint(1, 6)
        r = rng.randint(2, 4)
        b = chess.Board(None)
        b.set_piece_at(_sq(f, r), chess.Piece(chess.PAWN, chess.WHITE))
        b.set_piece_at(_sq(f, r + 1), chess.Piece(chess.KING, chess.WHITE))
        b.set_piece_at(_sq(f, min(7, r + 3)), chess.Piece(chess.KING, chess.BLACK))
        b.turn = chess.WHITE
        b = symmetry.transform_board(b, rng.choice([0, 1]))
        return _base(
            "pawn", diff, "Opposition & Key Squares", "Lead with the king, hold the opposition, queen.",
            b.fen(), {"type": "promote"}, "Promote the pawn to a queen.",
            ["Your king leads the pawn — the winning setup.",
             "Hold the opposition so Black must yield.", "Advance the pawn only when the king leads."],
            ["King in front + opposition = win; king beside/behind = draw.",
             "Do not push the pawn too early."],
            ["Improve the king to a key square in front of the pawn.",
             "Use opposition to force the black king aside, then push.", H3],
            12, 5, 8, 2, ("winning",),
        )

    def _square(self, rng, diff):
        f = rng.randint(0, 7)
        r = rng.randint(2, 4)
        b = chess.Board(None)
        b.set_piece_at(_sq(f, r), chess.Piece(chess.PAWN, chess.WHITE))
        # black king outside the pawn's square
        for _ in range(40):
            bk = _rand_square(rng)
            if chess.square_distance(bk, _sq(f, r)) > (7 - r) + 1:
                break
        else:
            return None
        wk = _free(rng, {bk, _sq(f, r)}, range(8), range(0, 2))
        if wk is None:
            return None
        b.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
        b.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
        b.turn = chess.WHITE
        return _base(
            "pawn", diff, "Rule of the Square", "The pawn is outside the king's square — it queens by force.",
            b.fen(), {"type": "promote"}, "Promote the pawn before the black king catches it.",
            ["Draw the pawn's square to the promotion rank.",
             "The black king is outside it — it can never catch the pawn.",
             "Push straight down; your king is irrelevant."],
            ["If the enemy king cannot enter the square, the pawn queens alone.",
             "Count moves: pawn vs king race."],
            ["Do not waste tempi with your king — the pawn wins the race.",
             "Push the pawn every move to the promotion rank.", H3],
            6, 4, 6, 2, ("promotion",),
        )

    def _breakthrough(self, rng, diff):
        f = rng.randint(0, 5)
        r = rng.randint(3, 4)
        b = chess.Board(None)
        for i in range(3):
            b.set_piece_at(_sq(f + i, r), chess.Piece(chess.PAWN, chess.WHITE))
            b.set_piece_at(_sq(f + i, r + 2), chess.Piece(chess.PAWN, chess.BLACK))
        b.set_piece_at(_sq(0, 0), chess.Piece(chess.KING, chess.WHITE))
        b.set_piece_at(_sq(7, 7), chess.Piece(chess.KING, chess.BLACK))
        b.turn = chess.WHITE
        return _base(
            "pawn", diff, "Pawn Breakthrough", "Sacrifice to create an unstoppable passed pawn.",
            b.fen(), {"type": "promote"}, "Create a passed pawn and promote it.",
            ["You have a 3-vs-3 majority; the kings are far away.",
             "Push the middle pawn to deflect, then break through on a side.",
             "Queen the remaining passed pawn."],
            ["1.b6!-style breakthrough: deflect then advance the free pawn.",
             "Whichever way Black captures, a pawn queens."],
            ["Push the middle pawn first to deflect a defender.",
             "Then advance the side pawn that becomes passed.", H3],
            8, 5, 7, 3, ("promotion",),
        )

    def _fork(self, rng, diff):
        f = rng.randint(1, 5)
        b = chess.Board(None)
        b.set_piece_at(_sq(f, 6), chess.Piece(chess.PAWN, chess.WHITE))
        b.set_piece_at(_sq(f + 1, 5), chess.Piece(chess.KING, chess.BLACK))
        b.set_piece_at(_sq(f + 2, 6), chess.Piece(chess.ROOK, chess.BLACK))
        b.set_piece_at(_sq(0, 0), chess.Piece(chess.KING, chess.WHITE))
        b.turn = chess.WHITE
        b = symmetry.transform_board(b, rng.choice([0, 1]))
        return _base(
            "pawn", diff, "Underpromotion Fork", "Promote to a knight with check, winning the rook.",
            b.fen(), {"type": "win_material", "piece_type": chess.ROOK},
            "Win the black rook (promote with a knight fork).",
            ["A queen wins slowly — a knight promotion with check forks king and rook.",
             "After the king moves, capture the rook."],
            ["Underpromotion is correct when it comes with check and a fork.",
             "The new knight checks the king and hits the rook simultaneously."],
            ["Look for a promotion that gives check and attacks the rook.",
             "A knight on the promotion square forks king and rook.", H3],
            3, 2, 3, 3, ("fork",), strict=True,
        )

    def _promotion_mate(self, rng, diff):
        t = symmetry.transform_seed("pawn-5", rng.randrange(8))
        if not t:
            return None
        return _base(
            "pawn", diff, "Promotion to Checkmate", "Queen the pawn, then convert with king + queen.",
            t["fen"], {"type": "checkmate"}, "Promote and deliver checkmate with the new queen.",
            ["Support the promotion with your king first.",
             "After queening, box the king with the queen and bring your king.",
             "Mate on the edge; avoid stalemate."],
            ["Pushing unsupported lets the king capture the new queen.",
             "Queen + king mate: shrink the box, then mate on the edge."],
            ["Improve the king to support the promotion square.",
             "After queening, drive the king to the edge with queen checks.", H3],
            16, 10, 14, 5, ("seed",), solution=t["solution_sans"],
        )


GENERATORS = {
    "rook": RookEndgameGenerator(),
    "knights": TwoKnightsGenerator(),
    "bishop-knight": BishopKnightGenerator(),
    "pawn": PawnEndgameGenerator(),
}