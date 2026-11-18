"""US-009 tests: drills generated from flagged moves + attempt grading."""

from fastapi.testclient import TestClient

from app.db.base import SessionLocal
from app.models.analysis import GameAnalysis, MoveAnalysis
from app.models.game import Game


def _signup(client: TestClient, username: str, email: str) -> tuple:
    r = client.post(
        "/api/auth/signup",
        json={"username": username, "email": email, "password": "password123"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return body["user"]["id"], body["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 1/2-1/2'


def _seed(user_id: int, ext: str = "drill1") -> int:
    db = SessionLocal()
    try:
        g = Game(user_id=user_id, platform="chesscom", external_id=ext,
                 pgn=PGN, user_color="white", opening_name="Ruy Lopez",
                 opponent="OppA", user_result="loss")
        db.add(g)
        db.flush()
        a = GameAnalysis(game_id=g.id, user_id=user_id, status="done", depth=12,
                         blunder_count=1, mistake_count=1)
        db.add(a)
        db.flush()
        # ply 3 Nf3: user blunder, best d4 (legal from start pos? use real FEN below)
        # Real: after 1.e4 e5 (ply 2), white plays -> best d4 is ILLEGAL there.
        # Use ply 5 Bb5 instead: after 2...Nc6, Bb5 is the Ruy; make best Ba4.
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=5, played_san="Bb5",
            played_uci="f1b5", best_san="Bc4", best_uci="f1c4",
            pv_sans=["Bc4"], eval_before_cp=30, mate_before=None,
            eval_after_cp=-280, mate_after=None, cp_loss=310,
            classification="BLUNDER", is_user_move=True))
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=7, played_san="Ba4",
            played_uci="b5a4", best_san="O-O", best_uci="e1g1",
            pv_sans=["O-O"], eval_before_cp=-280, mate_before=None,
            eval_after_cp=-380, mate_after=None, cp_loss=100,
            classification="MISTAKE", is_user_move=True))
        db.add(MoveAnalysis(
            game_id=g.id, analysis_id=a.id, ply=8, played_san="a6",
            played_uci="a7a6", best_san="a6", best_uci="a7a6",
            pv_sans=["a6"], eval_before_cp=-380, mate_before=None,
            eval_after_cp=-375, mate_after=None, cp_loss=0,
            classification=None, is_user_move=False))
        db.commit()
        return g.id
    finally:
        db.close()


def test_drills_empty(client: TestClient):
    _, token = _signup(client, "drill_empty", "drill_empty@example.com")
    body = client.get("/api/training/drills", headers=_auth(token)).json()
    assert body["total"] == 0 and body["drills"] == []
    stats = client.get("/api/training/stats", headers=_auth(token)).json()
    assert stats["total_drills"] == 0
    assert client.get("/api/training/drills").status_code == 401


