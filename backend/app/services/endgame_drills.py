"""Endgame Drills catalog — the single source of truth for drill definitions.

Every FEN, objective and model line here was validated with python-chess and
Stockfish (see tests/test_endgame.py). Drill definitions live apart from UI and
from the engine/opponent logic in app/services/endgame.py.

Objective types
---------------
checkmate     : deliver checkmate (any drill also completes on checkmate).
promote       : promote a pawn; optional {"piece": "q"|"r"|"b"|"n"} restricts it.
win_material  : capture every enemy piece of {"piece_type": <chess piece type>}.
king_zone     : force the enemy king onto one of {"squares": [...]} (sticky).
mobility      : cage the enemy king to <= {"max": n} legal moves, not in check.
approach      : bring your king within Chebyshev {"distance": n} of the enemy king.
checks        : deliver {"count": n} checks (cumulative).

Opponent modes
--------------
engine : Stockfish defends at the configured depth/skill (reused bot_engine).
script : predefined FEN->UCI responses (drill-specific move tree).
Both fall back to the model solution line, then to a defensive heuristic, so a
drill stays playable even when the Stockfish binary is unavailable.
"""

from __future__ import annotations

import chess

EDGE_SQUARES = [
    chess.square_name(s)
    for s in chess.SQUARES
    if chess.square_rank(s) in (0, 7) or chess.square_file(s) in (0, 7)
]
# A light-squared bishop mates in the light corners a8 / h1. Accept the 2x2
# corner region of either so the technique (not a specific corner) is rewarded.
LIGHT_CORNER_ZONE = ["a8", "b8", "a7", "b7", "h1", "g1", "h2", "g2"]
A8_CORNER = ["a8", "b8"]

CATEGORIES: list[dict] = [
    {
        "id": "rook",
        "title": "Rook & King vs King",
        "glyph": "♜",
        "accent": "emerald",
        "tagline": "The fundamental mate every player must own.",
        "description": (
            "Cut the board, box the king, and drive it to the edge. The rook and king "
            "force checkmate from any legal position — learn the technique that converts "
            "a winning endgame into a full point."
        ),
        "theory": (
            "A rook alone cannot mate, but rook + king always can. The rook cuts off ranks "
            "and files to shrink the enemy king's box; your king marches up to support it. "
            "When the kings stand in opposition with the rook on the far rank, the final "
            "check is mate. Never stalemate: a boxed king must always have a square."
        ),
    },
    {
        "id": "knights",
        "title": "Two Knights Endgame",
        "glyph": "♞",
        "accent": "sky",
        "tagline": "Coordination, king support — and the stalemate truth.",
        "description": (
            "Two knights cannot force mate against a lone king — but they can cage it, "
            "and mate appears the moment the defender errs or a pawn removes the stalemate "
            "defence. Train the patterns honestly."
        ),
        "theory": (
            "Against a lone king, two knights cannot force checkmate: the defender is "
            "stalemated before the mating net closes. Mate is only possible if the defender "
            "blunders into a net, or if a enemy pawn gives it a move (removing stalemate). "
            "These drills teach coordination, the cage, and the exact positions where mate "
            "is genuinely forced."
        ),
    },
    {
        "id": "bishop-knight",
        "title": "Bishop & Knight Checkmate",
        "glyph": "♝",
        "accent": "amber",
        "tagline": "The hardest fundamental mate — mastered step by step.",
        "description": (
            "Bishop and knight force mate, but only in the corner that matches the bishop's "
            "colour. Learn the W-pattern, drive the king across the board, and deliver the "
            "final blow without letting it slip into a draw."
        ),
        "theory": (
            "Bishop + knight vs king is a forced win, but the mate must happen in a corner "
            "of the bishop's colour (a light-squared bishop mates at a8 or h1). The king is "
            "driven to the wrong corner first, then transferred along the edge with the "
            "knight's W-pattern while the bishop and king seal the escape squares. It takes "
            "up to 33 moves — patience and precision win."
        ),
    },
    {
        "id": "pawn",
        "title": "Pawn Promotion",
        "glyph": "♟",
        "accent": "violet",
        "tagline": "Turn a single pawn into a queen — and a win.",
        "description": (
            "Opposition, the rule of the square, breakthroughs and pawn races. Convert pawn "
            "endgames by promoting, choose the right piece, avoid stalemate, and finish with "
            "the new queen."
        ),
        "theory": (
            "King + pawn vs king wins when your king leads the pawn and holds the opposition. "
            "A pawn outside the enemy king's square queens by force. In pawn-majority "
            "breakthroughs, sacrifice to create a passed pawn. Promote to a queen by default "
            "— but underpromote to a knight when it forks, or to avoid stalemate."
        ),
    },
]


