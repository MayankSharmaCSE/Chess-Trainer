"""Chess.com-style Endgames taxonomy: 6 categories, 34 subcategories.

This is the navigation catalog for the redesigned two-panel Endgame Trainer.
Each subcategory maps to a dynamic generator in app.services.endgame_gen.endgames
(or a legacy generator re-tagged into the new taxonomy). The legacy four-category
catalog in endgame_drills.py is preserved for curated drills and old URLs.
"""

from __future__ import annotations

# kind: mate = deliver checkmate, win = convert a winning endgame,
#       defend = hold the draw, technique = positional technique objectives.
ENDGAME_CATEGORIES: list[dict] = [
    {
        "id": "checkmates",
        "title": "Checkmates",
        "glyph": "♛",
        "accent": "emerald",
        "tagline": "Force the final blow with every material combination.",
        "theory": (
            "Every basic mate is a forced win with correct technique: drive the lone king "
            "to the edge, coordinate your pieces with king support, and deliver mate without "
            "stalemating. Queen vs rook is won by forks and skewers that win the rook."
        ),
        "subcategories": [
            {"id": "cm-two-rooks", "title": "Two Rooks Mate", "kind": "mate",
             "blurb": "The ladder mate — roll the king to the edge."},
            {"id": "cm-queen", "title": "Queen Mate", "kind": "mate",
             "blurb": "Box the king with the queen, finish with your king."},
            {"id": "cm-rook", "title": "Rook Mate", "kind": "mate",
             "blurb": "Cut off, opposition, back-rank mate."},
            {"id": "cm-two-bishops", "title": "Two Bishops Mate", "kind": "mate",
             "blurb": "Diagonal scissors drive the king to a corner."},
            {"id": "cm-bishop-knight", "title": "Bishop and Knight Mate", "kind": "mate",
             "blurb": "The W-pattern — mate in the bishop's corner."},
            {"id": "cm-queen-vs-rook", "title": "Queen vs Rook", "kind": "win",
             "blurb": "Win the rook with forks, or force mate."},
        ],
    },
    {
        "id": "pawn",
        "title": "Pawn",
        "glyph": "♟",
        "accent": "violet",
        "tagline": "Opposition, key squares, breakthroughs and races.",
        "theory": (
            "King + pawn wins when the king leads with the opposition; rook pawns and "
            "king-behind-pawn setups are drawn with correct defence. Learn to win the "
            "winning ones AND hold the drawn ones — both are essential endgame skill."
        ),
        "subcategories": [
            {"id": "pw-winning-kp", "title": "Winning King and Pawn", "kind": "win",
             "blurb": "King in front, opposition, promote."},
            {"id": "pw-drawn-kp", "title": "Drawn King and Pawn", "kind": "defend",
             "blurb": "Defend: hold opposition or the corner stalemate."},
            {"id": "pw-intermediate-wins", "title": "Intermediate Wins", "kind": "win",
             "blurb": "Breakthroughs and outside passed pawns."},
            {"id": "pw-intermediate-draws", "title": "Intermediate Draws", "kind": "defend",
             "blurb": "Defend harder pawn endings — find the draw."},
            {"id": "pw-advanced-wins", "title": "Advanced Wins", "kind": "win",
             "blurb": "Multi-pawn conversions and pawn races."},
            {"id": "pw-advanced-draws", "title": "Advanced Draws", "kind": "defend",
             "blurb": "Defend complex pawn endings under pressure."},
        ],
    },
    {
        "id": "minor",
        "title": "Minor Piece",
        "glyph": "♝",
        "accent": "sky",
        "tagline": "Bishops, knights and the colour complex.",
        "theory": (
            "Bishops dominate open diagonals; knights need outposts. Same-colour bishop "
            "endings hinge on king activity; opposite-colour bishops draw even a pawn or "
            "two down — but three connected passers usually win. Two knights cannot force "
            "mate vs a lone king: coordination is the honest goal."
        ),
        "subcategories": [
            {"id": "mp-bishop", "title": "Bishop Endgames", "kind": "win",
             "blurb": "Bishop + pawn conversions."},
            {"id": "mp-knight", "title": "Knight Endgames", "kind": "win",
             "blurb": "Knight + pawn wins and knight coordination."},
            {"id": "mp-bishop-vs-knight", "title": "Bishop vs Knight", "kind": "win",
             "blurb": "Fight for the right terrain."},
            {"id": "mp-same-bishops", "title": "Same-Color Bishops", "kind": "win",
             "blurb": "King activity decides."},
            {"id": "mp-opposite-bishops", "title": "Opposite-Color Bishops", "kind": "win",
             "blurb": "Win with connected passers — or recognize the draw."},
            {"id": "mp-advanced", "title": "Advanced Minor Piece Endgames", "kind": "win",
             "blurb": "Mixed minors and pawns."},
        ],
    },
    {
        "id": "rook",
        "title": "Rook",
        "glyph": "♜",
        "accent": "amber",
        "tagline": "The most common endgame in chess.",
        "theory": (
            "Rook endings are drawn more often than any other — but technique decides. "
            "Lucena: build the bridge and win. Philidor: keep the rook on the sixth until "
            "the pawn advances, then check from behind. Active rooks and king activity "
            " outweigh a pawn."
        ),
        "subcategories": [
            {"id": "rk-basic", "title": "Basic Rook Endings", "kind": "mate",
             "blurb": "King + rook technique: cut, box, mate."},
            {"id": "rk-rook-pawn-vs-king", "title": "Rook and Pawn vs King", "kind": "win",
             "blurb": "Escort the pawn with rook and king."},
            {"id": "rk-rook-vs-pawn", "title": "Rook vs Pawn", "kind": "win",
             "blurb": "Stop the passer — win the pawn or mate."},
            {"id": "rk-rook-pawn-endings", "title": "Rook and Pawn Endings", "kind": "win",
             "blurb": "Rook + pawn vs rook conversions."},
            {"id": "rk-lucena", "title": "Lucena Position", "kind": "win",
             "blurb": "Build the bridge — the winning method."},
            {"id": "rk-philidor", "title": "Philidor Position", "kind": "defend",
             "blurb": "Defend: sixth-rank rook, then checks from behind."},
            {"id": "rk-advanced", "title": "Advanced Rook Endings", "kind": "win",
             "blurb": "Multi-pawn rook endings."},
        ],
    },
    {
        "id": "queen",
        "title": "Queen",
        "glyph": "♕",
        "accent": "rose",
        "tagline": "Precision with the most powerful piece.",
        "theory": (
            "Queen mates are fast but stalemate-prone. Queen vs pawn on the seventh wins "
            "by checks, pins and king approach — except rook pawns with the king close. "
            "In queen endings, perpetual check is the defender's best friend."
        ),
        "subcategories": [
            {"id": "q-basic", "title": "Basic Queen Endings", "kind": "mate",
             "blurb": "King + queen mate without stalemate."},
            {"id": "q-defending", "title": "Defending Queen Endings", "kind": "defend",
             "blurb": "Defend inferior queen endings — seek perpetual."},
            {"id": "q-advanced", "title": "Advanced Queen Endings", "kind": "win",
             "blurb": "Queen + pawn vs queen."},
            {"id": "q-vs-pawn", "title": "Queen vs Pawn", "kind": "win",
             "blurb": "Catch the pawn on the seventh."},
        ],
    },
    {
        "id": "imbalances",
        "title": "Imbalances",
        "glyph": "♞",
        "accent": "teal",
        "tagline": "Convert material imbalances — or defend them.",
        "theory": (
            "Rook beats a lone minor piece; two minors usually hold against a rook. "
            "Queen vs two rooks hinges on coordination: loose rooks fall to forks. "
            "Learn which imbalances win, which draw, and how to play both sides."
        ),
        "subcategories": [
            {"id": "im-rook-vs-minor", "title": "Rook vs Minor Piece", "kind": "win",
             "blurb": "Convert the exchange — win the minor piece."},
            {"id": "im-rook-vs-two-minor", "title": "Rook vs Two Minor Pieces", "kind": "defend",
             "blurb": "Defend: two minors hold the rook."},
            {"id": "im-queen-vs-two-rooks", "title": "Queen vs Two Rooks", "kind": "win",
             "blurb": "Fork the rooks — queen wins when they disconnect."},
            {"id": "im-basic", "title": "Basic Imbalances", "kind": "win",
             "blurb": "Exchange-up conversions."},
            {"id": "im-advanced", "title": "Advanced Imbalances", "kind": "win",
             "blurb": "Complex material fights."},
        ],
    },
]

CATEGORY_BY_ID: dict[str, dict] = {c["id"]: c for c in ENDGAME_CATEGORIES}
SUBCATEGORY_BY_ID: dict[str, dict] = {
    s["id"]: {**s, "category": c["id"], "category_title": c["title"], "accent": c["accent"]}
    for c in ENDGAME_CATEGORIES
    for s in c["subcategories"]
}
ALL_SUBCATEGORY_IDS: list[str] = list(SUBCATEGORY_BY_ID)