def test_drill_flow(client: TestClient):
    user_id, token = _signup(client, "drill_user", "drill@example.com")
    _seed(user_id)
    h = _auth(token)

    page = client.get("/api/training/drills", headers=h).json()
    assert page["total"] == 2, page
    # Severity order: BLUNDER first, then MISTAKE.
    assert page["drills"][0]["classification"] == "BLUNDER"
    assert page["drills"][1]["classification"] == "MISTAKE"
    first = page["drills"][0]
    assert first["phase"] == "Opening"
    assert first["opening"] == "Ruy Lopez"
    assert first["fen_before"].startswith("r1bqkbnr/")

    # Wrong but legal move triggers lazy equivalence (mocked engine: exact-only).
    import chess
    from unittest.mock import patch
    board = chess.Board(first["fen_before"])
    legal = [m.uci() for m in board.legal_moves if m.uci() != "f1c4"]
    assert legal, "need an alternative legal move"
    with patch("app.services.equivalence.compute_acceptable", return_value=["f1c4"]) as mock_equiv:
        bad = client.post(f"/api/training/drills/{first['id']}/attempts",
                          json={"played_uci": legal[0]}, headers=h)
        assert bad.status_code == 200, bad.text
        assert bad.json()["correct"] is False
        assert bad.json()["equivalent"] is False
        assert bad.json()["solved"] is False
        assert mock_equiv.call_count == 1
        # Second wrong move reuses the cache: no second engine call.
        legal2 = [m.uci() for m in board.legal_moves if m.uci() not in ("f1c4", legal[0])]
        if legal2:
            bad2 = client.post(f"/api/training/drills/{first['id']}/attempts",
                               json={"played_uci": legal2[0]}, headers=h)
            assert bad2.status_code == 200, bad2.text
            assert bad2.json()["correct"] is False
            assert mock_equiv.call_count == 1

    # Illegal move rejected.
    illegal = client.post(f"/api/training/drills/{first['id']}/attempts",
                          json={"played_uci": "e7e5"}, headers=h)
    assert illegal.status_code == 422

    # Malformed UCI rejected.
    malformed = client.post(f"/api/training/drills/{first['id']}/attempts",
                            json={"played_uci": "zzz"}, headers=h)
    assert malformed.status_code == 422

    # Correct move solves (exact best: equivalent=false).
    good = client.post(f"/api/training/drills/{first['id']}/attempts",
                       json={"played_uci": "f1c4"}, headers=h)
    assert good.status_code == 200, good.text
    assert good.json()["correct"] is True
    assert good.json()["equivalent"] is False
    assert good.json()["solved"] is True
    assert good.json()["best_san"] == "Bc4"

    # Solved drill hidden by default, visible with flag.
    assert client.get("/api/training/drills", headers=h).json()["total"] == 1
    allp = client.get("/api/training/drills?include_solved=true", headers=h).json()
    assert allp["total"] == 2
    assert [d["solved"] for d in allp["drills"] if d["id"] == first["id"]] == [True]

    stats = client.get("/api/training/stats", headers=h).json()
    assert stats["total_drills"] == 2
    assert stats["solved"] == 1 and stats["unsolved"] == 1
    assert stats["attempts"] >= 3 and stats["correct_attempts"] == 1

    # Unknown drill 404; other user isolated.
    assert client.post("/api/training/drills/99999/attempts",
                       json={"played_uci": "e2e4"}, headers=h).status_code == 404
    _, token2 = _signup(client, "drill_other", "drill2@example.com")
    assert client.get("/api/training/drills", headers=_auth(token2)).json()["total"] == 0


