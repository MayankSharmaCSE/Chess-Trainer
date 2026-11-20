"""EndgameDrillGenerator — orchestrates generation, validation, verification,
anti-repetition history and a verified in-memory pool.

Flow per request:
  1. Serve a pooled, verified challenge the user has not seen recently.
  2. Otherwise generate candidates (scenario generators), run PositionValidator
     then SolutionValidator (Stockfish / python-chess), discard failures.
  3. Reject ids in the recent-history window (never the immediately previous one).
  4. Fall back to symmetry orbits of verified curated seeds (always solvable).
"""

from __future__ import annotations

import hashlib
import json
import random
import threading

import chess
from sqlalchemy.orm import Session

from app.services.endgame_gen import difficulty as dm
from app.services.endgame_gen import history, symmetry, validator
from app.services.endgame_gen.generators import GENERATORS, H3

_POOL: dict[tuple[str, str], list[dict]] = {}
_POOL_CAP = 40
_LOCK = threading.Lock()

_SEED_BASE = {"rook": (22, 16, 22, 5), "knights": (6, 3, 5, 4),
              "bishop-knight": (40, 30, 40, 12), "pawn": (16, 10, 14, 5)}


def challenge_id(fen: str, objective: dict, difficulty: str) -> str:
    payload = fen + "|" + json.dumps(objective, sort_keys=True) + "|" + difficulty
    return "gen-" + hashlib.sha1(payload.encode()).hexdigest()[:12]


def _verify_candidate(cand: dict) -> bool:
    board = chess.Board(cand["fen"])
    ok, _reason = validator.structural_ok(board, cand["category"], cand["objective"], cand.get("_material"))
    if not ok:
        return False
    kind = cand["_verify"]
    if kind[0] in ("short_mate", "mate"):
        depth = kind[2] if len(kind) > 2 else 12
        sans = validator.verify_short_mate(cand["fen"], kind[1], depth=depth)
        if not sans:
            return False
        cand["solution_sans"] = sans
        cand["model_complete"] = True
    elif kind[0] == "winning":
        min_cp = kind[1] if len(kind) > 1 else 120
        if not validator.verify_winning(cand["fen"], min_cp=min_cp):
            return False
    elif kind[0] == "drawish":
        max_cp = kind[1] if len(kind) > 1 else 80
        if not validator.verify_drawish(cand["fen"], max_cp=max_cp):
            return False
    elif kind[0] == "objective":
        if not validator.verify_objective_reachable(cand["fen"], cand["objective"], cand["max_moves"]):
            return False
    elif kind[0] == "promotion":
        if not validator.verify_promotion_reachable(cand["fen"], cand["max_moves"]):
            return False
    elif kind[0] == "fork":
        if not validator.verify_fork_wins_rook(cand["fen"]):
            return False
    # "seed": solution already verified by symmetry replay.
    return True


def _seed_fallback_drill(category: str, diff: str, seed_id: str, k: int) -> dict | None:
    t = symmetry.transform_seed(seed_id, k)
    if not t:
        return None
    base_max, three, two, est = _SEED_BASE[category]
    p = dm.profile(diff)
    bk = chess.Board(t["fen"]).king(chess.BLACK)
    tag = chess.square_name(bk) if bk is not None else ""
    return {
        "id": "", "category": category, "level": 0,
        "title": f"Verified Mate Challenge · {tag}", "tagline": "A proven mating position, freshly oriented.",
        "difficulty": diff, "fen": t["fen"], "player_color": "white",
        "objective": {"type": "checkmate"}, "objective_label": "Deliver checkmate.",
        "max_moves": dm.budget(base_max, diff), "star_moves": dm.star_moves(three, two, diff),
        "est_minutes": est,
        "instructions": ["Drive the enemy king to the edge / correct corner.",
                         "Coordinate your pieces with king support.", "Deliver checkmate; avoid stalemate."],
        "tips": ["Keep the enemy king boxed.", "Bring your king up to support the final mate."],
        "hints": ["Shrink the enemy king's space step by step.",
                  "Coordinate your attacking pieces around the king.", H3],
        "solution_sans": t["solution_sans"], "model_complete": True, "strict": False,
        "generated": True, "hint_max": p["hint_max"],
        "opponent": {"mode": "engine", "depth": p["opponent_depth"], "skill": p["opponent_skill"],
                     "movetime_ms": 300, "script": {}},
        "_verify": ("seed",),
    }


