/**
 * Pure derivations for the player profile.
 *
 * Everything here is computed from real API data (synced games, Stockfish
 * progress, training stats). Demo-only content (friends, clubs, posts,
 * country) lives in `profile-mock.ts` so the boundary stays visible.
 */

import { Chess } from "chess.js";
import type { GameSummary, ProgressReport, TrainingStats } from "./bff";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Speed = "bullet" | "blitz" | "rapid" | "classical" | "daily";

export const SPEEDS: { id: Speed; label: string }[] = [
  { id: "bullet", label: "Bullet" },
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "classical", label: "Classical" },
  { id: "daily", label: "Daily" },
];

export function speedLabel(speed: Speed): string {
  return SPEEDS.find((s) => s.id === speed)?.label ?? "Blitz";
}

/* ----------------------------- time controls ----------------------------- */

/** Map a platform time control to a Chess.com-style speed bucket. */
export function classifyTimeControl(tc: string | null | undefined): Speed | null {
  if (!tc) return null;
  const value = tc.trim().toLowerCase();
  if (value === "bullet" || value === "blitz" || value === "rapid" || value === "classical") {
    return value;
  }
  // Chess.com daily games use "1/86400"; Lichess correspondence has no clock.
  if (value.includes("/") || value === "correspondence") return "daily";

  const base = Number.parseInt(value.split("+")[0], 10);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (base < 180) return "bullet";
  if (base < 600) return "blitz";
  if (base < 1800) return "rapid";
  if (base < 86400) return "classical";
  return "daily";
}

/** Human label for a raw time control ("180" -> "3", "300+2" -> "5+2"). */
export function formatTimeControl(tc: string | null | undefined): string {
  if (!tc) return "—";
  const value = tc.trim();
  if (!value) return "—";
  if (value.includes("/")) return "Daily";
  if (["bullet", "blitz", "rapid", "classical", "correspondence"].includes(value.toLowerCase())) {
    return value[0].toUpperCase() + value.slice(1);
  }
  const [baseRaw, incRaw] = value.split("+");
  const base = Number.parseInt(baseRaw, 10);
  if (!Number.isFinite(base) || base <= 0) return value;
  const minutes = base < 60 ? `${base}s` : `${Math.round((base / 60) * 10) / 10} min`;
  const inc = Number.parseInt(incRaw ?? "", 10);
  return Number.isFinite(inc) && inc > 0 ? `${minutes}+${inc}` : minutes;
}

/* -------------------------------- ratings -------------------------------- */

export function userRating(game: GameSummary): number | null {
  if (game.user_color === "white") return game.white_rating;
  if (game.user_color === "black") return game.black_rating;
  return null;
}

export function opponentRating(game: GameSummary): number | null {
  if (game.user_color === "white") return game.black_rating;
  if (game.user_color === "black") return game.white_rating;
  return null;
}

export interface GameRecord {
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

export function gameRecord(games: GameSummary[]): GameRecord {
  const record: GameRecord = { wins: 0, losses: 0, draws: 0, total: games.length };
  for (const game of games) {
    if (game.user_result === "win") record.wins += 1;
    else if (game.user_result === "loss") record.losses += 1;
    else if (game.user_result === "draw") record.draws += 1;
  }
  return record;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export interface RatingPoint {
  id: number;
  gameId: number;
  playedAt: string | null;
  rating: number;
  result: string | null;
  opponent: string | null;
}

export function ratingPoints(games: GameSummary[], speed: Speed): RatingPoint[] {
  return games
    .filter((game) => classifyTimeControl(game.time_control) === speed)
    .map((game) => ({
      id: game.id,
      gameId: game.id,
      playedAt: game.played_at,
      rating: userRating(game),
      result: game.user_result,
      opponent: game.opponent,
    }))
    .filter((point): point is RatingPoint => point.rating != null)
    .sort((a, b) => Date.parse(a.playedAt ?? "") - Date.parse(b.playedAt ?? ""));
}

export interface RatingStat {
  speed: Speed;
  current: number | null;
  peak: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export function ratingStats(games: GameSummary[]): RatingStat[] {
  return SPEEDS.map(({ id }) => {
    const points = ratingPoints(games, id);
    const record = gameRecord(games.filter((game) => classifyTimeControl(game.time_control) === id));
    return {
      speed: id,
      current: points.length > 0 ? points[points.length - 1].rating : null,
      peak: points.length > 0 ? Math.max(...points.map((p) => p.rating)) : null,
      games: record.total,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
    };
  });
}

const HEADLINE_ORDER: Speed[] = ["blitz", "rapid", "classical", "bullet", "daily"];

/** The rating shown next to the username (Chess.com shows the main format). */
export function headlineRating(games: GameSummary[]): { speed: Speed; rating: number | null } {
  const stats = ratingStats(games);
  for (const speed of HEADLINE_ORDER) {
    const stat = stats.find((s) => s.speed === speed);
    if (stat?.current != null) return { speed, rating: stat.current };
  }
  const mostPlayed = [...stats].sort((a, b) => b.games - a.games)[0];
  if (mostPlayed && mostPlayed.games > 0) {
    return { speed: mostPlayed.speed, rating: mostPlayed.current };
  }
  return { speed: "blitz", rating: null };
}

/* ------------------------------- accuracy -------------------------------- */

/** game id -> accuracy fraction (0..1) for analyzed games only. */
export function accuracyByGame(report: ProgressReport | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!report) return map;
  for (const point of report.points) {
    if (point.accuracy != null) map.set(point.game_id, point.accuracy);
  }
  return map;
}

export function accuracyPct(report: ProgressReport | null): number | null {
  return report?.overall_accuracy == null ? null : Math.round(report.overall_accuracy * 100);
}

export function analysisCoverage(report: ProgressReport | null, totalGames: number): number {
  const analyzed = report?.games_analyzed ?? 0;
  return pct(analyzed, Math.max(totalGames, analyzed));
}

/* ------------------------------- openings -------------------------------- */

export interface OpeningStat {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** (wins + draws / 2) / games as a percentage. */
  score: number;
}

export function openingPerformance(games: GameSummary[], limit = 6): OpeningStat[] {
  const map = new Map<string, OpeningStat>();
  for (const game of games) {
    const name = game.opening_name?.trim() || "Unclassified";
    const entry = map.get(name) ?? { name, games: 0, wins: 0, draws: 0, losses: 0, score: 0 };
    entry.games += 1;
    if (game.user_result === "win") entry.wins += 1;
    else if (game.user_result === "draw") entry.draws += 1;
    else if (game.user_result === "loss") entry.losses += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, score: pct(entry.wins + entry.draws / 2, entry.games) }))
    .sort((a, b) => b.games - a.games || b.score - a.score)
    .slice(0, limit);
}