def test_equivalent_move_accepted(client: TestClient):
    """A legal non-best move cached as acceptable solves with equivalent=true."""
    from unittest.mock import patch

    user_id, token = _signup(client, "drill_equiv", "drill_equiv@example.com")
    _seed(user_id, ext="drill-equiv")
    h = _auth(token)
    page = client.get("/api/training/drills", headers=h).json()
    first = page["drills"][0]
    assert first["best_san"] == "Bc4"

    import chess
    board = chess.Board(first["fen_before"])
    alt = next(m.uci() for m in board.legal_moves if m.uci() != "f1c4")
    with patch(
        "app.services.equivalence.compute_acceptable",
        return_value=["f1c4", alt],
    ) as mock_equiv:
        r = client.post(f"/api/training/drills/{first['id']}/attempts",
                        json={"played_uci": alt}, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["correct"] is True
        assert body["equivalent"] is True
        assert body["solved"] is True
        assert mock_equiv.call_count == 1


def test_engine_down_falls_back_to_exact_only(client: TestClient):
    """If the engine fails during lazy equivalence, grade exact-only (no 500)."""
    from unittest.mock import patch

    user_id, token = _signup(client, "drill_engdown", "drill_engdown@example.com")
    _seed(user_id, ext="drill-engdown")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]

    import chess
    board = chess.Board(first["fen_before"])
    alt = next(m.uci() for m in board.legal_moves if m.uci() != "f1c4")
    with patch(
        "app.services.equivalence.compute_acceptable",
        side_effect=OSError("no engine"),
    ):
        r = client.post(f"/api/training/drills/{first['id']}/attempts",
                        json={"played_uci": alt}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["correct"] is False
        assert r.json()["equivalent"] is False


def test_compute_acceptable_tolerance():
    """MultiPV ranking: moves within 15cp of best are acceptable."""
    import chess.engine
    from unittest.mock import MagicMock, patch

    from app.services.equivalence import compute_acceptable

    fen = chess.STARTING_FEN
    board = chess.Board(fen)
    ucis = [m.uci() for m in list(board.legal_moves)[:4]]
    best = ucis[0]

    def slot(uci: str, cp: int):
        m = MagicMock()
        m.get.return_value = [chess.Move.from_uci(uci)]
        score = MagicMock()
        score.pov.return_value = chess.engine.Cp(cp)
        m.__getitem__.return_value = score
        return m

    fake_engine = MagicMock()
    fake_engine.analyse.return_value = [
        slot(ucis[0], 30), slot(ucis[1], 20), slot(ucis[2], 0), slot(ucis[3], -500),
    ]
    with patch("chess.engine.SimpleEngine.popen_uci", return_value=fake_engine):
        out = compute_acceptable(fen, best, depth=1, engine_path="fake")
    assert best in out
    assert ucis[1] in out  # 10cp behind: equivalent
    assert ucis[2] not in out  # 30cp behind: not equivalent
    assert ucis[3] not in out


# ---- US-009 Option B: LLM coaching (provider mocked; deterministic) --------


class FakeProvider:
    """Stands in for coaching._call_provider; records every (system, user)."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[tuple[str, str]] = []

    def __call__(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def _coach(client, drill_id, level, h):
    return client.post(f"/api/training/drills/{drill_id}/coaching", json={"level": level}, headers=h)


def _configure(monkeypatch, provider=None):
    from app.services import coaching

    monkeypatch.setattr(coaching, "LLM_API_KEY", "test-key")
    if provider is not None:
        monkeypatch.setattr(coaching, "_call_provider", provider)


def _drill_row(drill_id: int):
    from app.models.training import TrainingDrill

    db = SessionLocal()
    try:
        return db.get(TrainingDrill, drill_id)
    finally:
        db.close()


def test_coaching_hint_and_reveal_flow(client: TestClient, monkeypatch):
    """Hint and reveal both work; each cached (0 calls on repeat)."""
    user_id, token = _signup(client, "drill_coach", "drill_coach@example.com")
    _seed(user_id, ext="drill-coach")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]
    fake = FakeProvider(
        "Your bishop walked into a pin-free but passive square.\nWhich developing move also eyes f7?",
    )
    _configure(monkeypatch, fake)

    hint = _coach(client, first["id"], "hint", h)
    assert hint.status_code == 200, hint.text
    assert hint.json() == {"level": "hint", "text": fake.replies[0], "source": "llm"}
    # Prompt-level safety: best move / PV never sent in HINT mode.
    _, user_msg = fake.calls[0]
    assert "Bc4" not in user_msg and "f1c4" not in user_msg and "BEST MOVE" not in user_msg
    assert "MODE: HINT" in user_msg and "YOUR MISTAKE: Bb5" in user_msg
    # White to move: White-POV evals pass through unchanged.
    assert "+0.3 -> -2.8" in user_msg
    # Cache: second hint = 0 LLM calls.
    assert _coach(client, first["id"], "hint", h).json()["text"] == hint.json()["text"]
    assert len(fake.calls) == 1
    assert client.get("/api/training/drills", headers=h).json()["drills"][0]["has_coaching"] is True

    good = client.post(f"/api/training/drills/{first['id']}/attempts",
                       json={"played_uci": "f1c4"}, headers=h)
    assert good.json()["correct"] is True

    fake.replies = ["Bc4 develops and eyes f7.\nIt keeps your pieces active.\nYour Bb5 let Black gain time."]
    rev = _coach(client, first["id"], "reveal", h)
    assert rev.status_code == 200, rev.text
    assert rev.json()["source"] == "llm" and "Bc4" in rev.json()["text"]
    _, rev_msg = fake.calls[-1]
    assert "BEST MOVE: Bc4" in rev_msg and "PRINCIPAL VARIATION: Bc4" in rev_msg
    assert _coach(client, first["id"], "reveal", h).json() == rev.json()
    assert len(fake.calls) == 2  # lifetime: 1 hint + 1 reveal

    row = _drill_row(first["id"])
    assert (row.coaching_hint_source, row.coaching_reveal_source) == ("llm", "llm")

    # Unknown drill 404; bad level 422; unauth 401.
    assert _coach(client, 99999, "hint", h).status_code == 404
    assert _coach(client, first["id"], "bogus", h).status_code == 422
    assert client.post(f"/api/training/drills/{first['id']}/coaching",
                       json={"level": "hint"}).status_code == 401


def test_reveal_before_solving_explains_stockfish_move(client: TestClient, monkeypatch):
    """'Need a hint?' flow: Stockfish's move goes to the LLM, which explains it; drill stays unsolved."""
    user_id, token = _signup(client, "drill_hintreveal", "drill_hintreveal@example.com")
    _seed(user_id, ext="drill-hintreveal")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]
    assert first["best_san"] == "Bc4" and first["pv_sans"] == ["Bc4"]  # UI shows this first
    fake = FakeProvider("Bc4 develops and eyes f7.\nIt keeps your pieces active.\nYour Bb5 let Black gain time.")
    _configure(monkeypatch, fake)

    r = _coach(client, first["id"], "reveal", h)
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "llm" and "Bc4" in r.json()["text"]
    _, msg = fake.calls[0]
    assert "MODE: REVEAL" in msg and "BEST MOVE: Bc4" in msg
    # Looking at the answer doesn't solve the drill; playing the move does.
    assert client.get("/api/training/stats", headers=h).json()["solved"] == 0
    good = client.post(f"/api/training/drills/{first['id']}/attempts", json={"played_uci": "f1c4"}, headers=h)
    assert good.json()["solved"] is True
    # Post-solve reveal is the cached text: no second LLM call.
    assert _coach(client, first["id"], "reveal", h).json() == r.json()
    assert len(fake.calls) == 1