def generate(db: Session, user_id: int, category: str, difficulty: str | None = None,
             subcategory: str | None = None) -> dict:
    """Generate a fresh verified challenge.

    `subcategory` selects a generator from the new Chess.com-style taxonomy
    (history/pool are then keyed per subcategory); without it the legacy
    four-category generators are used.
    """
    diff = dm.normalize(difficulty)
    if subcategory:
        from app.services.endgame_gen.endgames import SUBGENERATORS
        from app.services.endgame_gen.taxonomy import SUBCATEGORY_BY_ID

        if subcategory not in SUBGENERATORS:
            raise ValueError(f"Unknown subcategory: {subcategory}")
        category = SUBCATEGORY_BY_ID[subcategory]["category"]
        hist_key = subcategory
        pool_key = (subcategory, diff)
        gen_fn = SUBGENERATORS[subcategory]

        def candidates(rng):
            return gen_fn(rng, diff)
    else:
        hist_key = category
        pool_key = (category, diff)
        gen = GENERATORS.get(category)

        def candidates(rng):
            return gen.candidates(rng, diff) if gen is not None else iter(())

    recent = set(history.recent_ids(db, user_id, hist_key))
    last = history.last_id(db, user_id, hist_key)
    rng = random.Random()

    with _LOCK:
        pool = _POOL.setdefault(pool_key, [])
        for d in pool:
            if d["id"] not in recent and d["id"] != last:
                history.record(db, user_id, hist_key, d["id"])
                return d

    for _ in range(14):
        for cand in candidates(rng):
            if cand is None:
                continue
            if not _verify_candidate(cand):
                continue
            cid = challenge_id(cand["fen"], cand["objective"], diff)
            if cid in recent or cid == last:
                continue
            cand["id"] = cid
            cand["challenge_id"] = cid
            with _LOCK:
                pool = _POOL.setdefault(pool_key, [])
                pool.append(cand)
                if len(pool) > _POOL_CAP:
                    del pool[0]
            history.record(db, user_id, hist_key, cid)
            return cand

    # Fallback: symmetry orbits of verified seeds (legacy categories only).
    if not subcategory:
        for seed_id in symmetry.MATE_SEEDS.get(category, []):
            for k in range(8):
                d = _seed_fallback_drill(category, diff, seed_id, k)
                if d is None:
                    continue
                cid = challenge_id(d["fen"], d["objective"], diff)
                if cid in recent or cid == last:
                    continue
                d["id"] = cid
                d["challenge_id"] = cid
                with _LOCK:
                    _POOL.setdefault(pool_key, []).append(d)
                history.record(db, user_id, hist_key, cid)
                return d

    # Last resort: relax history but never repeat the immediately previous challenge.
    with _LOCK:
        for d in _POOL.get(pool_key, []):
            if d["id"] != last:
                history.record(db, user_id, hist_key, d["id"])
                return d
    if not subcategory:
        for seed_id in symmetry.MATE_SEEDS.get(category, []):
            d = _seed_fallback_drill(category, diff, seed_id, 0)
            if d and d["fen"]:
                cid = challenge_id(d["fen"], d["objective"], diff)
                if cid == last:
                    continue
                d["id"] = cid
                d["challenge_id"] = cid
                history.record(db, user_id, hist_key, cid)
                return d
    raise RuntimeError("Could not generate a valid challenge.")