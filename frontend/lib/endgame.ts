import { api } from "./bff";
import { Chess, type Square } from "chess.js";

/* ----------------------------- API types ----------------------------- */

export interface DrillProgress {
  completed: boolean;
  stars: number;
  best_moves: number | null;
  best_time_seconds: number | null;
  attempts: number;
  completions: number;
}

export interface DrillSummary {
  id: string;
  category: string;
  level: number;
  title: string;
  tagline: string;
  difficulty: string;
  est_minutes: number;
  objective_label: string;
  max_moves: number;
  progress: DrillProgress;
  locked: boolean;
}

export interface RecentChallenge {
  challenge_id: string;
  title: string;
  difficulty: string;
  result: string;
  stars: number;
}

export interface Category {
  id: string;
  title: string;
  glyph: string;
  accent: string;
  tagline: string;
  description: string;
  theory: string;
  drills: DrillSummary[];
  completed: number;
  total: number;
  stars: number;
  gen_completed: number;
  gen_attempts: number;
  best_streak: number;
  accuracy: number | null;
  recent: RecentChallenge[];
}

export interface Stats {
  total_drills: number;
  completed: number;
  total_stars: number;
  max_stars: number;
  attempts: number;
  completions: number;
  success_rate: number | null;
  hints_used: number;
  best_streak: number;
  generated_completed: number;
}

export interface HubData {
  categories: Category[];
  stats: Stats;
}

export interface DrillDetail {
  id: string;
  category: string;
  category_title: string;
  level: number;
  title: string;
  tagline: string;
  difficulty: string;
  fen: string;
  player_color: "white" | "black";
  objective: Record<string, unknown>;
  objective_label: string;
  max_moves: number;
  star_moves: number[];
  est_minutes: number;
  instructions: string[];
  tips: string[];
  theory: string;
  hint_count: number;
  strict: boolean;
  progress: DrillProgress;
  locked: boolean;
  next_drill_id: string | null;
  previous_drill_id: string | null;
  engine_available: boolean;
  generated: boolean;
  challenge_id: string | null;
  hint_max: number;
  subcategory: string | null;
  subcategory_title: string | null;
}

export interface SubcategoryProgress {
  completed: number;
  attempts: number;
  stars: number;
}

export interface Subcategory {
  id: string;
  title: string;
  kind: "mate" | "win" | "defend" | "technique";
  blurb: string;
  progress: SubcategoryProgress;
}

export interface TaxonomyCategory {
  id: string;
  title: string;
  glyph: string;
  accent: string;
  tagline: string;
  theory: string;
  completed: number;
  subcategories: Subcategory[];
}

export interface Taxonomy {
  categories: TaxonomyCategory[];
  engine_available: boolean;
}

export interface Session {
  id: number;
  category: string;
  difficulty: string;
  target_count: number;
  status: "active" | "completed" | "ended";
  completed: number;
  correct: number;
  incorrect: number;
  hints: number;
  score: number;
  streak: number;
  best_streak: number;
  total_seconds: number;
  current_drill_id: string | null;
}

export interface SessionBundle {
  session: Session;
  drill: DrillDetail;
  attempt: Attempt;
}

export interface MoveItem {
  move_number: number;
  ply: number;
  san: string;
  uci: string;
  color: "white" | "black";
}

export interface Feedback {
  tone: "info" | "good" | "warn" | "bad";
  message: string;
}

export interface Attempt {
  id: number;
  drill_id: string;
  status: "in_progress" | "completed" | "failed";
  fail_reason: string | null;
  objective_met: boolean;
  fen: string;
  start_fen: string;
  player_color: "white" | "black";
  turn: "white" | "black";
  is_check: boolean;
  is_checkmate: boolean;
  is_stalemate: boolean;
  is_game_over: boolean;
  moves: MoveItem[];
  player_moves: number;
  max_moves: number;
  moves_left: number;
  last_move: [string, string] | null;
  captured_white: string[];
  captured_black: string[];
  material_advantage: number;
  hints_used: number;
  hint_level: number;
  mistakes: number;
  solution_revealed: boolean;
  eval_cp: number | null;
  eval_mate: number | null;
  objective: Record<string, unknown>;
  objective_label: string;
  started_at: string;
  completed_at: string | null;
  elapsed_seconds: number;
  stars: number | null;
  accuracy: number | null;
  feedback: Feedback | null;
  next_drill_id: string | null;
  engine_available: boolean;
  session_id: number | null;
  session: Session | null;
}

export interface HintResult {
  level: number;
  text: string;
  best_uci: string | null;
  best_san: string | null;
  from_square: string | null;
  to_square: string | null;
  source: string | null;
  hints_used: number;
}

export interface SolutionMove {
  san: string;
  uci: string;
  from_square: string;
  to_square: string;
  color: "white" | "black";
  fen_after: string;
  is_capture: boolean;
  is_check: boolean;
  is_mate: boolean;
  promotion: string | null;
}

