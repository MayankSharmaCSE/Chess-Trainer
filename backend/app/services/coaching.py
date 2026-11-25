"""US-009 Option B: LLM grounded coaching for drills.

Stockfish supplies ALL chess facts (FEN, best move, PV, eval swing, the
player's mistake). The LLM only turns that evidence into 2-3 lines of
human coaching. No chess evaluation happens in the LLM, so no training or
fine-tuning is needed.

Safety: HINT mode never sends best move / PV to the provider, so a leak is
impossible at the prompt level, not just the instruction level. The model
still sees the FEN and could find the move on its own, so every hint is
post-validated and discarded (-> rules-v1) if it names the best move.

Cost: the route caches results per drill+level. A hint costs at most one
provider call (spoiler -> rules-v1, no retry); a reveal at most two (one
retry when the reply forgets to name the best move).
"""

import logging
import re
from dataclasses import dataclass

import httpx

from app.core.config import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_FALLBACK_MODELS,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_REASONING_EFFORT,
    LLM_TIMEOUT_S,
)
from app.models.analysis import MoveAnalysis
from app.models.game import Game
from app.services.explanations import explain_move, mistake_line

# WARNING+ reaches the uvicorn terminal (Python's last-resort handler), so a
# fallback to rules-v1 always says why instead of failing silently.
logger = logging.getLogger("chesslens.coaching")

SYSTEM_PROMPT = """You are a chess coach inside the ChessLens training app. You explain ONE
position per reply. You never analyse from scratch: all chess facts come
from the Stockfish evidence given in the user message. Trust it completely.

STRICT GROUNDING RULES
1. Use ONLY the facts provided (FEN, best move, principal variation,
   evaluation swing, the player's mistake). Never invent moves, lines,
   evaluations, or threats not present in the evidence.
2. If the evidence looks unclear or contradictory, say so in one line
   instead of guessing.
3. HINT mode: NEVER name, spell, or describe the best move or any concrete
   winning line. Only point at the theme: which piece is loose, which king
   is exposed, what idea to look for. End with one guiding question.
4. REVEAL mode: name the best move in the first sentence, then explain its
   idea in plain language, then contrast it with the player's actual move
   in one line.
5. Second person ("you", "your"). Beginner-friendly words, no engine jargon
   like "centipawns" or "MultiPV". Say "about half a pawn better", not "+50cp".

FORMAT
- HINT: exactly 2 lines. Line 1: theme/observation. Line 2: guiding question.
- REVEAL: exactly 3 lines. Line 1: best move + what it does. Line 2: the
  follow-up idea from the principal variation. Line 3: why your move fell short.
- Plain text only. No headings, no bullet points, no markdown, no emojis.
- English, unless the user message says LANG=HINDI, in which case reply in
  simple Hinglish (Roman script)."""

FALLBACK_HINT = (
    "Look for the loosest piece or the most exposed king first. "
    "Which of your opponent's pieces has the fewest defenders?"
)
HINT_QUESTION = (
    "Look for the loosest piece or the most exposed king first: "
    "which move keeps the balance instead?"
)
THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

RULES_SOURCE = "rules-v1"
LLM_SOURCE = "llm"
NOT_CONFIGURED_DETAIL = "AI coaching not configured"
MAX_TEXT_LEN = 1200


@dataclass(frozen=True)
class CoachingResult:
    text: str
    source: str  # llm | rules-v1
    # False after a transport error (timeout, 5xx, bad JSON) so a later
    # request retries the provider instead of serving rules-v1 forever.
    cacheable: bool


def is_configured() -> bool:
    return bool(LLM_API_KEY)


