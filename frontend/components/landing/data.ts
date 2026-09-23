// All landing-page content and demo data lives here, so copy and numbers
// can be edited without touching the components.

export const BRAND = "ChessLens"; // working name, rename freely
export const SIGNUP_URL = "/signup";
export const LOGIN_URL = "/login";

export type MistakeKind = "BLUNDER" | "MISTAKE" | "INACCURACY";

export interface DemoMistake {
  ply: number; // ply at which the mistake was played (1 = White's first move)
  label: string; // move as written in the score
  kind: MistakeKind;
  symbol: string; // ??, ?, ?!
  evalBefore: string;
  evalAfter: string;
  played: [string, string];
  best: { san: string; from: string; to: string };
  accept: string[]; // SAN moves accepted in the drill
  explanation: string;
  hint: string;
}

// Real game: the Blackburne Shilling trap, analyzed with Stockfish 16 at depth 20.
// Evaluations are from White's point of view, in pawns.
export const DEMO_GAME = {
  title: "Sample game: Italian Game, 7 moves",
  white: "You (1340)",
  black: "Opponent (1385)",
  result: "0-1",
  sans: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"],
  // evaluation after each ply; index 0 is the starting position
  evals: [0.3, 0.38, 0.21, 0.24, 0.16, 0.26, 1.18, -0.56, -0.55, -5.71, -6.0, -7.28, -7.24, "-M1", "0-1"] as (number | string)[],
  engine: "Stockfish 16, depth 20",
};

export const DEMO_MISTAKES: DemoMistake[] = [
  {
    ply: 7,
    label: "4. Nxe5",
    kind: "MISTAKE",
    symbol: "?",
    evalBefore: "+1.2",
    evalAfter: "−0.6",
    played: ["f3", "e5"],
    best: { san: "Nxd4", from: "f3", to: "d4" },
    accept: ["Nxd4", "O-O"],
    explanation:
      "Taking the e5 pawn walks into …Qg5, which attacks your knight on e5 and the g2 pawn at the same time. Trading off the knight on d4 first keeps a clear advantage.",
    hint: "Deal with the black knight on d4 before grabbing a pawn.",
  },
  {
    ply: 9,
    label: "5. Nxf7",
    kind: "BLUNDER",
    symbol: "??",
    evalBefore: "−0.5",
    evalAfter: "−5.7",
    played: ["e5", "f7"],
    best: { san: "O-O", from: "e1", to: "g1" },
    accept: ["O-O", "Bxf7+"],
    explanation:
      "The knight takes a pawn but ignores the threat: …Qxg2 now attacks your rook on h1 and Black wins material. Castling protects g2 and keeps the game close to level.",
    hint: "Your g2 pawn and the rook on h1 are under fire.",
  },
  {
    ply: 11,
    label: "6. Rf1",
    kind: "INACCURACY",
    symbol: "?!",
    evalBefore: "−6.0",
    evalAfter: "−7.3",
    played: ["h1", "f1"],
    best: { san: "d3", from: "d2", to: "d3" },
    accept: ["d3"],
    explanation:
      "The rook is saved, but …Qxe4+ follows with check. Playing d3 defends the e4 pawn so that check never happens. The position is already very hard either way.",
    hint: "Look at the pawn on e4. Can a pawn defend it?",
  },
  {
    ply: 13,
    label: "7. Be2",
    kind: "BLUNDER",
    symbol: "??",
    evalBefore: "−7.2",
    evalAfter: "Mate in 1",
    played: ["c4", "e2"],
    best: { san: "Qe2", from: "d1", to: "e2" },
    accept: ["Qe2"],
    explanation:
      "Blocking with the bishop allows …Nf3#. The bishop is pinned by the queen on e4, so it cannot take the knight, and your own pieces cover every escape square. Qe2 was the only move that avoids mate, because it frees d1 for your king.",
    hint: "Block the check with a piece that also frees a square for your king.",
  },
];

// Example weakness report for one player across 120 games (illustrative data)
export const WEAKNESS_PHASES = ["Opening", "Middlegame", "Endgame"] as const;
export const WEAKNESS_CATEGORIES = ["Hanging pieces", "Missed tactics", "King safety", "Pawn structure", "Converting wins"] as const;
export const WEAKNESS_COUNTS: number[][] = [
  [9, 6, 11, 3, 1],
  [14, 21, 8, 6, 4],
  [4, 5, 2, 9, 17],
];
export const WEAKNESS_NOTES: Record<string, string> = {
  "Middlegame|Missed tactics": "21 missed tactics in 120 games, mostly forks and discovered attacks after move 20.",
  "Endgame|Converting wins": "17 winning endgames that ended in a draw or loss, mostly rook endings with a passive king.",
  "Middlegame|Hanging pieces": "14 pieces left undefended, often right after a capture sequence.",
  "Opening|King safety": "11 games where the king stayed in the center past move 10.",
};

export const PROGRESS = {
  weeks: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
  blundersPerGame: [1.9, 1.8, 1.6, 1.6, 1.3, 1.1, 1.0, 0.8],
};

export const FAQ = [
  { q: "Is it free?", a: "You can connect an account and analyze your recent games for free. Deeper analysis of your full history may be part of a paid plan later." },
  { q: "Which platforms are supported?", a: "Chess.com and Lichess. You can also upload PGN files from anywhere else." },
  { q: "Do you need my password?", a: "No. We only need your public username. Games are fetched from each platform's public API." },
  { q: "How long does analysis take?", a: "Your most recent games are ready in a few minutes. Older games are analyzed in the background, and you can watch the progress live." },
  { q: "How accurate are the AI explanations?", a: "Every explanation is written from Stockfish's evaluation of the exact position, and links back to the game, move and engine line it is based on. If the evidence is unclear, the explanation says so." },
];