export interface RevealResult {
  model_line: string[];
  pv_sans: string[];
  note: string;
  solution_revealed: boolean;
  solution: SolutionMove[];
  start_fen: string | null;
  final_fen: string | null;
  objective_achieved: boolean;
  source: string;
  error: string | null;
}

/* ----------------------------- API calls ----------------------------- */

export const fetchHub = () => api<HubData>("endgame/drills");
export const fetchDrill = (id: string) => api<DrillDetail>(`endgame/drills/${id}`);
export const fetchActive = (id: string) => api<Attempt | null>(`endgame/drills/${id}/active`);
export const startDrill = (id: string) =>
  api<Attempt>(`endgame/drills/${id}/start`, { method: "POST" });
export const submitMove = (attemptId: number, uci: string) =>
  api<Attempt>(`endgame/attempts/${attemptId}/move`, { method: "POST", body: { move: uci } });
export const requestHint = (attemptId: number) =>
  api<HintResult>(`endgame/attempts/${attemptId}/hint`, { method: "POST" });
export const revealSolution = (attemptId: number) =>
  api<RevealResult>(`endgame/attempts/${attemptId}/reveal`, { method: "POST" });
export const resetAttempt = (attemptId: number) =>
  api<Attempt>(`endgame/attempts/${attemptId}/reset`, { method: "POST" });
export const generateChallenge = (category: string, difficulty?: string, subcategory?: string) =>
  api<DrillDetail>("endgame/generate", { method: "POST", body: { category, difficulty, subcategory } });
export const fetchTaxonomy = () => api<Taxonomy>("endgame/taxonomy");
export const startSession = (category: string, difficulty: string | undefined, count: number) =>
  api<SessionBundle>("endgame/sessions/start", { method: "POST", body: { category, difficulty, count } });
export const sessionNext = (sessionId: number) =>
  api<SessionBundle>(`endgame/sessions/${sessionId}/next`, { method: "POST" });
export const sessionEnd = (sessionId: number) =>
  api<Session>(`endgame/sessions/${sessionId}/end`, { method: "POST" });
export const getSession = (sessionId: number) =>
  api<SessionBundle>(`endgame/sessions/${sessionId}`);

export const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;
export const SESSION_COUNTS = [5, 10, 20, 0] as const;

/* --------------------------- Display helpers --------------------------- */

export interface AccentStyle {
  text: string;
  border: string;
  bg: string;
  chip: string;
  bar: string;
  glow: string;
  gradient: string;
  ring: string;
}

export const ACCENTS: Record<string, AccentStyle> = {
  emerald: {
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    bar: "bg-emerald-400",
    glow: "shadow-[0_0_40px_-12px_rgba(16,185,129,0.55)]",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    ring: "ring-emerald-500/40",
  },
  sky: {
    text: "text-sky-300",
    border: "border-sky-500/40",
    bg: "bg-sky-500/10",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    bar: "bg-sky-400",
    glow: "shadow-[0_0_40px_-12px_rgba(14,165,233,0.55)]",
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
    ring: "ring-sky-500/40",
  },
  amber: {
    text: "text-amber-300",
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    bar: "bg-amber-400",
    glow: "shadow-[0_0_40px_-12px_rgba(245,158,11,0.55)]",
    gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
    ring: "ring-amber-500/40",
  },
  violet: {
    text: "text-violet-300",
    border: "border-violet-500/40",
    bg: "bg-violet-500/10",
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    bar: "bg-violet-400",
    glow: "shadow-[0_0_40px_-12px_rgba(139,92,246,0.55)]",
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    ring: "ring-violet-500/40",
  },
  rose: {
    text: "text-rose-300",
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    bar: "bg-rose-400",
    glow: "shadow-[0_0_40px_-12px_rgba(244,63,94,0.55)]",
    gradient: "from-rose-500/20 via-rose-500/5 to-transparent",
    ring: "ring-rose-500/40",
  },
  teal: {
    text: "text-teal-300",
    border: "border-teal-500/40",
    bg: "bg-teal-500/10",
    chip: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    bar: "bg-teal-400",
    glow: "shadow-[0_0_40px_-12px_rgba(20,184,166,0.55)]",
    gradient: "from-teal-500/20 via-teal-500/5 to-transparent",
    ring: "ring-teal-500/40",
  },
};

export const accentOf = (a: string): AccentStyle => ACCENTS[a] ?? ACCENTS.emerald;

export const DIFFICULTY_STYLE: Record<string, string> = {
  Beginner: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Intermediate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Advanced: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export const PIECE_SYMBOLS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

/** Convert a from/to click into UCI options, detecting promotions (chess.js). */
export function uciOptions(from: string, to: string, fen: string): string[] {
  try {
    const c = new Chess(fen);
    const moves = c.moves({ square: from as Square, verbose: true });
    const match = moves.filter((m) => m.to === to);
    if (match.length === 0) return [];
    const promos = match.filter((m) => m.promotion);
    if (promos.length > 0) return promos.map((m) => `${from}${to}${m.promotion}`);
    return [`${from}${to}`];
  } catch {
    return [];
  }
}