def test_coaching_isolation(client: TestClient, monkeypatch):
    """Another user can't read or generate coaching for my drill (404, no call)."""
    user_id, token = _signup(client, "drill_iso_a", "drill_iso_a@example.com")
    _seed(user_id, ext="drill-iso")
    first = client.get("/api/training/drills", headers=_auth(token)).json()["drills"][0]
    fake = FakeProvider("Theme line.\nGuiding question?")
    _configure(monkeypatch, fake)
    _, token_b = _signup(client, "drill_iso_b", "drill_iso_b@example.com")
    for level in ("hint", "reveal"):
        assert _coach(client, first["id"], level, _auth(token_b)).status_code == 404
    assert fake.calls == []
    assert _drill_row(first["id"]).coaching_hint is None


def test_coaching_unconfigured_returns_503(client: TestClient, monkeypatch):
    """No key: 503 'AI coaching not configured', nothing cached, rest of app fine."""
    from app.services import coaching

    monkeypatch.setattr(coaching, "LLM_API_KEY", "")
    fake = FakeProvider("should never be called")
    monkeypatch.setattr(coaching, "_call_provider", fake)
    user_id, token = _signup(client, "drill_nokey", "drill_nokey@example.com")
    _seed(user_id, ext="drill-nokey")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]

    r = _coach(client, first["id"], "hint", h)
    assert r.status_code == 503
    assert r.json()["detail"] == "AI coaching not configured"
    assert _coach(client, first["id"], "reveal", h).status_code == 503
    assert fake.calls == []
    assert _drill_row(first["id"]).coaching_hint is None  # adding a key later still gets AI text
    # Training itself keeps working without a key.
    ok = client.post(f"/api/training/drills/{first['id']}/attempts",
                     json={"played_uci": "f1c4"}, headers=h)
    assert ok.status_code == 200 and ok.json()["solved"] is True
    assert client.get("/api/training/stats", headers=h).status_code == 200


