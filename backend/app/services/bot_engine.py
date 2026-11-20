"""Stockfish UCI Engine Integration for AI Chess Bot Arena.

Uses direct subprocess-based UCI communication with Stockfish 16+
for cross-platform reliability, fast response times, and customizable bot strength.
"""

from __future__ import annotations

import logging
import math
import os
import random
import re
import shutil
import subprocess
import time
from typing import Any

import chess
import chess.pgn

from app.core.config import ANALYSIS_MAX_DEPTH, STOCKFISH_PATH

logger = logging.getLogger(__name__)

MATE_CP = 100_000
BLUNDER_MIN = 300
MISTAKE_MIN = 100
INACCURACY_MIN = 50


def resolve_stockfish_path(configured_path: str = STOCKFISH_PATH) -> str:
    """Resolve the Stockfish executable path, checking common locations if missing."""
    if configured_path and os.path.isfile(configured_path):
        return configured_path

    # Try path normalized
    norm = os.path.normpath(configured_path)
    if os.path.isfile(norm):
        return norm

    # Common fallback paths in project workspace
    candidates = [
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
            "stockfish",
            "stockfish",
            "stockfish-windows-x86-64-universal.exe",
        ),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "stockfish",
            "stockfish",
            "stockfish-windows-x86-64-universal.exe",
        ),
        r"C:\Users\Babat\Desktop\Chess-Trainer 2\stockfish\stockfish\stockfish-windows-x86-64-universal.exe",
        "stockfish",
    ]

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate

    found = shutil.which("stockfish")
    if found:
        return found

    return configured_path