def build_user_message(
    *,
    level: str,
    fen_before: str,
    side_to_move: str,
    played_san: str,
    classification: str,
    cp_loss: int | None,
    phase: str,
    opening: str | None,
    best_san: str | None = None,
    pv_sans: list[str] | None = None,
    eval_before: str = "unknown",
    eval_after: str = "unknown",
    lang: str = "ENGLISH",
) -> str:
    """Build the evidence message, following the Option B template line for line.

    HINT mode omits BEST MOVE + PRINCIPAL VARIATION entirely (prompt-level
    safety). Evals arrive already flipped to the player's side; the short
    "(from your side)" note stops the model reading Black's swing backwards.
    """
    loss = f"{(cp_loss or 0) / 100:.1f}" if cp_loss is not None else "unknown"
    lines = [
        f"MODE: {level.upper()}",
        f"POSITION FEN: {fen_before}",
        f"SIDE TO MOVE: {side_to_move}",
        f"YOUR MISTAKE: {played_san} ({classification}, lost ~{loss} pawns, {phase}, {opening or 'unknown opening'})",
    ]
    if level == "reveal":
        lines.append(f"BEST MOVE: {best_san or 'unknown'}")
        if pv_sans:
            lines.append(f"PRINCIPAL VARIATION: {' '.join(pv_sans)}")
    lines.append(f"EVAL SWING: {eval_before} -> {eval_after} (from your side)")
    if lang.upper() == "HINDI":
        lines.append("LANG=HINDI")
    return "\n".join(lines)


def _call_provider(system: str, user: str) -> str:
    """One Chat Completions call over httpx. Raises on transport/API errors."""
    return complete(system, user)[0]


def complete(system: str, user: str) -> tuple[str, str | None]:
    """Chat Completions call -> (reply text, model that actually answered).

    Shared by coaching and the live health check so both send identical
    settings. Raises on transport/API errors and on empty replies.
    """
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "max_tokens": LLM_MAX_TOKENS,
    }
    if LLM_REASONING_EFFORT:
        payload["reasoning_effort"] = LLM_REASONING_EFFORT
    if LLM_FALLBACK_MODELS:
        # OpenRouter: `model` is tried first, then these in order on any error
        # (including upstream 429s on shared :free pools).
        payload["models"] = LLM_FALLBACK_MODELS
    resp = httpx.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {LLM_API_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=LLM_TIMEOUT_S,
    )
    resp.raise_for_status()
    data = resp.json()
    used = data.get("model")
    if LLM_FALLBACK_MODELS and used and not str(used).startswith(LLM_MODEL.split(":")[0]):
        logger.warning("AI coaching: %s unavailable, answered by fallback %s", LLM_MODEL, used)
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message", {})
    raw = message.get("content") or ""
    # Thinking models may inline their reasoning; it must never reach the UI.
    text = THINK_BLOCK.sub("", raw)
    if "<think>" in text.lower():  # reasoning cut off before it closed
        text = text[: text.lower().index("<think>")]
    text = text.strip()
    if not text:
        thought = bool(message.get("reasoning") or message.get("reasoning_content") or "<think>" in raw.lower())
        raise ValueError(
            f"Empty reply (finish_reason={choice.get('finish_reason')}, model was thinking: {thought}). "
            + ("Set LLM_REASONING_EFFORT (e.g. none/low) or raise LLM_MAX_TOKENS." if thought else "")
        )
    return text, used


def _san_core(san: str) -> str:
    """Strip check/mate/annotation suffixes: 'Qh5+' -> 'Qh5', 'Nf3!?' -> 'Nf3'."""
    return san.strip().rstrip("+#!?")


def mentions_move(text: str, best_san: str | None, best_uci: str | None = None, *, strict_case: bool) -> bool:
    """True if `text` names the move as SAN (with or without +/#), UCI, or castling.

    Boundaries stop false matches inside other moves: best 'e4' is not found
    in 'Qe4'. strict_case=False is the conservative spoiler check (it also
    treats 'bxc3' and 'Bxc3' as the same move).
    """
    if not text:
        return False
    core = _san_core(best_san or "")
    needles = [n for n in (core, (best_uci or "").strip()) if n]
    if core.startswith("O-O"):
        needles.append(core.replace("O", "0"))  # 0-0 spelling
    flags = 0 if strict_case else re.IGNORECASE
    for needle in needles:
        if re.search(rf"(?<![A-Za-z0-9]){re.escape(needle)}(?![0-9])", text, flags):
            return True
    if core.startswith("O-O") and re.search(r"castl", text, re.IGNORECASE):
        return True
    return False


def _valid(text: str, level: str, best_san: str | None, best_uci: str | None = None) -> bool:
    """Post-validation guard against spoilers and hallucinations."""
    if not text or len(text) > MAX_TEXT_LEN:
        return False
    if level == "hint":
        return not mentions_move(text, best_san, best_uci, strict_case=False)
    if best_san:
        return mentions_move(text, best_san, best_uci, strict_case=True)
    return True