def test_coaching_hint_spoiler_discarded(client: TestClient, monkeypatch):
    """A hint naming the best move (even as Bc4+ / lowercase) -> rules-v1, no retry."""
    user_id, token = _signup(client, "drill_spoil", "drill_spoil@example.com")
    _seed(user_id, ext="drill-spoil")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]
    fake = FakeProvider("Easy: just play bc4+ and win.\nSee it?")
    _configure(monkeypatch, fake)

    r = _coach(client, first["id"], "hint", h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "rules-v1"
    assert "bc4" not in body["text"].lower()
    # rules-v1 hint = explain_move's first sentence (mistake + eval swing) + question.
    assert body["text"].startswith("Move 3 (White): Bb5")
    assert "blunder" in body["text"] and "?" in body["text"]
    assert len(fake.calls) == 1  # hint never retries
    # Validation failure is cached so the drill stops costing paid calls.
    assert _coach(client, first["id"], "hint", h).json() == body
    assert len(fake.calls) == 1
    assert _drill_row(first["id"]).coaching_hint_source == "rules-v1"


def test_coaching_reveal_retry_then_fallback(client: TestClient, monkeypatch):
    """Reveal missing the best move: exactly one retry, then rules-v1 explain_move."""
    user_id, token = _signup(client, "drill_retry", "drill_retry@example.com")
    _seed(user_id, ext="drill-retry")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]
    client.post(f"/api/training/drills/{first['id']}/attempts", json={"played_uci": "f1c4"}, headers=h)
    fake = FakeProvider("Develop your pieces and castle.", "Keep developing.")
    _configure(monkeypatch, fake)

    r = _coach(client, first["id"], "reveal", h)
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "rules-v1"
    assert "Instead, Bc4 held the balance" in r.json()["text"]
    assert len(fake.calls) == 2


def test_coaching_reveal_retry_succeeds_and_castling(client: TestClient, monkeypatch):
    """Retry can recover; castling best move accepted when written as 'castle'."""
    user_id, token = _signup(client, "drill_castle", "drill_castle@example.com")
    _seed(user_id, ext="drill-castle")
    h = _auth(token)
    drills = client.get("/api/training/drills", headers=h).json()["drills"]
    mistake = next(d for d in drills if d["classification"] == "MISTAKE")
    assert mistake["best_san"] == "O-O"
    solved = client.post(f"/api/training/drills/{mistake['id']}/attempts",
                         json={"played_uci": "e1g1"}, headers=h)
    assert solved.json()["correct"] is True
    fake = FakeProvider("Keep your king safe.", "Castle kingside now: your king gets safe.\nThen the rook joins.\nBa4 wasted time.")
    _configure(monkeypatch, fake)
    r = _coach(client, mistake["id"], "reveal", h)
    assert r.json()["source"] == "llm"
    assert r.json()["text"].startswith("Castle kingside")
    assert len(fake.calls) == 2


def test_coaching_timeout_not_cached(client: TestClient, monkeypatch):
    """Provider timeout -> rules-v1 now, but a later request still gets AI text."""
    import httpx

    user_id, token = _signup(client, "drill_timeout", "drill_timeout@example.com")
    _seed(user_id, ext="drill-timeout")
    h = _auth(token)
    first = client.get("/api/training/drills", headers=h).json()["drills"][0]
    fake = FakeProvider(httpx.ReadTimeout("slow"))
    _configure(monkeypatch, fake)

    r = _coach(client, first["id"], "hint", h)
    assert r.status_code == 200 and r.json()["source"] == "rules-v1"
    assert _drill_row(first["id"]).coaching_hint is None

    fake.replies = ["Your bishop is far from the action.\nWhere can it do more?"]
    r2 = _coach(client, first["id"], "hint", h)
    assert r2.json()["source"] == "llm"
    assert len(fake.calls) == 2