/* -------------------------------- formats -------------------------------- */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function shortNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${value}`;
}

/* ------------------------------ game preview ----------------------------- */

export interface GamePreview {
  fen: string;
  lastMove: [string, string] | null;
}

/** Replay a stored PGN to the final position, for the board thumbnail. */
export function finalPosition(pgn: string | null | undefined): GamePreview {
  if (!pgn) return { fen: START_FEN, lastMove: null };
  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    const history = chess.history({ verbose: true });
    const last = history[history.length - 1];
    return {
      fen: chess.fen(),
      lastMove: last ? [last.from, last.to] : null,
    };
  } catch {
    return { fen: START_FEN, lastMove: null };
  }
}

/* ------------------------------ achievements ----------------------------- */

export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  glyph: string;
  tier: AchievementTier;
  current: number;
  target: number;
  unit?: string;
}

export function achievementProgress(achievement: Achievement): number {
  if (achievement.target <= 0) return 100;
  return Math.min(100, Math.round((achievement.current / achievement.target) * 100));
}

export function isAchievementUnlocked(achievement: Achievement): boolean {
  return achievement.current >= achievement.target;
}

export interface AchievementInput {
  games: GameSummary[];
  progress: ProgressReport | null;
  training: TrainingStats | null;
  endgameCompleted: number;
}

export function buildAchievements(input: AchievementInput): Achievement[] {
  const record = gameRecord(input.games);
  const analyzed = input.progress?.games_analyzed ?? 0;
  const accuracy = accuracyPct(input.progress) ?? 0;
  return [
    {
      id: "first-win",
      title: "First Blood",
      description: "Win a synced game and open your account with a W.",
      glyph: "♙",
      tier: "bronze",
      current: Math.min(record.wins, 1),
      target: 1,
    },
    {
      id: "regular",
      title: "Regular",
      description: "Sync 25 games to give the weakness map something to chew on.",
      glyph: "♘",
      tier: "silver",
      current: input.games.length,
      target: 25,
      unit: "games",
    },
    {
      id: "centurion",
      title: "Centurion",
      description: "Reach 100 synced games across Chess.com and Lichess.",
      glyph: "♜",
      tier: "gold",
      current: input.games.length,
      target: 100,
      unit: "games",
    },
    {
      id: "film-room",
      title: "Film Room",
      description: "Run Stockfish over 10 of your own games.",
      glyph: "♗",
      tier: "silver",
      current: analyzed,
      target: 10,
      unit: "analyzed",
    },
    {
      id: "deep-study",
      title: "Deep Study",
      description: "Analyze 50 games and watch the mistake patterns surface.",
      glyph: "♛",
      tier: "platinum",
      current: analyzed,
      target: 50,
      unit: "analyzed",
    },
    {
      id: "sharpshooter",
      title: "Sharpshooter",
      description: "Hold a 70% average accuracy across analyzed games.",
      glyph: "♚",
      tier: "gold",
      current: accuracy,
      target: 70,
      unit: "%",
    },
    {
      id: "drill-sergeant",
      title: "Drill Sergeant",
      description: "Solve 10 training positions taken from your own blunders.",
      glyph: "♟",
      tier: "silver",
      current: input.training?.solved ?? 0,
      target: 10,
      unit: "drills",
    },
    {
      id: "grinder",
      title: "Grinder",
      description: "Make 100 training attempts. Volume beats talent.",
      glyph: "♞",
      tier: "gold",
      current: input.training?.attempts ?? 0,
      target: 100,
      unit: "attempts",
    },
    {
      id: "endgame-initiate",
      title: "Endgame Initiate",
      description: "Complete 5 verified endgame drills against Stockfish.",
      glyph: "♔",
      tier: "platinum",
      current: input.endgameCompleted,
      target: 5,
      unit: "drills",
    },
  ];
}

export function endgameCompletedCount(taxonomy: { categories: { completed: number }[] } | null): number {
  return taxonomy ? taxonomy.categories.reduce((sum, category) => sum + category.completed, 0) : 0;
}
