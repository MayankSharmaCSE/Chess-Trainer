"""Comprehensive tests for AI Chess Bot Arena endpoints, game lifecycle, and Stockfish analysis."""

import pytest

from app.api import routes_bots
from app.db.base import SessionLocal, init_db
from app.models.bot import Bot
from app.models.user import User
from app.schemas.bot import BotGameMoveIn, CreateBotGameIn


@pytest.fixture(scope="module")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_user(db_session):
    u = db_session.query(User).filter(User.username == "bot_tester_suite").first()
    if not u:
        u = User(username="bot_tester_suite", email="bot_suite@example.com", hashed_password="fake")
        db_session.add(u)
        db_session.commit()
        db_session.refresh(u)
    return u


def test_list_all_nine_bots(db_session):
    bots = routes_bots.list_bots(db_session)
    assert len(bots) == 9
    ratings = [b.rating for b in bots]
    assert ratings == [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]

    beginner = bots[0]
    assert beginner.id == "beginner"
    assert beginner.name == "Beginner Bot"
    assert beginner.difficulty == "Very Easy"
    assert beginner.rating == 400

    gm = bots[-1]
    assert gm.id == "grandmaster"
    assert gm.rating == 2000
    assert gm.difficulty == "Expert"


def test_create_and_play_white_game(db_session, test_user):
    create_in = CreateBotGameIn(bot_id="beginner", player_color="white", time_control="10+0")
    game = routes_bots.create_game(create_in, db_session, test_user)

    assert game.player_color == "white"
    assert game.turn == "white"
    assert game.total_moves == 0
    assert game.result == "in_progress"
    assert game.status == "in_progress"

    # Player makes move 1: e2e4
    move_in = BotGameMoveIn(move="e2e4")
    after_e4 = routes_bots.make_move(game.id, move_in, db_session, test_user)

    assert after_e4.total_moves == 2  # White e4 + AI move
    assert len(after_e4.moves) == 2
    assert after_e4.moves[0].san == "e4"
    assert after_e4.ai_move is not None
    assert after_e4.turn == "white"

    # Fetch game state
    fetched = routes_bots.get_game(game.id, db_session, test_user)
    assert fetched.id == game.id
    assert fetched.total_moves == 2


def test_create_and_play_black_game(db_session, test_user):
    create_in = CreateBotGameIn(bot_id="casual", player_color="black", time_control="5+0")
    game = routes_bots.create_game(create_in, db_session, test_user)

    assert game.player_color == "black"
    assert game.turn == "black"
    assert game.total_moves == 1
    assert game.ai_move is not None

    # Black makes a legal move
    import chess
    board = chess.Board(game.fen)
    legal_moves = list(board.legal_moves)
    assert len(legal_moves) > 0
    resp_move = legal_moves[0].uci()

    after_resp = routes_bots.make_move(game.id, BotGameMoveIn(move=resp_move), db_session, test_user)
    assert after_resp.total_moves == 3  # AI 1 + Player 1 + AI 2


def test_resign_restart_and_analysis(db_session, test_user):
    create_in = CreateBotGameIn(bot_id="learner", player_color="white", time_control="10+0")
    game = routes_bots.create_game(create_in, db_session, test_user)

    routes_bots.make_move(game.id, BotGameMoveIn(move="e4"), db_session, test_user)

    # Resign
    resigned = routes_bots.resign_game(game.id, db_session, test_user)
    assert resigned.result == "loss"
    assert resigned.status == "resigned"
    assert resigned.linked_game_id is not None

    # Post-game Stockfish analysis
    analysis = routes_bots.analyze_completed_game(game.id, depth=8, db=db_session, user=test_user)
    assert analysis.game_id == game.id
    assert analysis.accuracy > 0
    assert len(analysis.moves) >= 2
    assert analysis.result == "loss"

    # Restart game
    restarted = routes_bots.restart_game(game.id, db_session, test_user)
    assert restarted.result == "in_progress"
    assert restarted.status == "in_progress"
    assert restarted.total_moves == 0