def fallback_text(level: str, best_san: str | None, played_san: str) -> str:
    """Generic rules-v1 text when the source MoveAnalysis is unavailable."""
    if level == "reveal" and best_san:
        return (
            f"{best_san} was the strongest move here - it follows Stockfish's top line. "
            f"Your {played_san} let the advantage slip."
        )
    return FALLBACK_HINT


def hint_question(move: MoveAnalysis, best_san: str | None, phase: str | None) -> str:
    """Theme-level guiding question from engine facts. Never names the move."""
    san = best_san or ""
    mover_white = move.ply % 2 == 1
    mate = move.mate_before
    if mate is not None and mate != 0 and (mate > 0) == mover_white:
        return "There was a forced mate here. Check every check first: which one leaves the king no escape?"
    if "+" in san or "#" in san:
        return "Start with forcing moves: which check causes your opponent the most trouble?"
    if "x" in san:
        return "Something can be won here. Which enemy piece is loose or not defended enough?"
    if san.startswith("O-O"):
        return "Before attacking, how safe is your king? What would you do with it here?"
    if phase == "Opening":
        return "Which of your pieces is still undeveloped, and where would it do the most work?"
    if phase == "Endgame":
        return "In endgames the king and the passed pawns decide: which of them should move?"
    return HINT_QUESTION


def rules_fallback(
    level: str,
    *,
    game: Game | None,
    move: MoveAnalysis | None,
    best_san: str | None,
    played_san: str,
    phase: str | None = None,
) -> str:
    """rules-v1 coaching built from the existing explain_move() text.

    Hint: only the spoiler-free first sentence (played move, eval swing,
    severity) plus a guiding question. Reveal: the full explanation, which
    names the best move and its PV.
    """
    if game is None or move is None:
        return fallback_text(level, best_san, played_san)
    if level == "reveal":
        return explain_move(game, move)
    return f"{mistake_line(move)}\n{hint_question(move, best_san, phase)}"


def get_coaching(
    *,
    level: str,
    fallback: str,
    fen_before: str,
    side_to_move: str,
    played_san: str,
    classification: str,
    cp_loss: int | None,
    phase: str,
    opening: str | None,
    best_san: str | None = None,
    best_uci: str | None = None,
    pv_sans: list[str] | None = None,
    eval_before: str = "unknown",
    eval_after: str = "unknown",
    lang: str = "ENGLISH",
) -> CoachingResult:
    """LLM text when configured + valid; otherwise `fallback` tagged rules-v1."""
    if not is_configured():
        return CoachingResult(fallback, RULES_SOURCE, cacheable=False)
    user = build_user_message(
        level=level, fen_before=fen_before, side_to_move=side_to_move,
        played_san=played_san, classification=classification, cp_loss=cp_loss,
        phase=phase, opening=opening, best_san=best_san, pv_sans=pv_sans,
        eval_before=eval_before, eval_after=eval_after, lang=lang,
    )
    # Hint spoiler -> discard straight away; reveal missing the move -> one retry.
    max_calls = 2 if level == "reveal" else 1
    try:
        for attempt in range(1, max_calls + 1):
            text = _call_provider(SYSTEM_PROMPT, user)
            if _valid(text, level, best_san, best_uci):
                return CoachingResult(text, LLM_SOURCE, cacheable=True)
            logger.warning(
                "AI coaching %s reply rejected (%s check, call %d/%d): %r",
                level, "spoiler" if level == "hint" else "best-move", attempt, max_calls, text[:200],
            )
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, AttributeError) as e:
        if isinstance(e, httpx.HTTPStatusError):
            why = f"HTTP {e.response.status_code} from {LLM_BASE_URL}: {e.response.text[:200]}"
        else:
            why = f"{type(e).__name__}: {e}"
        logger.warning("AI coaching %s fell back to rules-v1 (model %s) - %s", level, LLM_MODEL, why)
        return CoachingResult(fallback, RULES_SOURCE, cacheable=False)
    # The provider answered but failed validation: cache the free fallback so
    # this drill+level stops costing paid calls.
    return CoachingResult(fallback, RULES_SOURCE, cacheable=True)