def test_coaching_black_to_move_flips_eval():
    """Evals are stored White-POV; the prompt shows them from the player's side."""
    from app.api.routes_training import _fmt_pov

    assert _fmt_pov(30, None, True) == "+0.3"
    assert _fmt_pov(30, None, False) == "-0.3"
    assert _fmt_pov(-280, None, False) == "+2.8"
    assert _fmt_pov(None, 3, False) == "-M3"
    assert _fmt_pov(None, None, True) == "unknown"


def test_spoiler_guard_rules():
    from app.services.coaching import _valid, mentions_move

    # Check/mate suffix stripped: 'Qh5' still counts as naming 'Qh5+'.
    assert _valid("Try Qh5 here.\nWhy?", "hint", "Qh5+") is False
    assert _valid("Qh5 hits f7.\nThen mate.\nYour move was slow.", "reveal", "Qh5+") is True
    # UCI spelling also counts as a leak.
    assert _valid("Maybe f1c4?\nThink.", "hint", "Bc4", "f1c4") is False
    # No false positive inside a different move: best 'e4' vs text 'Qe4'.
    assert _valid("Your Qe4 left the king open.\nWhat about the centre?", "hint", "e4") is True
    # Castling: 'castle' / '0-0' are spoilers for O-O hints and accepted in reveals.
    assert _valid("Castle now.\nSafe?", "hint", "O-O") is False
    assert _valid("Play 0-0.\nSafe?", "hint", "O-O") is False
    assert mentions_move("Castling kingside tucks the king away.", "O-O", strict_case=True)
    # Reveal must actually name the move; oversized or empty text rejected.
    assert _valid("Develop a piece.", "reveal", "Bc4") is False
    assert _valid("", "hint", "Bc4") is False
    assert _valid("x" * 1300, "hint", "Bc4") is False


def test_coaching_prompt_safety():
    """HINT user message must not contain best move or PV (prompt-level safety)."""
    from app.services.coaching import SYSTEM_PROMPT, build_user_message, fallback_text

    assert "HINT mode: NEVER name" in SYSTEM_PROMPT
    hint = build_user_message(
        level="hint", fen_before="fen", side_to_move="White",
        played_san="Nxf7", classification="BLUNDER", cp_loss=310,
        phase="Middlegame", opening="Italian", best_san="Bxf7+",
        pv_sans=["Bxf7+", "Kxf7"], eval_before="+0.5", eval_after="-2.0",
    )
    assert "Bxf7+" not in hint and "Kxf7" not in hint and "BEST MOVE" not in hint
    rev = build_user_message(
        level="reveal", fen_before="fen", side_to_move="White",
        played_san="Nxf7", classification="BLUNDER", cp_loss=310,
        phase="Middlegame", opening="Italian", best_san="Bxf7+",
        pv_sans=["Bxf7+", "Kxf7"], eval_before="+0.5", eval_after="-2.0",
    )
    assert "Bxf7+" in rev and "PRINCIPAL VARIATION" in rev
    assert "Bxf7+" in fallback_text("reveal", "Bxf7+", "Nxf7")
    assert "Bxf7+" not in fallback_text("hint", "Bxf7+", "Nxf7")


