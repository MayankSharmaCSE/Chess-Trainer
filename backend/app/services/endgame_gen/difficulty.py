"""DifficultyManager — difficulty must change the generated position, not just a label.

Controls: scenario complexity / piece distances, move budget, opponent engine
strength, hint allowance and star thresholds.
"""

from __future__ import annotations

DIFFICULTIES = ("Beginner", "Intermediate", "Advanced")

_PROFILES = {
    "Beginner": {
        "opponent_depth": 6,
        "opponent_skill": 6,
        "budget_mult": 1.7,
        "hint_max": 3,
        "mate_cap": 2,          # constructive short mates mate-in <= 2
        "close_kings": True,    # attacking king near the action
        "star_lenient": 1.5,
    },
    "Intermediate": {
        "opponent_depth": 10,
        "opponent_skill": 14,
        "budget_mult": 1.25,
        "hint_max": 3,
        "mate_cap": 3,
        "close_kings": False,
        "star_lenient": 1.2,
    },
    "Advanced": {
        "opponent_depth": 14,
        "opponent_skill": 20,
        "budget_mult": 1.0,
        "hint_max": 2,          # limited hints: best-move only via Reveal
        "mate_cap": 4,
        "close_kings": False,
        "star_lenient": 1.0,
    },
}


def profile(difficulty: str) -> dict:
    return _PROFILES.get(difficulty, _PROFILES["Intermediate"])


def normalize(difficulty: str | None) -> str:
    if difficulty in _PROFILES:
        return difficulty
    return "Intermediate"


def budget(base: int, difficulty: str) -> int:
    return max(2, int(round(base * profile(difficulty)["budget_mult"])))


def star_moves(base_three: int, base_two: int, difficulty: str) -> list[int]:
    m = profile(difficulty)["star_lenient"]
    return [max(1, int(round(base_three * m))), max(2, int(round(base_two * m)))]