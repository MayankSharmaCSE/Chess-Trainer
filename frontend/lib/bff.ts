export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Same-origin call to the backend via app/api/bff proxy (session cookie attached). */
export async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`/api/bff/${path}`, {
    method: opts?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.detail ?? data?.error ?? `Request failed (${res.status}).`
    );
  }
  return data as T;
}

export interface ConnectedAccount {
  id: number;
  platform: string;
  username: string;
  status: string;
  game_count: number;
  last_synced_at: string | null;
  created_at: string;
}

export interface GameSummary {
  id: number;
  platform: string;
  url: string | null;
  white_username: string | null;
  black_username: string | null;
  white_rating: number | null;
  black_rating: number | null;
  user_color: string | null;
  user_result: string | null;
  opponent: string | null;
  time_control: string | null;
  rated: boolean | null;
  opening_name: string | null;
  played_at: string | null;
}

export interface GameDetail extends GameSummary {
  pgn: string;
}

export function platformLabel(p: string) {
  return p === "lichess" ? "Lichess" : "Chess.com";
}

export function resultLabel(r: string | null) {
  return r === "win" ? "WIN" : r === "loss" ? "LOSS" : r === "draw" ? "DRAW" : "—";
}

export interface PhaseBucket {
  phase: string; // Opening | Middlegame | Endgame
  blunder: number;
  mistake: number;
  inaccuracy: number;
  total: number;
}

export interface OpeningStat {
  opening: string;
  games: number;
  flags: number;
}

export interface EvidenceGame {
  id: number;
  opponent: string | null;
  played_at: string | null;
  user_result: string | null;
  flags: number;
}

export interface AnalyzedGame {
  id: number;
  opponent: string | null;
  played_at: string | null;
  user_result: string | null;
  opening_name: string | null;
}

export interface WeaknessReport {
  games_analyzed: number;
  user_moves_analyzed: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  phases: PhaseBucket[];
  top_openings: OpeningStat[];
  sample_games: EvidenceGame[];
  insufficient_data: boolean;
}

export interface MoveAnalysis {
  ply: number;
  played_san: string;
  played_uci: string;
  best_san: string | null;
  best_uci: string | null;
  pv_sans: string[] | null;
  eval_before_cp: number | null;
  mate_before: number | null;
  eval_after_cp: number | null;
  mate_after: number | null;
  cp_loss: number;
  classification: string | null;
  is_user_move: boolean;
}

export interface AnalysisOut {
  status: string; // pending | done | failed
  engine_name: string | null;
  engine_version: string | null;
  depth: number | null;
  blunder_count: number;
  mistake_count: number;
  inaccuracy_count: number;
  error: string | null;
  completed_at: string | null;
  moves: MoveAnalysis[];
}

export interface MoveExplanation {
  ply: number;
  played_san: string;
  classification: string | null;
  explanation: string;
  source: string;
  best_san: string | null;
  pv_sans: string[] | null;
}

export interface Drill {
  id: number;
  game_id: number;
  fen_before: string;
  classification: string;
  phase: string;
  opening: string | null;
  played_san: string;
  best_san: string | null;
  pv_sans: string[] | null;
  solved: boolean;
  has_coaching?: boolean; // a hint is already cached server-side
}

export interface AttemptResult {
  correct: boolean;
  played_san: string | null;
  best_san: string | null;
  solved: boolean;
  equivalent: boolean;
}

export interface DrillCoaching {
  level: string;
  text: string;
  source: string;
}

export interface TrainingStats {
  total_drills: number;
  solved: number;
  unsolved: number;
  attempts: number;
  correct_attempts: number;
}

export interface ProgressGamePoint {
  game_id: number;
  played_at: string | null;
  user_result: string | null;
  user_rating: number | null;
  opponent: string | null;
  opening: string | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  user_moves: number;
  accuracy: number | null;
}

export interface ProgressReport {
  games_analyzed: number;
  points: ProgressGamePoint[];
  rating_trend: { played_at: string | null; rating: number }[];
  avg_blunders_per_game: number;
  avg_mistakes_per_game: number;
  avg_inaccuracies_per_game: number;
  overall_accuracy: number | null;
  phases: { phase: string; blunders: number; mistakes: number; inaccuracies: number; total: number }[];
  training: { day: string; attempts: number; correct: number }[];
  training_accuracy: number | null;
  training_completion_rate: number | null;
  insufficient_data: boolean;
}

export interface Bot {
  id: string;
  name: string;
  rating: number;
  skill_level: number;
  difficulty: string;
  description: string;
  avatar: string | null;
  depth: number;
}

export interface BotMoveHistoryItem {
  move_number: number;
  ply: number;
  san: string;
  uci: string;
  color: "white" | "black";
}

export interface BotGame {
  id: number;
  user_id: number;
  bot_id: string;
  bot: Bot;
  player_color: "white" | "black";
  result: "win" | "loss" | "draw" | "in_progress";
  status: string;
  pgn: string;
  fen: string;
  total_moves: number;
  time_control: string | null;
  moves: BotMoveHistoryItem[];
  captured_white: string[];
  captured_black: string[];
  material_advantage: number;
  turn: "white" | "black";
  is_check: boolean;
  is_checkmate: boolean;
  is_game_over: boolean;
  last_move: [string, string] | null;
  ai_move: string | null;
  started_at: string;
  completed_at: string | null;
  linked_game_id: number | null;
}

export interface BotGameAnalysis {
  game_id: number;
  linked_game_id: number | null;
  result: string;
  player_color: string;
  accuracy: number;
  performance_rating: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  best_move: string | null;
  worst_move: string | null;
  moves: MoveAnalysis[];
}