def test_coaching_message_matches_template():
    """User message follows the Option B template exactly (order + labels)."""
    from app.services.coaching import build_user_message

    common = dict(
        fen_before="6r1/3k3p/p1p5/1pPpnr2/P7/6PP/1P1B1P2/R4RK1 b - - 0 26",
        side_to_move="Black", played_san="Nd3", classification="BLUNDER", cp_loss=810,
        phase="Middlegame", opening="Bishops Opening", best_san="Nf3+",
        pv_sans=["Nf3+", "Kg2", "Nxd2"], eval_before="+6.2", eval_after="-1.9",
    )
    assert build_user_message(level="hint", **common) == (
        "MODE: HINT\n"
        "POSITION FEN: 6r1/3k3p/p1p5/1pPpnr2/P7/6PP/1P1B1P2/R4RK1 b - - 0 26\n"
        "SIDE TO MOVE: Black\n"
        "YOUR MISTAKE: Nd3 (BLUNDER, lost ~8.1 pawns, Middlegame, Bishops Opening)\n"
        "EVAL SWING: +6.2 -> -1.9 (from your side)"
    )
    assert build_user_message(level="reveal", lang="HINDI", **common) == (
        "MODE: REVEAL\n"
        "POSITION FEN: 6r1/3k3p/p1p5/1pPpnr2/P7/6PP/1P1B1P2/R4RK1 b - - 0 26\n"
        "SIDE TO MOVE: Black\n"
        "YOUR MISTAKE: Nd3 (BLUNDER, lost ~8.1 pawns, Middlegame, Bishops Opening)\n"
        "BEST MOVE: Nf3+\n"
        "PRINCIPAL VARIATION: Nf3+ Kg2 Nxd2\n"
        "EVAL SWING: +6.2 -> -1.9 (from your side)\n"
        "LANG=HINDI"
    )


class _FakeResp:
    def __init__(self, content, finish="stop", reasoning=None):
        msg = {"role": "assistant", "content": content}
        if reasoning:
            msg["reasoning"] = reasoning
        self._data = {"choices": [{"message": msg, "finish_reason": finish}]}

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


def test_thinking_model_reply_is_cleaned(monkeypatch):
    """<think> blocks never reach the UI; reasoning_effort only sent when configured."""
    import pytest

    from app.services import coaching

    sent = []

    def fake_post(url, **kw):
        sent.append(kw["json"])
        return fake_post.reply

    monkeypatch.setattr(coaching.httpx, "post", fake_post)
    fake_post.reply = _FakeResp("<think>Bc4 wins, but I must not say it.</think>\nYour bishop is idle.\nWhere can it work?")
    assert coaching._call_provider("sys", "user") == "Your bishop is idle.\nWhere can it work?"
    assert "reasoning_effort" not in sent[-1]

    monkeypatch.setattr(coaching, "LLM_REASONING_EFFORT", "none")
    coaching._call_provider("sys", "user")
    assert sent[-1]["reasoning_effort"] == "none"

    # Thinking used the whole budget: unclosed <think>, or reasoning in its own field.
    for reply in (_FakeResp("<think>let me analyse every line", finish="length"),
                  _FakeResp("", finish="length", reasoning="analysing...")):
        fake_post.reply = reply
        with pytest.raises(ValueError, match="LLM_REASONING_EFFORT"):
            coaching._call_provider("sys", "user")


def test_fallback_reason_is_logged(monkeypatch, caplog):
    import httpx

    from app.services import coaching

    monkeypatch.setattr(coaching, "LLM_API_KEY", "k")
    monkeypatch.setattr(coaching, "_call_provider", FakeProvider(httpx.ConnectError("tunnel down")))
    kwargs = dict(level="hint", fallback="basic", fen_before="f", side_to_move="White", played_san="Bb5",
                  classification="BLUNDER", cp_loss=310, phase="Opening", opening=None, best_san="Bc4")
    with caplog.at_level("WARNING", logger="chesslens.coaching"):
        r = coaching.get_coaching(**kwargs)
    assert (r.text, r.source, r.cacheable) == ("basic", "rules-v1", False)
    assert "fell back to rules-v1" in caplog.text and "tunnel down" in caplog.text

    caplog.clear()
    monkeypatch.setattr(coaching, "_call_provider", FakeProvider("Play Bc4!\nOk?"))
    with caplog.at_level("WARNING", logger="chesslens.coaching"):
        coaching.get_coaching(**kwargs)
    assert "spoiler check" in caplog.text