def _drill(
    id: str,
    category: str,
    level: int,
    title: str,
    tagline: str,
    difficulty: str,
    fen: str,
    objective: dict,
    objective_label: str,
    max_moves: int,
    star_moves: list[int],
    est_minutes: int,
    instructions: list[str],
    tips: list[str],
    hints: list[str],
    solution_sans: list[str],
    opponent_depth: int = 10,
    opponent_skill: int = 20,
    strict: bool = False,
    script: dict | None = None,
    model_complete: bool = True,
) -> dict:
    return {
        "id": id,
        "category": category,
        "level": level,
        "title": title,
        "tagline": tagline,
        "difficulty": difficulty,
        "fen": fen,
        "player_color": "white",
        "objective": objective,
        "objective_label": objective_label,
        "max_moves": max_moves,
        "star_moves": star_moves,
        "est_minutes": est_minutes,
        "instructions": instructions,
        "tips": tips,
        "hints": hints,
        "solution_sans": solution_sans,
        "model_complete": model_complete,
        "strict": strict,
        "opponent": {
            "mode": "script" if script else "engine",
            "depth": opponent_depth,
            "skill": opponent_skill,
            "movetime_ms": 350,
            "script": script or {},
        },
    }


DRILLS: list[dict] = [
    # ============================ CATEGORY A: ROOK ============================
    _drill(
        "rook-1", "rook", 1, "Learn the Cut-Off",
        "Slice the board in half and send the king to the edge.",
        "Beginner",
        "8/8/8/4k3/8/2K5/8/3R4 w - - 0 1",
        {"type": "king_zone", "squares": EDGE_SQUARES},
        "Drive the black king to any edge square (rank 1/8 or file a/h).",
        14, [9, 14], 3,
        [
            "Your rook on d1 already cuts the d-file — the black king cannot cross it.",
            "March your king toward the enemy king to take away more squares.",
            "Use the rook to check from behind and shrink the box rank by rank.",
            "Keep driving until the black king touches any edge of the board.",
        ],
        [
            "A rook check from behind the king pushes it forward — never let it escape past your rook.",
            "Bring your king up; the rook alone cannot force the king anywhere.",
        ],
        [
            "The rook owns the d-file. Improve your king first, then check the black king toward the edge.",
            "Work on the kingside: your king belongs near e/f/g, and the rook checks from the d- or e-file.",
            "Play a rook check that forces the black king onto the 8th rank, like Rd4–d8 ideas.",
        ],
        ["Rd4", "Kf6", "Re4", "Kg7", "Rf4", "Kh8", "Rg4"],
    ),
    _drill(
        "rook-2", "rook", 2, "Restrict the King",
        "Build a box the enemy king cannot leave.",
        "Beginner",
        "8/8/8/4k3/8/1K6/8/6R1 w - - 0 1",
        {"type": "mobility", "max": 3},
        "Cage the black king so it has 3 or fewer legal moves (without giving check).",
        12, [5, 9], 3,
        [
            "Use the rook to cut off a file or rank, shrinking the king's available area.",
            "Step your king closer to cover the squares the rook cannot.",
            "Reduce the black king to three legal moves or fewer — a true cage, not a check.",
        ],
        [
            "Mobility is counted after your move. A check that forces the king away does not count — build a quiet cage.",
            "Rook on the 6th rank plus your king on b3/c4 already traps the king in a tiny box.",
        ],
        [
            "Cut the board with the rook, then squeeze with your king. Count the enemy king's escapes.",
            "The rook belongs on the 6th or 8th rank behind the king; your king covers the flight squares.",
            "Lift the rook to g6/g8 and bring your king to c4 — the box closes to three squares.",
        ],
        ["Rg6", "Kf4", "Rg8", "Ke3", "Rf8", "Ke4", "Kc4"],
    ),
    _drill(
        "rook-3", "rook", 3, "Drive the King to the Edge",
        "Your king is far away — bring it up and finish the job.",
        "Intermediate",
        "8/8/8/8/3k4/8/8/K6R w - - 0 1",
        {"type": "king_zone", "squares": EDGE_SQUARES},
        "Drive the black king to any edge square.",
        18, [11, 18], 4,
        [
            "The black king is central and your king is stranded on a1.",
            "Activate your king immediately — every tempo counts.",
            "Use the rook to cut files and check the king toward the board's edge.",
            "Coordinate king and rook to force the king onto rank 1/8 or file a/h.",
        ],
        [
            "Centralize your king along the b2–c3–d4 route while the rook keeps the king boxed.",
            "A rook on the 7th rank behind the king is a powerful driving tool.",
        ],
        [
            "First improve your worst piece — the king on a1. The rook can wait a move.",
            "March the king b2–c3–d4–e5; swing the rook to the 7th rank to push from behind.",
            "Play Kb2 and Rh7, then walk your king up while the rook checks the king to the 8th rank.",
        ],
        ["Kb2", "Kc4", "Rh7", "Kd4", "Rh4+", "Ke5", "Kc3", "Kf6", "Kd4", "Kg7",
         "Ke5", "Kf7", "Kf5", "Ke7", "Rd4", "Kf7", "Rd7+", "Ke8", "Ke6"],
    ),
    _drill(
        "rook-4", "rook", 4, "Rook Checkmate",
        "The full technique: box, drive, oppose, mate.",
        "Intermediate",
        "8/8/8/4k3/8/8/R7/K7 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate with rook and king.",
        22, [16, 22], 5,
        [
            "Combine everything: cut-off, box, king march and opposition.",
            "Drive the black king to the edge, then bring your king to opposition.",
            "When the kings face each other on the edge, slide the rook to the far rank for mate.",
            "Beware stalemate — a king in the corner must keep one square until the mating check.",
        ],
        [
            "The mating pattern: enemy king on the edge, your king in opposition two squares away, rook checks on the edge rank.",
            "If the enemy king steps toward the corner, wait with the rook; do not stalemate.",
        ],
        [
            "Drive the king to the 8th rank with the rook, then walk your king up to support the final check.",
            "Aim for opposition: your king on c6/b6 vs the black king on a8/b8, rook ready on the 5th.",
            "Reach king opposition near the edge and play the rook to the back rank — Ra5# is the typical finish.",
        ],
        ["Kb2", "Kd4", "Ra4+", "Kc5", "Kc2", "Kd6", "Kd3", "Kc5", "Rd4", "Kb5",
         "Rd5+", "Kb6", "Kd4", "Kc6", "Kc4", "Kb6", "Rc5", "Ka6", "Rb5", "Ka7",
         "Kc5", "Ka6", "Kc6", "Ka7", "Kc7", "Ka6", "Rc5", "Ka7", "Ra5#"],
    ),
    _drill(
        "rook-5", "rook", 5, "Master Challenge",
        "Mate against precise defence — no wasted tempi.",
        "Advanced",
        "8/8/8/8/4k3/8/8/KR6 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate against Stockfish's best defence.",
        24, [16, 24], 6,
        [
            "The defender now plays accurate, delaying moves.",
            "Execute the cut-off and king march efficiently — every wasted move is punished.",
            "Force the king to the edge, take opposition, and mate within the move budget.",
        ],
        [
            "Keep the rook active behind the king; do not let the enemy king slip past it.",
            "Opposition plus a back-rank rook check is the only mating pattern you need.",
        ],
        [
            "Activate the king at once and cut the king off with the rook on the 1st/4th rank.",
            "Drive toward the h-file corner; your king follows on the f/g files.",
            "Reach Kf2 vs Kh2 with the rook swinging to h4 — Rh4# finishes.",
        ],
        ["Rc1", "Kd4", "Ka2", "Ke5", "Kb3", "Ke4", "Kc3", "Kf5", "Ra1", "Ke4",
         "Ra5", "Kf4", "Kd3", "Kg4", "Ke3", "Kg3", "Ra4", "Kg2", "Rg4+", "Kh3",
         "Kf3", "Kh2", "Kf2", "Kh3", "Ra4", "Kh2", "Rh4#"],
        opponent_depth=12,
    ),

    # ========================== CATEGORY B: TWO KNIGHTS ==========================
    _drill(
        "knight-1", "knights", 1, "Knight Coordination",
        "Black blundered into a net — mate, do not stalemate.",
        "Beginner",
        "8/8/8/8/1N6/4N3/8/k1K5 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate. Careful — most moves here stalemate!",
        3, [1, 2], 2,
        [
            "Two knights cannot force mate against a lone king — but Black just blundered into a net.",
            "The black king on a1 already has no moves. Any quiet move stalemates and draws.",
            "Find the knight move that gives checkmate, keeping every escape square covered.",
        ],
        [
            "Both knights can jump to c2 with check, but only one keeps a2 covered — that one mates.",
            "This is the heart of the two-knights endgame: the line between mate and stalemate is one move.",
        ],
        [
            "Black has zero legal moves. You must give check — a quiet move is an instant draw.",
            "Look at c2: a knight there checks a1. Which knight leaves the a2 escape square covered?",
            "Play the e3-knight to c2 — Nec2# keeps a2 covered by the b4-knight.",
        ],
        ["Nec2#"],
        opponent_depth=8, strict=True,
    ),
    _drill(
        "knight-2", "knights", 2, "King Support",
        "Knights need their king — march it into the fight.",
        "Beginner",
        "8/8/3k4/8/8/2N1N3/8/K7 w - - 0 1",
        {"type": "approach", "distance": 2},
        "Bring your king within 2 squares of the black king.",
        10, [4, 7], 3,
        [
            "Knights alone cannot restrict a king — the king must lead.",
            "March your king from a1 toward the enemy king while the knights cover flight squares.",
            "Get your king within two squares (Chebyshev distance) of the black king.",
        ],
        [
            "Use the knights to check and herd the king toward your approaching king.",
            "Distance counts diagonals as one — a king on b2 is distance 2 from d4.",
        ],
        [
            "Your king is the slowest piece — start walking it now, knights can wait.",
            "Route the king b2–c3–d4 while a knight checks the enemy king toward you.",
            "Play Kb2, then Ned5 to herd the king, and close the distance with your king.",
        ],
        ["Kb2", "Ke5", "Ned5", "Kd4", "Ne7"],
    ),
    _drill(
        "knight-3", "knights", 3, "Restrict Escape Squares",
        "Weave a cage of knights and king.",
        "Intermediate",
        "8/8/8/8/1k6/8/1K6/2NN4 w - - 0 1",
        {"type": "mobility", "max": 2},
        "Cage the black king to 2 or fewer legal moves (without check).",
        12, [4, 8], 4,
        [
            "Two knights plus king can trap a king in a tiny cage — even though mate is not forced.",
            "Cover the escape squares with knights and your king working together.",
            "Reduce the black king to two legal moves or fewer, without giving check.",
        ],
        [
            "Knights cover squares of one colour; your king covers the rest. Coordinate them.",
            "A king on b2 plus knights on c3/b3 already leaves the black king almost no moves.",
        ],
        [
            "Build the cage around b4/c4: knights cover the jumps, your king covers the adjacent squares.",
            "Nc3 and Nb3 together with Kb2 seal almost everything — count the remaining escapes.",
            "Play Nc3, then Nb3 — the black king on c4 is left with only two squares.",
        ],
        ["Nc3", "Kc4", "Nb3"],
    ),
    _drill(
        "knight-4", "knights", 4, "Tactical Mating Opportunity",
        "A pawn removes the stalemate defence — mate is forced.",
        "Intermediate",
        "8/8/8/8/N7/p1K5/k2N4/8 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate — Black's own pawn makes it possible.",
        6, [3, 5], 4,
        [
            "Black has a pawn on a3. It blocks its own king's escape AND gives Black a pawn move.",
            "Because Black can always move the pawn, stalemate tricks disappear — mate is now forced.",
            "Drive the king to a1, force the pawn forward, and close the net with the knights.",
        ],
        [
            "This is the famous exception: two knights CAN force mate when the defender has a pawn.",
            "The pawn on a3 takes a3 away from the black king — use that.",
        ],
        [
            "Your king must cover b1/b2. Step it to c2 and the black king is forced to a1.",
            "After Kc2 Ka1, a knight move forces the a3-pawn to a2, blocking the last escape.",
            "Play Kc2, then Nc3 forcing a2, then Nb3# — the pawn on a2 seals the mate.",
        ],
        ["Kc2", "Ka1", "Nc3", "a2", "Nb3#"],
    ),
    _drill(
        "knight-5", "knights", 5, "Advanced Challenge",
        "Mate even when the defender promotes.",
        "Advanced",
        "1k6/2N1N3/8/1K6/8/p7/8/8 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate before Black's pawn saves the game.",
        8, [4, 6], 5,
        [
            "Black's a3-pawn races to promote. You must mate first.",
            "Seal the king on b8/a8 with your king and knights, then deliver the net.",
            "Even if Black promotes to a queen, the mate still works — find it.",
        ],
        [
            "The new queen on a1 cannot stop a knight mate that is already forced.",
            "Your king on b6 covers a7/b7/c7; the knights cover a8 and c8.",
        ],
        [
            "Step the king to b6 — Black's king is boxed and only the pawn can move.",
            "After a2, check with Na6+ forcing Ka8, then reposition a knight to c6.",
            "Play Kb6, a2, Na6+ Ka8, Nc6, and after a1=Q finish with Nc7#.",
        ],
        ["Kb6", "a2", "Na6+", "Ka8", "Nc6", "a1=Q", "Nc7#"],
    ),

    # ======================= CATEGORY C: BISHOP + KNIGHT =======================
    _drill(
        "bishop-knight-1", "bishop-knight", 1, "Control the Escape Squares",
        "Bishop diagonals plus knight jumps drive the king out.",
        "Beginner",
        "8/8/8/4k3/8/2K2B2/1N6/8 w - - 0 1",
        {"type": "king_zone", "squares": EDGE_SQUARES},
        "Drive the black king to any edge square.",
        18, [9, 15], 4,
        [
            "Your bishop on f3 is light-squared — it owns the long light diagonals.",
            "The knight covers squares the bishop cannot; together they shrink the king's area.",
            "March your king up and drive the black king to any edge.",
        ],
        [
            "A light-squared bishop can only ever mate in a light corner (a8 or h1).",
            "Centralize the king; bishop and knight herd best when the king supports them.",
        ],
        [
            "Improve the king first, then use the bishop to cut diagonals and the knight to check.",
            "Work the king toward e5/f6; the bishop belongs on the long diagonal aiming at the edge.",
            "Play Kc4–d5–e5–e6 and Be4/Bf3 to push the king to the 8th rank.",
        ],
        ["Nd3+", "Kf6", "Kc4", "Ke7", "Kd5", "Kf7", "Ke5", "Kg6", "Ke6", "Kg7",
         "Be4", "Kf8", "Bf3"],
    ),
    _drill(
        "bishop-knight-2", "bishop-knight", 2, "Move the King Toward the Corner",
        "The mate happens in the bishop's corner — aim for a8.",
        "Beginner",
        "8/8/k7/8/2K5/8/3NB3/8 w - - 0 1",
        {"type": "king_zone", "squares": A8_CORNER},
        "Drive the black king into the a8 corner (a8 or b8).",
        18, [5, 10], 4,
        [
            "Your light-squared bishop means the mating corner is a8 (or h1).",
            "The black king starts on a6 — drive it up the a-file toward a8.",
            "Use the bishop to cut the long diagonal and the king to cover the b-file escapes.",
        ],
        [
            "Discovered checks are powerful: moving your king off the bishop's diagonal unleashes check.",
            "Keep the king boxed against the a-file; do not let it run to the centre.",
        ],
        [
            "The bishop on e2 already eyes a6 through d3/c4/b5 — your king blocks it.",
            "Step the king off the diagonal to discover check and force the king upward.",
            "Play Kc5+ (discovered check), then Kd6 — the king is driven to a8.",
        ],
        ["Kc5+", "Kb7", "Kd6", "Ka8", "Kc7"],
    ),
    _drill(
        "bishop-knight-3", "bishop-knight", 3, "Bishop and Knight Coordination",
        "Weave the net: bishop, knight and king as one unit.",
        "Intermediate",
        "8/8/8/3k4/8/8/1K6/2BN4 w - - 0 1",
        {"type": "mobility", "max": 3},
        "Cage the black king to 3 or fewer legal moves (without check).",
        18, [6, 12], 5,
        [
            "The bishop covers one colour complex, the knight the other, the king the adjacent squares.",
            "Coordinate all three to shrink the black king's box.",
            "Reduce the king to three legal moves or fewer without checking it.",
        ],
        [
            "Centralize your king to d4/d5 — it is the anchor of the cage.",
            "The knight on f2 covers d3/d1/e4/g4; the bishop covers the light diagonals.",
        ],
        [
            "Walk the king c3–d4–d5 while the bishop and knight take away the outer squares.",
            "Aim for king d5, bishop c1, knight f2 — the box around the black king closes.",
            "Play Kc3, Kd4, Kd5 and Nf2 — the black king is left with three squares.",
        ],
        ["Kc3", "Ke6", "Kd4", "Kf6", "Kd5", "Kf5", "Nf2"],
    ),
    _drill(
        "bishop-knight-4", "bishop-knight", 4, "The Correct Corner",
        "The W-pattern: transfer the king from the wrong corner.",
        "Advanced",
        "7k/8/6K1/5N2/6B1/8/8/8 w - - 0 1",
        {"type": "king_zone", "squares": LIGHT_CORNER_ZONE},
        "Drive the black king to a light corner region (a8 or h1).",
        40, [28, 40], 8,
        [
            "The black king hides in h8 — a DARK corner, wrong for your light-squared bishop.",
            "You must transfer it to a light corner (a8 or h1) using the W-pattern.",
            "The knight traces a W along the edge while the bishop and king seal the escapes.",
            "This is the longest technique in chess — stay patient and keep the cage tight.",
        ],
        [
            "Never let the king escape to the centre; keep it pinned to the edge during the transfer.",
            "The knight's W-pattern (e.g. f5–g6–e5–d3–c4...) covers the key flight squares.",
        ],
        [
            "First tighten the cage around h8, then slide the king along the 8th rank toward a8.",
            "The bishop controls the long diagonal; the knight hops to cover the squares the bishop misses.",
            "Play Kf7 and Be2/Nh4 to box the king, then transfer it toward the a8 or h1 corner region.",
        ],
        ["Kf7", "Kh7", "Be2", "Kh8", "Nh4", "Kh7", "Ng6", "Kh6", "Kf6", "Kh7",
         "Bc4", "Kh6"],
        model_complete=False,
    ),
    _drill(
        "bishop-knight-5", "bishop-knight", 5, "Deliver Checkmate",
        "The complete bishop-and-knight mate against best defence.",
        "Advanced",
        "8/8/8/3k4/8/2K5/4B3/3N4 w - - 0 1",
        {"type": "checkmate"},
        "Deliver checkmate with bishop and king and knight.",
        45, [34, 45], 12,
        [
            "The full test: drive the king to the edge, transfer it to the correct corner, and mate.",
            "Your light-squared bishop mates at a8 or h1 — aim there.",
            "Use the W-pattern transfer and keep the king boxed at every step.",
            "Stockfish defends precisely; the mate can take up to 33 moves — budget your tempi.",
        ],
        [
            "The final pattern: king in the light corner, your king covering the escape, bishop and knight delivering the mate.",
            "If the king reaches the wrong corner, do not panic — transfer it along the edge.",
        ],
        [
            "Centralize the king and drive the black king to the edge with bishop + knight checks.",
            "Aim for the a8 corner: king c6/c7, bishop on the long diagonal, knight covering b8/d8.",
            "Reach the a8 corner with Kc7 and play Bc6# supported by the knight — the classic finish.",
        ],
        ["Bd3", "Ke6", "Kd4", "Kf7", "Ke5", "Ke7", "Bc4", "Kf8", "Kf6", "Ke8",
         "Be6", "Kf8", "Ne3", "Ke8", "Ke5", "Kf8", "Nf5", "Ke8", "Nh4", "Kf8",
         "Kf6", "Ke8", "Ng6", "Kd8", "Ke5", "Kc7", "Kd5", "Kb6", "Bd7", "Ka5",
         "Kc5", "Ka6", "Bc6", "Ka5", "Ne5", "Ka6", "Nc4", "Ka7", "Bd7", "Kb7",
         "Kd6", "Kb8", "Kc6", "Ka7", "Kc7", "Ka6", "Ba4", "Ka7", "Bb5", "Ka8",
         "Nd6", "Ka7", "Nc8+", "Ka8", "Bc6#"],
    ),

    # =========================== CATEGORY D: PAWN ===========================
    _drill(
        "pawn-1", "pawn", 1, "Opposition",
        "Lead with the king, hold the opposition, queen the pawn.",
        "Beginner",
        "3k4/8/3K4/3P4/8/8/8/8 w - - 0 1",
        {"type": "promote"},
        "Promote the d-pawn to a queen.",
        12, [5, 8], 2,
        [
            "Your king on d6 stands in front of the pawn — the winning setup.",
            "Hold the opposition: when the kings face each other, it is Black's move and Black must yield.",
            "Advance the pawn only when the king leads; queen it on d8.",
        ],
        [
            "King in front of the pawn + opposition = win. King beside or behind the pawn = draw.",
            "Do not push the pawn too early — the king must clear the way.",
        ],
        [
            "Your king already leads. Improve it to e6/d6 and push the pawn with check when possible.",
            "The key is Ke6 followed by d6+ — the pawn advances with tempo while the king leads.",
            "Play Ke6, then d6+, d7 and d8=Q — the king escorts the pawn home.",
        ],
        ["Ke6", "Kc7", "d6+", "Kb6", "d7", "Kc7", "Ke7", "Kb6", "d8=Q+"],
    ),
    _drill(
        "pawn-2", "pawn", 2, "The Rule of the Square",
        "The pawn is outside the king's square — it queens by force.",
        "Beginner",
        "8/8/8/8/1k5P/8/8/6K1 w - - 0 1",
        {"type": "promote"},
        "Promote the h-pawn before the black king catches it.",
        6, [4, 6], 2,
        [
            "Draw the pawn's square: from h4 to h8, then across to d8 and down to d4.",
            "The black king on b4 is OUTSIDE that square — it can never catch the pawn.",
            "Push the pawn straight down the h-file; your king is irrelevant here.",
        ],
        [
            "If the enemy king cannot enter the square, the pawn queens without help.",
            "Count: the pawn needs 4 moves; the king needs 5 to reach h8 — too slow.",
        ],
        [
            "Do not waste time with your king — the pawn wins the race alone.",
            "The square is h4–h8–d8–d4; the black king on b4 is one file too far.",
            "Push h5, h6, h7, h8=Q — four moves, the king cannot arrive in time.",
        ],
        ["h5", "Kc4", "h6", "Kd5", "h7", "Ke6", "h8=Q"],
    ),
    _drill(
        "pawn-3", "pawn", 3, "Create a Passed Pawn",
        "The classic three-pawn breakthrough.",
        "Intermediate",
        "7k/ppp5/8/PPP5/8/8/8/K7 w - - 0 1",
        {"type": "promote"},
        "Create a passed pawn and promote it.",
        8, [5, 7], 3,
        [
            "You have a 3-vs-3 pawn majority on the queenside; the kings are far away.",
            "Sacrifice to deflect the enemy pawns and create an unstoppable passed pawn.",
            "The breakthrough: push the middle pawn, then the side pawns break through.",
        ],
        [
            "1.b6! is the key: after ...axb6 2.c6! bxc6 3.a6 and the a-pawn queens.",
            "If Black takes the other way (...cxb6), then a6! bxa6 c6 wins instead.",
        ],
        [
            "A pawn breakthrough sacrifices pawns to create one that cannot be stopped.",
            "Push the b-pawn first — it deflects a black pawn and opens the path.",
            "Play b6, then c6 (or a6 depending on the capture), and queen the remaining pawn.",
        ],
        ["b6", "axb6", "c6", "bxc6", "a6", "Kg7", "a7", "Kf6", "a8=Q"],
    ),
    _drill(
        "pawn-4", "pawn", 4, "Pawn Promotion",
        "Underpromote to a knight — with check, winning the rook.",
        "Intermediate",
        "8/5P1r/6k1/8/8/8/P7/2K5 w - - 0 1",
        {"type": "win_material", "piece_type": chess.ROOK},
        "Win the black rook (promote with a knight fork).",
        3, [2, 3], 3,
        [
            "Your f7-pawn can promote. A queen wins slowly — but there is something better.",
            "Promote to a KNIGHT with check: it forks the black king on g6 and the rook on h7.",
            "After the king moves, capture the rook. Your a2-pawn then wins the game — underpromotion wins material instantly.",
        ],
        [
            "Underpromotion to a knight is correct when it comes with check and a fork.",
            "A new queen on f8 gives no check here; a knight on f8 checks g6 AND hits h7.",
        ],
        [
            "Look for a promotion that comes with check — it wins a tempo and a piece.",
            "A knight on f8 attacks g6 (check) and h7 (the rook) at the same time.",
            "Play f8=N+! and after the king moves, Nxh7 wins the rook.",
        ],
        ["f8=N+", "Kg7", "Nxh7"],
        opponent_depth=8, strict=True,
    ),
    _drill(
        "pawn-5", "pawn", 5, "Promotion to Checkmate",
        "Queen the pawn, then convert with king and queen.",
        "Advanced",
        "8/3kP3/5K2/8/8/8/8/8 w - - 0 1",
        {"type": "checkmate"},
        "Promote and deliver checkmate with the new queen.",
        16, [10, 14], 5,
        [
            "Your e7-pawn is ready, but the black king on d7 watches the promotion square.",
            "Support the promotion with your king first — do not let the king capture the new queen.",
            "After queening, use king + queen to drive the king to the edge and mate.",
            "Avoid stalemate when the enemy king reaches the edge.",
        ],
        [
            "1.Kf7! supports e8=Q. Pushing immediately lets ...Kxe8 draw.",
            "Queen + king mate: shrink the box with the queen, bring the king, then mate on the edge.",
        ],
        [
            "The promotion must be supported — improve your king to f7 first.",
            "After e8=Q+, drive the king with queen checks and your king, aiming for the edge.",
            "Play Kf7, e8=Q+, then box the king with Qe3/Qd4 and finish with Qb7#.",
        ],
        ["Kf7", "Kc6", "e8=Q+", "Kd5", "Qe3", "Kd6", "Qd4+", "Kc7", "Ke6", "Kb8",
         "Qb4+", "Ka7", "Kd5", "Ka6", "Kc6", "Ka7", "Qb7#"],
    ),
]

DRILL_BY_ID: dict[str, dict] = {d["id"]: d for d in DRILLS}
CATEGORY_BY_ID: dict[str, dict] = {c["id"]: c for c in CATEGORIES}


def drills_in_category(category_id: str) -> list[dict]:
    return [d for d in DRILLS if d["category"] == category_id]


def next_drill_id(drill_id: str) -> str | None:
    d = DRILL_BY_ID.get(drill_id)
    if not d:
        return None
    siblings = drills_in_category(d["category"])
    for i, s in enumerate(siblings):
        if s["id"] == drill_id and i + 1 < len(siblings):
            return siblings[i + 1]["id"]
    return None


def previous_drill_id(drill_id: str) -> str | None:
    d = DRILL_BY_ID.get(drill_id)
    if not d or d["level"] <= 1:
        return None
    siblings = drills_in_category(d["category"])
    for s in siblings:
        if s["level"] == d["level"] - 1:
            return s["id"]
    return None