class StockfishUCIProcess:
    """Manages a single UCI session with the Stockfish process."""

    def __init__(self, binary_path: str | None = None, timeout: float = 6.0):
        self.path = resolve_stockfish_path(binary_path or STOCKFISH_PATH)
        self.timeout = timeout
        self.proc: subprocess.Popen[str] | None = None
        self._start_process()

    def _start_process(self) -> None:
        if not os.path.isfile(self.path):
            raise FileNotFoundError(f"Stockfish binary not found at '{self.path}'.")

        self.proc = subprocess.Popen(
            [self.path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            encoding="utf-8",
        )
        self.send("uci")
        self._wait_for("uciok")
        self.send("isready")
        self._wait_for("readyok")

    def send(self, command: str) -> None:
        if not self.proc or not self.proc.stdin:
            raise RuntimeError("Engine process is not running.")
        self.proc.stdin.write(command + "\n")
        self.proc.stdin.flush()

    def _readline(self) -> str:
        if not self.proc or not self.proc.stdout:
            return ""
        return self.proc.stdout.readline()

    def _wait_for(self, marker: str) -> list[str]:
        lines: list[str] = []
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            line = self._readline()
            if not line:
                time.sleep(0.01)
                continue
            line_str = line.strip()
            lines.append(line_str)
            if marker in line_str:
                return lines
        raise TimeoutError(f"Engine timed out waiting for '{marker}'.")

    def configure(
        self,
        skill_level: int = 20,
        uci_limit_strength: bool = False,
        uci_elo: int | None = None,
        threads: int = 1,
        hash_mb: int = 16,
    ) -> None:
        """Apply UCI options for difficulty configuration."""
        self.send(f"setoption name Threads value {threads}")
        self.send(f"setoption name Hash value {hash_mb}")
        self.send(f"setoption name Skill Level value {max(0, min(20, skill_level))}")

        if uci_limit_strength and uci_elo:
            # Stockfish 16+ UCI_Elo limits are typically 1320..3190
            clamped_elo = max(1320, min(3190, uci_elo))
            self.send("setoption name UCI_LimitStrength value true")
            self.send(f"setoption name UCI_Elo value {clamped_elo}")
        else:
            self.send("setoption name UCI_LimitStrength value false")

        self.send("isready")
        self._wait_for("readyok")

    def get_best_move(
        self,
        fen: str,
        depth: int = 5,
        movetime_ms: int = 300,
    ) -> str:
        """Find the best move for the position."""
        self.send(f"position fen {fen}")
        cmd = f"go depth {max(1, depth)} movetime {max(50, movetime_ms)}"
        self.send(cmd)

        deadline = time.time() + (movetime_ms / 1000.0) + self.timeout
        while time.time() < deadline:
            line = self._readline().strip()
            if line.startswith("bestmove"):
                parts = line.split()
                if len(parts) >= 2:
                    return parts[1]
                break

        raise TimeoutError("Engine timed out generating best move.")

    def evaluate_position(self, fen: str, depth: int = 10) -> dict[str, Any]:
        """Evaluate a position and return score (side-to-move POV cp/mate), best move, and PV.

        The PV is taken from the deepest `info ... pv` line of THIS search only
        (the process is created fresh per analysis, so no stale response can
        leak in). Lower-depth iterations never overwrite a deeper PV.
        """
        self.send(f"position fen {fen}")
        self.send(f"go depth {max(1, depth)}")

        score_cp: int | None = 0
        mate_moves: int | None = None
        best_uci: str | None = None
        pv_ucis: list[str] = []
        pv_depth = 0

        deadline = time.time() + self.timeout
        while time.time() < deadline:
            line = self._readline().strip()
            if line.startswith("info") and "score" in line:
                tokens = line.split()
                info_depth = 0
                if "depth" in tokens:
                    try:
                        info_depth = int(tokens[tokens.index("depth") + 1])
                    except (ValueError, IndexError):
                        info_depth = 0
                if "cp" in tokens:
                    cp_idx = tokens.index("cp")
                    score_cp = int(tokens[cp_idx + 1])
                    mate_moves = None
                elif "mate" in tokens:
                    mate_idx = tokens.index("mate")
                    mate_moves = int(tokens[mate_idx + 1])
                    score_cp = None

                if "pv" in tokens and info_depth >= pv_depth:
                    pv_idx = tokens.index("pv")
                    # Capture the FULL principal variation (mate drills need the
                    # complete mating line, not just the first few plies).
                    candidate = [
                        t for t in tokens[pv_idx + 1:]
                        if re.fullmatch(r"[a-h][1-8][a-h][1-8][qrbn]?", t)
                    ]
                    if candidate:
                        pv_ucis = candidate
                        pv_depth = info_depth

            if line.startswith("bestmove"):
                parts = line.split()
                if len(parts) >= 2 and re.fullmatch(r"[a-h][1-8][a-h][1-8][qrbn]?", parts[1]):
                    best_uci = parts[1]
                break

        return {
            "score_cp": score_cp,
            "mate_moves": mate_moves,
            "best_uci": best_uci,
            "pv_ucis": pv_ucis,
            "depth": pv_depth,
        }

    def close(self) -> None:
        try:
            if self.proc and self.proc.poll() is None:
                self.send("quit")
                self.proc.terminate()
                self.proc.wait(timeout=1.0)
        except Exception:
            pass
        finally:
            self.proc = None

    def __enter__(self) -> StockfishUCIProcess:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


def generate_bot_move(
    fen: str,
    skill_level: int = 5,
    depth: int = 5,
    movetime_ms: int = 300,
    uci_limit_strength: bool = False,
    uci_elo: int | None = None,
    bot_rating: int = 1000,
) -> str:
    """Generate an engine move tailored to the bot's difficulty level."""
    board = chess.Board(fen)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise ValueError("No legal moves available in this position.")

    # Single legal move (e.g. forced response or only out of check)
    if len(legal_moves) == 1:
        return legal_moves[0].uci()

    # Beginner / Casual human-like blunder injection:
    # 400 rating: 35% chance of suboptimal move
    # 600 rating: 20% chance
    # 800 rating: 8% chance
    blunder_chance = 0.0
    if bot_rating <= 450:
        blunder_chance = 0.35
    elif bot_rating <= 650:
        blunder_chance = 0.20
    elif bot_rating <= 850:
        blunder_chance = 0.08

    if random.random() < blunder_chance and len(legal_moves) > 1:
        # Choose a casual / natural move among non-catastrophic legal moves
        candidate = random.choice(legal_moves)
        return candidate.uci()

    with StockfishUCIProcess() as engine:
        engine.configure(
            skill_level=skill_level,
            uci_limit_strength=uci_limit_strength,
            uci_elo=uci_elo,
        )
        move_uci = engine.get_best_move(fen=fen, depth=depth, movetime_ms=movetime_ms)

        # Validate engine move legality on the current board
        try:
            chess_move = chess.Move.from_uci(move_uci)
            if chess_move in board.legal_moves:
                return move_uci
        except ValueError:
            pass

        # Fallback to first legal move if engine output is invalid
        return legal_moves[0].uci()


def classify_loss(cp_loss: int) -> str | None:
    if cp_loss >= BLUNDER_MIN:
        return "BLUNDER"
    if cp_loss >= MISTAKE_MIN:
        return "MISTAKE"
    if cp_loss >= INACCURACY_MIN:
        return "INACCURACY"
    return None


def calculate_accuracy(mean_cp_loss: float) -> float:
    """Compute standard chess accuracy percentage from mean centipawn loss."""
    if mean_cp_loss <= 0:
        return 99.5
    acc = 103.1668 * math.exp(-0.00435 * mean_cp_loss) - 3.1669
    return round(max(5.0, min(100.0, acc)), 1)


def analyze_bot_game(
    pgn: str,
    user_color: str = "white",
    depth: int = 12,
) -> dict[str, Any]:
    """Run full post-game analysis on a bot game using Stockfish."""
    game = chess.pgn.read_game(__import__("io").StringIO(pgn))
    if game is None:
        raise ValueError("Could not parse game PGN.")

    moves = list(game.mainline_moves())
    board = game.board()
    positions = [board.copy()]
    for m in moves:
        board.push(m)
        positions.append(board.copy())

    analysis_results: list[dict[str, Any]] = []
    user_losses: list[int] = []
    counts = {"BLUNDER": 0, "MISTAKE": 0, "INACCURACY": 0}

    with StockfishUCIProcess() as engine:
        # Evaluate all positions
        evals: list[dict[str, Any]] = []
        for pos in positions:
            eval_info = engine.evaluate_position(pos.fen(), depth=depth)
            evals.append(eval_info)

    best_move_ply: int | None = None
    worst_move_ply: int | None = None
    max_user_loss = -1

    for i, move in enumerate(moves):
        pos = positions[i]
        mover_is_white = pos.turn == chess.WHITE
        is_user = user_color in ("white", "black") and ((user_color == "white") == mover_is_white)

        ev_before = evals[i]
        ev_after = evals[i + 1]

        # Convert to mover perspective score
        def _to_mover_val(ev: dict[str, Any]) -> int:
            if ev["mate_moves"] is not None:
                m = ev["mate_moves"]
                w_wins = m > 0
                return MATE_CP if w_wins == mover_is_white else -MATE_CP
            cp = ev["score_cp"] or 0
            return cp if mover_is_white else -cp

        val_before = _to_mover_val(ev_before)
        val_after = _to_mover_val(ev_after)
        cp_loss = max(0, val_before - val_after)

        cls = classify_loss(cp_loss)
        if is_user:
            user_losses.append(cp_loss)
            if cls:
                counts[cls] += 1
            if cp_loss > max_user_loss:
                max_user_loss = cp_loss
                worst_move_ply = i + 1
            if cp_loss == 0 and best_move_ply is None:
                best_move_ply = i + 1

        # PV SANs
        pv_sans: list[str] = []
        pv_board = pos.copy()
        for u in ev_before.get("pv_ucis", []):
            try:
                cm = chess.Move.from_uci(u)
                if cm in pv_board.legal_moves:
                    pv_sans.append(pv_board.san(cm))
                    pv_board.push(cm)
            except Exception:
                break

        best_san = None
        if ev_before.get("best_uci"):
            try:
                best_m = chess.Move.from_uci(ev_before["best_uci"])
                if best_m in pos.legal_moves:
                    best_san = pos.san(best_m)
            except Exception:
                pass

        analysis_results.append(
            {
                "ply": i + 1,
                "played_san": pos.san(move),
                "played_uci": move.uci(),
                "best_san": best_san,
                "best_uci": ev_before.get("best_uci"),
                "pv_sans": pv_sans,
                "eval_before_cp": ev_before.get("score_cp"),
                "mate_before": ev_before.get("mate_moves"),
                "eval_after_cp": ev_after.get("score_cp"),
                "mate_after": ev_after.get("mate_moves"),
                "cp_loss": cp_loss,
                "classification": cls,
                "is_user_move": is_user,
            }
        )

    mean_loss = (sum(user_losses) / len(user_losses)) if user_losses else 0.0
    accuracy = calculate_accuracy(mean_loss) if user_losses else 85.0

    # Best move SAN and worst move SAN
    best_move_san = None
    worst_move_san = None
    if best_move_ply:
        best_move_san = analysis_results[best_move_ply - 1]["played_san"]
    elif analysis_results:
        best_move_san = analysis_results[0]["played_san"]

    if worst_move_ply and max_user_loss >= INACCURACY_MIN:
        worst_move_san = analysis_results[worst_move_ply - 1]["played_san"]

    return {
        "accuracy": accuracy,
        "mean_cp_loss": round(mean_loss, 1),
        "blunders": counts["BLUNDER"],
        "mistakes": counts["MISTAKE"],
        "inaccuracies": counts["INACCURACY"],
        "best_move": best_move_san,
        "worst_move": worst_move_san,
        "moves": analysis_results,
    }