def _mv(**kw):
    from types import SimpleNamespace

    base = dict(ply=33, played_san="Nd3", classification="BLUNDER", cp_loss=400, eval_before_cp=50,
                mate_before=None, eval_after_cp=-350, mate_after=None, best_san=None, pv_sans=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_rules_hint_varies_by_position_and_never_spoils():
    from app.services.coaching import HINT_QUESTION, rules_fallback

    cases = [  # (move, best_san, phase, expected words in the question)
        (_mv(mate_before=2, cp_loss=100_350), "Qh7+", "Middlegame", "forced mate"),
        (_mv(), "Nf3+", "Middlegame", "check"),
        (_mv(), "Bxf7", "Middlegame", "won"),
        (_mv(), "O-O", "Opening", "king"),
        (_mv(), "Nf3", "Opening", "undeveloped"),
        (_mv(), "Kd4", "Endgame", "passed pawns"),
        (_mv(), "Re1", "Middlegame", HINT_QUESTION),
    ]
    seen = set()
    for move, best, phase, expect in cases:
        text = rules_fallback("hint", game=object(), move=move, best_san=best, played_san="Nd3", phase=phase)
        question = text.split("\n")[1]
        assert expect in question, (best, question)
        assert best.rstrip("+#") not in text, text  # spoiler-free
        seen.add(question)
    assert len(seen) == len(cases)  # no two drills share the same question


def test_mate_wording_in_explanations():
    """Mates read as mates, never as '-M0' or '1000 pawns'."""
    from app.services.explanations import mistake_line

    missed = mistake_line(_mv(ply=33, mate_before=1, eval_before_cp=None, mate_after=None,
                              eval_after_cp=150, cp_loss=99_850))
    assert "lets a forced mate slip away" in missed and "pawns" not in missed and "+M1" in missed
    allowed = mistake_line(_mv(ply=34, eval_before_cp=-20, mate_after=3, eval_after_cp=None, cp_loss=99_980))
    assert "allows the opponent a forced mate" in allowed
    slower = mistake_line(_mv(ply=33, classification="MISTAKE", mate_before=2, mate_after=4,
                              eval_before_cp=None, eval_after_cp=None, cp_loss=120))
    assert "takes longer" in slower
    mated = mistake_line(_mv(ply=33, classification=None, mate_before=1, mate_after=0,
                             eval_before_cp=None, eval_after_cp=None, cp_loss=0))
    assert "+M1 → checkmate" in mated and "M0" not in mated


def test_add_missing_columns_on_old_db(tmp_path):
    """init_db() migration: an old training_drills table gains coaching columns, idempotently."""
    from sqlalchemy import create_engine, inspect, text

    from app.db.base import ADDITIVE_COLUMNS, add_missing_columns

    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as conn:
        conn.execute(text(
            "CREATE TABLE training_drills (id INTEGER PRIMARY KEY, fen_before TEXT NOT NULL, "
            "best_uci VARCHAR(16) NOT NULL, acceptable_ucis JSON)"
        ))
        conn.execute(text("INSERT INTO training_drills (id, fen_before, best_uci) VALUES (1, 'f', 'e2e4')"))
    added = add_missing_columns(eng)
    assert sorted(added) == sorted(
        f"training_drills.{c}" for c in ADDITIVE_COLUMNS["training_drills"] if c != "acceptable_ucis"
    )
    cols = {c["name"] for c in inspect(eng).get_columns("training_drills")}
    assert set(ADDITIVE_COLUMNS["training_drills"]) <= cols
    assert add_missing_columns(eng) == []  # idempotent
    with eng.connect() as conn:
        assert conn.execute(text("SELECT best_uci, coaching_hint FROM training_drills")).one() == ("e2e4", None)
