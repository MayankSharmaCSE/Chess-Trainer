"""API routes for AI Chess Bot Arena."""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any

import chess
import chess.pgn
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.bot import Bot, BotGame
from app.models.game import Game
from app.models.user import User
from app.schemas.bot import (
    BotGameAnalysisOut,
    BotGameMoveIn,
    BotGameOut,
    BotOut,
    CreateBotGameIn,
    MoveHistoryItem,
)
from app.services import bot_engine

router = APIRouter(prefix="/api/bots", tags=["bot-arena"])

PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
}

STARTING_PIECE_COUNTS = {
    "K": 1,
    "Q": 1,
    "R": 2,
    "B": 2,
    "N": 2,
    "P": 8,
    "k": 1,
    "q": 1,
    "r": 2,
    "b": 2,
    "n": 2,
    "p": 8,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _compute_captured_and_material(board: chess.Board) -> tuple[list[str], list[str], int, int]:
    """Return (captured_white, captured_black, white_mat, black_mat)."""
    current_counts: dict[str, int] = {k: 0 for k in STARTING_PIECE_COUNTS}
    white_mat = 0
    black_mat = 0

    for piece in board.piece_map().values():
        current_counts[piece.symbol()] += 1
        val = PIECE_VALUES.get(piece.piece_type, 0)
        if piece.color == chess.WHITE:
            white_mat += val
        else:
            black_mat += val

    captured_white: list[str] = []
    for sym in ["Q", "R", "B", "N", "P"]:
        missing = STARTING_PIECE_COUNTS[sym] - current_counts[sym]
        if missing > 0:
            captured_white.extend([sym] * missing)

    captured_black: list[str] = []
    for sym in ["q", "r", "b", "n", "p"]:
        missing = STARTING_PIECE_COUNTS[sym] - current_counts[sym]
        if missing > 0:
            captured_black.extend([sym] * missing)

    return captured_white, captured_black, white_mat, black_mat


def _parse_game_moves(pgn_text: str) -> tuple[list[MoveHistoryItem], list[str] | None]:
    """Parse moves and determine the last move [from, to] squares."""
    if not pgn_text.strip():
        return [], None

    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if not game:
        return [], None

    history: list[MoveHistoryItem] = []
    board = game.board()
    last_move_sqs: list[str] | None = None

    for i, move in enumerate(game.mainline_moves()):
        ply = i + 1
        move_number = (i // 2) + 1
        color = "white" if board.turn == chess.WHITE else "black"
        san = board.san(move)
        history.append(
            MoveHistoryItem(
                move_number=move_number,
                ply=ply,
                san=san,
                uci=move.uci(),
                color=color,
            )
        )
        last_move_sqs = [chess.square_name(move.from_square), chess.square_name(move.to_square)]
        board.push(move)

    return history, last_move_sqs


def _build_game_out(bot_game: BotGame, ai_move: str | None = None) -> BotGameOut:
    """Format BotGame ORM object into rich BotGameOut schema."""
    board = chess.Board(bot_game.fen)
    moves_history, last_move = _parse_game_moves(bot_game.pgn)
    cap_w, cap_b, white_mat, black_mat = _compute_captured_and_material(board)

    # Material difference from player's POV
    if bot_game.player_color == "white":
        mat_advantage = white_mat - black_mat
    else:
        mat_advantage = black_mat - white_mat

    return BotGameOut(
        id=bot_game.id,
        user_id=bot_game.user_id,
        bot_id=bot_game.bot_id,
        bot=BotOut.model_validate(bot_game.bot),
        player_color=bot_game.player_color,
        result=bot_game.result,
        status=bot_game.status,
        pgn=bot_game.pgn,
        fen=bot_game.fen,
        total_moves=bot_game.total_moves,
        time_control=bot_game.time_control,
        moves=moves_history,
        captured_white=cap_w,
        captured_black=cap_b,
        material_advantage=mat_advantage,
        turn="white" if board.turn == chess.WHITE else "black",
        is_check=board.is_check(),
        is_checkmate=board.is_checkmate(),
        is_game_over=board.is_game_over() or bot_game.status in ("resigned", "timeout"),
        last_move=last_move,
        ai_move=ai_move,
        started_at=bot_game.started_at,
        completed_at=bot_game.completed_at,
        linked_game_id=bot_game.linked_game_id,
    )


def _sync_to_library_game(db: Session, bot_game: BotGame) -> Game:
    """Mirror completed or in-progress bot game into standard `games` table for library review & training."""
    ext_id = f"bot-arena-{bot_game.id}"
    existing = (
        db.query(Game)
        .filter(Game.user_id == bot_game.user_id, Game.platform == "bot", Game.external_id == ext_id)
        .first()
    )

    white_user = "You" if bot_game.player_color == "white" else bot_game.bot.name
    black_user = bot_game.bot.name if bot_game.player_color == "white" else "You"
    white_rating = 1500 if bot_game.player_color == "white" else bot_game.bot.rating
    black_rating = bot_game.bot.rating if bot_game.player_color == "white" else 1500

    if existing is None:
        game = Game(
            user_id=bot_game.user_id,
            platform="bot",
            external_id=ext_id,
            url=f"/bots/game/{bot_game.id}",
            pgn=bot_game.pgn,
            white_username=white_user,
            black_username=black_user,
            white_rating=white_rating,
            black_rating=black_rating,
            user_color=bot_game.player_color,
            user_result=bot_game.result if bot_game.result != "in_progress" else None,
            opponent=bot_game.bot.name,
            time_control=bot_game.time_control or "10+0",
            rated=False,
            played_at=bot_game.completed_at or bot_game.started_at,
        )
        db.add(game)
        db.flush()
        bot_game.linked_game_id = game.id
        return game
    else:
        existing.pgn = bot_game.pgn
        existing.user_result = bot_game.result if bot_game.result != "in_progress" else None
        existing.played_at = bot_game.completed_at or existing.played_at
        bot_game.linked_game_id = existing.id
        return existing


@router.get("", response_model=list[BotOut])
def list_bots(db: Session = Depends(get_db)) -> list[BotOut]:
    """Return all available AI bot configurations ordered by rating."""
    bots = db.query(Bot).order_by(Bot.rating.asc()).all()
    return [BotOut.model_validate(b) for b in bots]


@router.post("/game/create", response_model=BotGameOut, status_code=status.HTTP_201_CREATED)
def create_game(
    payload: CreateBotGameIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameOut:
    """Create a new chess game against the selected AI Bot."""
    bot = db.get(Bot, payload.bot_id)
    if bot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bot '{payload.bot_id}' not found.",
        )

    import random
    player_color = payload.player_color
    if player_color == "random":
        player_color = random.choice(["white", "black"])

    board = chess.Board()
    pgn_game = chess.pgn.Game()
    pgn_game.headers["Event"] = "AI Chess Bot Arena"
    pgn_game.headers["Site"] = "ChessLens Arena"
    pgn_game.headers["Date"] = datetime.now().strftime("%Y.%m.%d")
    pgn_game.headers["Round"] = "1"
    pgn_game.headers["White"] = user.username if player_color == "white" else bot.name
    pgn_game.headers["Black"] = bot.name if player_color == "white" else user.username
    pgn_game.headers["Result"] = "*"

    ai_move_san: str | None = None
    node = pgn_game

    # If player is black, Bot makes move 1 as White
    if player_color == "black":
        try:
            ai_move_uci = bot_engine.generate_bot_move(
                fen=board.fen(),
                skill_level=bot.skill_level,
                depth=bot.depth,
                movetime_ms=bot.movetime_ms,
                uci_limit_strength=bot.uci_limit_strength,
                uci_elo=bot.uci_elo,
                bot_rating=bot.rating,
            )
            move_obj = chess.Move.from_uci(ai_move_uci)
            ai_move_san = board.san(move_obj)
            board.push(move_obj)
            node = node.add_variation(move_obj)
        except Exception as e:
            # Fallback to standard e4 if engine initialization fails
            fallback = chess.Move.from_uci("e2e4")
            ai_move_san = board.san(fallback)
            board.push(fallback)
            node = node.add_variation(fallback)

    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    pgn_str = pgn_game.accept(exporter)

    bot_game = BotGame(
        user_id=user.id,
        bot_id=bot.id,
        player_color=player_color,
        result="in_progress",
        status="in_progress",
        pgn=pgn_str,
        fen=board.fen(),
        total_moves=len(list(board.move_stack)),
        time_control=payload.time_control,
        started_at=_utcnow(),
    )
    db.add(bot_game)
    db.commit()
    db.refresh(bot_game)

    return _build_game_out(bot_game, ai_move=ai_move_san)


@router.get("/game/{game_id}", response_model=BotGameOut)
def get_game(
    game_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameOut:
    """Retrieve the current state of a bot game."""
    bot_game = (
        db.query(BotGame).filter(BotGame.id == game_id, BotGame.user_id == user.id).first()
    )
    if bot_game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")

    return _build_game_out(bot_game)


@router.post("/game/{game_id}/move", response_model=BotGameOut)
def make_move(
    game_id: int,
    payload: BotGameMoveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameOut:
    """Accept and validate player move, push to board, generate AI response, and return updated state."""
    bot_game = (
        db.query(BotGame).filter(BotGame.id == game_id, BotGame.user_id == user.id).first()
    )
    if bot_game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")

    if bot_game.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Game is already over ({bot_game.status}).",
        )

    board = chess.Board(bot_game.fen)

    # Verify whose turn it is
    player_is_white = bot_game.player_color == "white"
    if (board.turn == chess.WHITE) != player_is_white:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="It is not your turn.",
        )

    # Parse player move (accepts both UCI like e2e4 or SAN like e4)
    clean_move = payload.move.strip()
    chess_move: chess.Move | None = None
    try:
        chess_move = chess.Move.from_uci(clean_move)
        if chess_move not in board.legal_moves:
            chess_move = None
    except ValueError:
        pass

    if chess_move is None:
        try:
            chess_move = board.parse_san(clean_move)
        except (ValueError, chess.IllegalMoveError, chess.AmbiguousMoveError):
            pass

    if chess_move is None or chess_move not in board.legal_moves:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Illegal move: '{clean_move}'",
        )

    # Reconstruct PGN tree
    pgn_game = chess.pgn.read_game(io.StringIO(bot_game.pgn))
    if pgn_game is None:
        pgn_game = chess.pgn.Game()
    node = pgn_game.end()

    # Push player move
    node = node.add_variation(chess_move)
    board.push(chess_move)

    ai_move_san: str | None = None

    # Check if player's move finished the game
    if board.is_checkmate():
        bot_game.result = "win"
        bot_game.status = "checkmate"
        bot_game.completed_at = _utcnow()
    elif board.is_stalemate():
        bot_game.result = "draw"
        bot_game.status = "stalemate"
        bot_game.completed_at = _utcnow()
    elif board.is_insufficient_material():
        bot_game.result = "draw"
        bot_game.status = "draw_material"
        bot_game.completed_at = _utcnow()
    elif board.can_claim_threefold_repetition():
        bot_game.result = "draw"
        bot_game.status = "draw_repetition"
        bot_game.completed_at = _utcnow()
    elif board.can_claim_fifty_moves():
        bot_game.result = "draw"
        bot_game.status = "draw_50_moves"
        bot_game.completed_at = _utcnow()
    else:
        # Game continues: AI's turn!
        bot = bot_game.bot
        try:
            ai_move_uci = bot_engine.generate_bot_move(
                fen=board.fen(),
                skill_level=bot.skill_level,
                depth=bot.depth,
                movetime_ms=bot.movetime_ms,
                uci_limit_strength=bot.uci_limit_strength,
                uci_elo=bot.uci_elo,
                bot_rating=bot.rating,
            )
            ai_move_obj = chess.Move.from_uci(ai_move_uci)
            ai_move_san = board.san(ai_move_obj)
            board.push(ai_move_obj)
            node = node.add_variation(ai_move_obj)
        except Exception as e:
            # Fallback to random legal move if engine process encountered an issue
            legal = list(board.legal_moves)
            if legal:
                ai_move_obj = legal[0]
                ai_move_san = board.san(ai_move_obj)
                board.push(ai_move_obj)
                node = node.add_variation(ai_move_obj)

        # Check if AI's move finished the game
        if board.is_checkmate():
            bot_game.result = "loss"
            bot_game.status = "checkmate"
            bot_game.completed_at = _utcnow()
        elif board.is_stalemate():
            bot_game.result = "draw"
            bot_game.status = "stalemate"
            bot_game.completed_at = _utcnow()
        elif board.is_insufficient_material():
            bot_game.result = "draw"
            bot_game.status = "draw_material"
            bot_game.completed_at = _utcnow()
        elif board.can_claim_threefold_repetition():
            bot_game.result = "draw"
            bot_game.status = "draw_repetition"
            bot_game.completed_at = _utcnow()
        elif board.can_claim_fifty_moves():
            bot_game.result = "draw"
            bot_game.status = "draw_50_moves"
            bot_game.completed_at = _utcnow()

    # Update PGN result header if finished
    if bot_game.status != "in_progress":
        if bot_game.result == "win":
            pgn_game.headers["Result"] = "1-0" if player_is_white else "0-1"
        elif bot_game.result == "loss":
            pgn_game.headers["Result"] = "0-1" if player_is_white else "1-0"
        else:
            pgn_game.headers["Result"] = "1/2-1/2"

    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    bot_game.pgn = pgn_game.accept(exporter)
    bot_game.fen = board.fen()
    bot_game.total_moves = len(list(pgn_game.mainline_moves()))

    # Sync to library if game concluded
    if bot_game.status != "in_progress":
        _sync_to_library_game(db, bot_game)

    db.commit()
    db.refresh(bot_game)

    return _build_game_out(bot_game, ai_move=ai_move_san)


@router.post("/game/{game_id}/resign", response_model=BotGameOut)
def resign_game(
    game_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameOut:
    """Resign the current game."""
    bot_game = (
        db.query(BotGame).filter(BotGame.id == game_id, BotGame.user_id == user.id).first()
    )
    if bot_game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")

    if bot_game.status != "in_progress":
        return _build_game_out(bot_game)

    bot_game.result = "loss"
    bot_game.status = "resigned"
    bot_game.completed_at = _utcnow()

    # Update PGN headers
    pgn_game = chess.pgn.read_game(io.StringIO(bot_game.pgn))
    if pgn_game:
        pgn_game.headers["Result"] = "0-1" if bot_game.player_color == "white" else "1-0"
        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        bot_game.pgn = pgn_game.accept(exporter)

    _sync_to_library_game(db, bot_game)
    db.commit()
    db.refresh(bot_game)

    return _build_game_out(bot_game)


@router.post("/game/{game_id}/restart", response_model=BotGameOut)
def restart_game(
    game_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameOut:
    """Restart the game against the same bot with the same color configuration."""
    bot_game = (
        db.query(BotGame).filter(BotGame.id == game_id, BotGame.user_id == user.id).first()
    )
    if bot_game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")

    bot = bot_game.bot
    board = chess.Board()

    pgn_game = chess.pgn.Game()
    pgn_game.headers["Event"] = "AI Chess Bot Arena"
    pgn_game.headers["Site"] = "ChessLens Arena"
    pgn_game.headers["Date"] = datetime.now().strftime("%Y.%m.%d")
    pgn_game.headers["Round"] = "1"
    pgn_game.headers["White"] = user.username if bot_game.player_color == "white" else bot.name
    pgn_game.headers["Black"] = bot.name if bot_game.player_color == "white" else user.username
    pgn_game.headers["Result"] = "*"

    ai_move_san: str | None = None
    node = pgn_game

    if bot_game.player_color == "black":
        try:
            ai_move_uci = bot_engine.generate_bot_move(
                fen=board.fen(),
                skill_level=bot.skill_level,
                depth=bot.depth,
                movetime_ms=bot.movetime_ms,
                uci_limit_strength=bot.uci_limit_strength,
                uci_elo=bot.uci_elo,
                bot_rating=bot.rating,
            )
            move_obj = chess.Move.from_uci(ai_move_uci)
            ai_move_san = board.san(move_obj)
            board.push(move_obj)
            node = node.add_variation(move_obj)
        except Exception:
            fallback = chess.Move.from_uci("e2e4")
            ai_move_san = board.san(fallback)
            board.push(fallback)
            node = node.add_variation(fallback)

    exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
    bot_game.pgn = pgn_game.accept(exporter)
    bot_game.fen = board.fen()
    bot_game.total_moves = len(list(pgn_game.mainline_moves()))
    bot_game.result = "in_progress"
    bot_game.status = "in_progress"
    bot_game.started_at = _utcnow()
    bot_game.completed_at = None

    db.commit()
    db.refresh(bot_game)

    return _build_game_out(bot_game, ai_move=ai_move_san)


@router.post("/game/{game_id}/analyze", response_model=BotGameAnalysisOut)
def analyze_completed_game(
    game_id: int,
    depth: int = Query(default=12, ge=6, le=20),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BotGameAnalysisOut:
    """Analyze a completed bot game using Stockfish to identify inaccuracies, mistakes, blunders, and accuracy."""
    bot_game = (
        db.query(BotGame).filter(BotGame.id == game_id, BotGame.user_id == user.id).first()
    )
    if bot_game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found.")

    if not bot_game.pgn.strip() or bot_game.total_moves == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot analyze a game with no moves.",
        )

    # Ensure linked Game record exists
    lib_game = _sync_to_library_game(db, bot_game)
    db.commit()

    # Run analysis
    try:
        report = bot_engine.analyze_bot_game(
            pgn=bot_game.pgn,
            user_color=bot_game.player_color,
            depth=depth,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Engine analysis failed: {e}",
        )

    # Record into GameAnalysis and MoveAnalysis tables for deep integration
    existing_analysis = db.query(GameAnalysis).filter(GameAnalysis.game_id == lib_game.id).first()
    if existing_analysis is None:
        existing_analysis = GameAnalysis(
            game_id=lib_game.id,
            user_id=user.id,
            depth=depth,
            engine_name="Stockfish",
            status="done",
            blunder_count=report["blunders"],
            mistake_count=report["mistakes"],
            inaccuracy_count=report["inaccuracies"],
            completed_at=_utcnow(),
        )
        db.add(existing_analysis)
        db.flush()
    else:
        existing_analysis.status = "done"
        existing_analysis.depth = depth
        existing_analysis.blunder_count = report["blunders"]
        existing_analysis.mistake_count = report["mistakes"]
        existing_analysis.inaccuracy_count = report["inaccuracies"]
        existing_analysis.completed_at = _utcnow()
        db.query(MoveAnalysis).filter(MoveAnalysis.analysis_id == existing_analysis.id).delete()

    for m in report["moves"]:
        db.add(MoveAnalysis(game_id=lib_game.id, analysis_id=existing_analysis.id, **m))
    db.commit()

    # Performance rating estimation
    perf_rating: int | None = None
    bot_rating = bot_game.bot.rating
    acc = report["accuracy"]
    if bot_game.result == "win":
        perf_rating = int(bot_rating + 150 + (acc - 70) * 8)
    elif bot_game.result == "loss":
        perf_rating = max(100, int(bot_rating - 150 + (acc - 60) * 6))
    else:
        perf_rating = int(bot_rating + (acc - 70) * 5)

    return BotGameAnalysisOut(
        game_id=bot_game.id,
        linked_game_id=lib_game.id,
        result=bot_game.result,
        player_color=bot_game.player_color,
        accuracy=acc,
        performance_rating=perf_rating,
        blunders=report["blunders"],
        mistakes=report["mistakes"],
        inaccuracies=report["inaccuracies"],
        best_move=report["best_move"],
        worst_move=report["worst_move"],
        moves=report["moves"],
    )
