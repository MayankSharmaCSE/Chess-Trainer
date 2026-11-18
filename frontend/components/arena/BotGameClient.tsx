"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type BotGame, type BotGameAnalysis, type BotMoveHistoryItem, ApiError } from "@/lib/bff";
import BotAvatar, { getDifficultyBadgeStyle } from "./BotAvatar";
import InteractiveBoard from "./InteractiveBoard";
import "./zoom.css";

interface BotGameClientProps {
  gameId: string;
}

const PIECE_SYMBOLS: Record<string, string> = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
};

function formatTime(seconds: number): string {
  if (seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/* ---------- Inline icons for zoom controls (no extra dependencies) ---------- */

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.split("|").map((path, i) => (
        <path key={i} d={path} />
      ))}
    </svg>
  );
}

const ICON_EXPAND = "M4 9V4h5|M20 9V4h-5|M4 15v5h5|M20 15v5h-5";
const ICON_MINIMIZE = "M9 4v5H4|M15 4v5h5|M9 20v-5H4|M15 20v-5h5";
const ICON_RESTART = "M3 3v5h5|M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8";
const ICON_FLAG = "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7";
const ICON_PANEL = "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M15 3v18";
const ICON_X = "M18 6 6 18|M6 6l12 12";
const ICON_PLUS = "M12 5v14|M5 12h14";
const ICON_SEARCH = "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z|M21 21l-4.35-4.35";

/* ---------- Shared panels (rendered identically in normal & zoom layouts) ---------- */

function MoveHistoryList({
  moves,
  containerRef,
  className = "",
}: {
  moves: BotMoveHistoryItem[];
  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div ref={containerRef} className={`overflow-y-auto pr-1 text-xs font-mono space-y-1 ${className}`}>
      {moves.length === 0 ? (
        <p className="text-center text-slate-500 py-6">Game has not started yet.</p>
      ) : (
        <div className="grid grid-cols-12 gap-1 py-0.5">
          {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, idx) => {
            const whiteMove = moves[idx * 2];
            const blackMove = moves[idx * 2 + 1];

            return (
              <React.Fragment key={idx}>
                <div className="col-span-2 text-slate-500 font-semibold py-1">
                  {idx + 1}.
                </div>
                <div
                  className={`col-span-5 rounded px-2 py-1 transition ${
                    whiteMove && moves.indexOf(whiteMove) === moves.length - 1
                      ? "bg-amber-400/20 text-amber-300 font-bold"
                      : "text-slate-200"
                  }`}
                >
                  {whiteMove?.san || ""}
                </div>
                <div
                  className={`col-span-5 rounded px-2 py-1 transition ${
                    blackMove && moves.indexOf(blackMove) === moves.length - 1
                      ? "bg-amber-400/20 text-amber-300 font-bold"
                      : "text-slate-200"
                  }`}
                >
                  {blackMove?.san || ""}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CapturedRows({ game }: { game: BotGame }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Captured White:</span>
        <span className="font-chesspieces text-base tracking-widest text-slate-200">
          {game.captured_white.length > 0
            ? game.captured_white.map((p) => PIECE_SYMBOLS[p] || p).join(" ")
            : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Captured Black:</span>
        <span className="font-chesspieces text-base tracking-widest text-slate-400">
          {game.captured_black.length > 0
            ? game.captured_black.map((p) => PIECE_SYMBOLS[p] || p).join(" ")
            : "—"}
        </span>
      </div>
    </div>
  );
}

function AnalysisCard({
  game,
  analysis,
  analyzing,
  analysisError,
  onAnalyze,
}: {
  game: BotGame;
  analysis: BotGameAnalysis | null;
  analyzing: boolean;
  analysisError: string | null;
  onAnalyze: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 to-emerald-950/40 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">
          {game.result === "win" ? "🏆" : game.result === "loss" ? "⚔️" : "🤝"}
        </span>
        <div>
          <h3 className="font-display text-base font-bold text-white">
            {game.result === "win"
              ? "Victory!"
              : game.result === "loss"
              ? "Game Over — Defeat"
              : "Draw"}
          </h3>
          <p className="text-xs text-slate-300 capitalize">
            {game.status.replace("_", " ")}
          </p>
        </div>
      </div>

      {/* Analyze My Game Button */}
      {!analysis && (
        <div className="mt-4">
          <button
            type="button"
            disabled={analyzing}
            onClick={onAnalyze}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {analyzing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analyzing with Stockfish...
              </>
            ) : (
              <>
                <span>Analyze My Game</span>
                <span>🔍</span>
              </>
            )}
          </button>
          {analysisError && (
            <p className="mt-2 text-xs text-rose-300 text-center">{analysisError}</p>
          )}
        </div>
      )}

      {/* Analysis Results Display */}
      {analysis && (
        <div className="mt-4 border-t border-slate-800 pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
              <p className="text-[10px] uppercase font-bold text-slate-400">Accuracy</p>
              <p className="text-lg font-extrabold text-emerald-400">
                {analysis.accuracy.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
              <p className="text-[10px] uppercase font-bold text-slate-400">Performance</p>
              <p className="text-lg font-extrabold text-amber-300">
                ~{analysis.performance_rating || game.bot.rating}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
            <div className="rounded-lg bg-rose-500/15 border border-rose-500/30 p-2">
              <p className="text-rose-400 font-extrabold text-sm">{analysis.blunders}</p>
              <p className="text-[10px] text-slate-300">Blunders</p>
            </div>
            <div className="rounded-lg bg-orange-500/15 border border-orange-500/30 p-2">
              <p className="text-orange-400 font-extrabold text-sm">{analysis.mistakes}</p>
              <p className="text-[10px] text-slate-300">Mistakes</p>
            </div>
            <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-2">
              <p className="text-amber-400 font-extrabold text-sm">{analysis.inaccuracies}</p>
              <p className="text-[10px] text-slate-300">Inaccuracies</p>
            </div>
          </div>

          {/* Best & Worst Move Callout */}
          <div className="space-y-1.5 text-xs">
            {analysis.best_move && (
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Best move played:</span>
                <span className="font-bold text-emerald-400">{analysis.best_move}</span>
              </div>
            )}
            {analysis.worst_move && (
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Biggest error:</span>
                <span className="font-bold text-rose-400">{analysis.worst_move}</span>
              </div>
            )}
          </div>

          {/* Deep Integration Links */}
          <div className="pt-2 flex flex-col gap-2">
            {game.linked_game_id && (
              <Link
                href={`/games/${game.linked_game_id}`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800/80 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Open Full Replay & Moves Analysis →
              </Link>
            )}
            <Link
              href="/training"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-700/80 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600"
            >
              Practice Mistakes in Drills →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotGameClient({ gameId }: BotGameClientProps) {
  const router = useRouter();
  const [game, setGame] = useState<BotGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);

  // Clocks
  const [whiteTime, setWhiteTime] = useState<number>(600);
  const [blackTime, setBlackTime] = useState<number>(600);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // Resign modal state
  const [showResignModal, setShowResignModal] = useState(false);
  const [resigning, setResigning] = useState(false);

  // Post game analysis state
  const [analysis, setAnalysis] = useState<BotGameAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Move history scroll refs (normal sidebar + zoom panel)
  const movesContainerRef = useRef<HTMLDivElement>(null);
  const zoomMovesRef = useRef<HTMLDivElement>(null);

  // Immersive zoom mode — presentation only, never touches game state
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomClosing, setZoomClosing] = useState(false);
  const [zoomReturning, setZoomReturning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const zoomTimerRef = useRef<number | null>(null);
  const returnTimerRef = useRef<number | null>(null);

  const openZoom = useCallback(() => {
    if (zoomTimerRef.current !== null) return;
    setPanelOpen(false);
    setZoomOpen(true);
  }, []);

  const closeZoom = useCallback(() => {
    if (zoomTimerRef.current !== null) return; // already animating out
    setZoomClosing(true);
    zoomTimerRef.current = window.setTimeout(() => {
      zoomTimerRef.current = null;
      setZoomOpen(false);
      setZoomClosing(false);
      setPanelOpen(false);
      setZoomReturning(true);
      returnTimerRef.current = window.setTimeout(() => {
        returnTimerRef.current = null;
        setZoomReturning(false);
      }, 280);
    }, 200);
  }, []);

  // Clear pending transition timers on unmount
  useEffect(
    () => () => {
      if (zoomTimerRef.current !== null) window.clearTimeout(zoomTimerRef.current);
      if (returnTimerRef.current !== null) window.clearTimeout(returnTimerRef.current);
    },
    []
  );

  // Lock page scroll while immersive mode is open
  useEffect(() => {
    if (!zoomOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [zoomOpen]);

  // Keyboard shortcuts: F toggles zoom, Escape closes panel / exits zoom
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (showResignModal) {
          setShowResignModal(false);
          return;
        }
        if (!zoomOpen) return;
        if (panelOpen) setPanelOpen(false);
        else closeZoom();
        return;
      }
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!game || loading) return;
        if (zoomOpen) closeZoom();
        else openZoom();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomOpen, panelOpen, showResignModal, game, loading, closeZoom, openZoom]);

  // Initial load
  useEffect(() => {
    let active = true;
    api<BotGame>(`bots/game/${gameId}`)
      .then((data) => {
        if (!active) return;
        setGame(data);
        setLoading(false);

        // Configure initial clocks based on time_control
        let initialSeconds = 600;
        if (data.time_control === "5+0") initialSeconds = 300;
        else if (data.time_control === "3+0") initialSeconds = 180;
        else if (data.time_control === "unlimited") initialSeconds = 0;

        setWhiteTime(initialSeconds);
        setBlackTime(initialSeconds);
        if (!data.is_game_over && data.time_control !== "unlimited") {
          setTimerRunning(true);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load game.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [gameId]);

  // Clock countdown ticker
  useEffect(() => {
    if (!timerRunning || !game || game.is_game_over || game.time_control === "unlimited") return;

    const interval = window.setInterval(() => {
      if (game.turn === "white") {
        setWhiteTime((prev) => Math.max(0, prev - 1));
      } else {
        setBlackTime((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerRunning, game]);

  // Auto-scroll moves containers (normal sidebar + zoom panel)
  useEffect(() => {
    for (const ref of [movesContainerRef, zoomMovesRef]) {
      if (ref.current) {
        ref.current.scrollTop = ref.current.scrollHeight;
      }
    }
  }, [game?.moves, zoomOpen, panelOpen]);

  // Handle Player Move
  async function handleMakeMove(from: string, to: string) {
    if (!game || game.is_game_over || isBotThinking) return;

    setIsBotThinking(true);
    setError(null);

    const moveUci = `${from}${to}`;
    try {
      const updated = await api<BotGame>(`bots/game/${game.id}/move`, {
        method: "POST",
        body: { move: moveUci },
      });
      setGame(updated);
      setIsBotThinking(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Move failed.");
      setIsBotThinking(false);
    }
  }

  // Handle Resign
  async function handleResign() {
    if (!game || game.is_game_over) return;
    setResigning(true);
    try {
      const updated = await api<BotGame>(`bots/game/${game.id}/resign`, {
        method: "POST",
      });
      setGame(updated);
      setShowResignModal(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resign request failed.");
    } finally {
      setResigning(false);
    }
  }

  // Handle Restart
  async function handleRestart() {
    if (!game) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const restarted = await api<BotGame>(`bots/game/${game.id}/restart`, {
        method: "POST",
      });
      setGame(restarted);
      let initialSeconds = 600;
      if (restarted.time_control === "5+0") initialSeconds = 300;
      else if (restarted.time_control === "3+0") initialSeconds = 180;
      else if (restarted.time_control === "unlimited") initialSeconds = 0;

      setWhiteTime(initialSeconds);
      setBlackTime(initialSeconds);
      setTimerRunning(!restarted.is_game_over && restarted.time_control !== "unlimited");
      setLoading(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restart game.");
      setLoading(false);
    }
  }

  // Run Post-Game Analysis
  async function handleAnalyzeGame() {
    if (!game) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await api<BotGameAnalysis>(`bots/game/${game.id}/analyze?depth=12`, {
        method: "POST",
      });
      setAnalysis(result);
      // Surface the results immediately when playing in immersive mode
      if (zoomOpen) setPanelOpen(true);
    } catch (err) {
      setAnalysisError(err instanceof ApiError ? err.message : "Analysis request failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="font-semibold text-slate-300">Loading Bot Arena match...</p>
        </div>
      </div>
    );
  }

  if (error && !game) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-6 text-center text-rose-300">
          <p className="font-bold text-lg">Unable to load game</p>
          <p className="mt-2 text-sm">{error}</p>
          <Link
            href="/bots"
            className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-700"
          >
            Back to Bot Selection
          </Link>
        </div>
      </div>
    );
  }

  if (!game) return null;

  const playerIsWhite = game.player_color === "white";
  const botIsWhite = !playerIsWhite;
  const isPlayerTurn =
    (playerIsWhite && game.turn === "white") || (!playerIsWhite && game.turn === "black");
  const badgeStyle = getDifficultyBadgeStyle(game.bot.difficulty);

  const playerClock = playerIsWhite ? whiteTime : blackTime;
  const botClock = botIsWhite ? whiteTime : blackTime;

  return (
    <>
    <div
      className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${
        zoomOpen ? "bz-hidden" : zoomReturning ? "bz-return" : ""
      }`}
    >
      {/* Top Breadcrumb Navigation & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="transition hover:text-slate-200">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/bots" className="transition hover:text-slate-200">
            Arena
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-200">Match vs {game.bot.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Format: <span className="font-bold text-slate-200">{game.time_control || "10+0"}</span>
          </span>
          <button
            type="button"
            onClick={openZoom}
            title="Enter immersive fullscreen mode (F)"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-all hover:border-emerald-400/70 hover:bg-emerald-500/20 hover:shadow-[0_0_16px_rgba(16,185,129,0.35)] active:scale-95"
          >
            <Icon d={ICON_EXPAND} />
            Immersive View
            <span className="bz-kbd">F</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/bots")}
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            ← Change Bot
          </button>
        </div>
      </div>

      {/* Main Grid: Left Board / Right Sidebar */}
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Section: Board & Player Headers */}
        <div className="lg:col-span-8 flex flex-col items-center">
          <div className="w-full max-w-[620px]">
            {/* Top Opponent Bar (Bot) */}
            <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-800 bg-[#111A2E]/90 px-4 py-2.5 shadow-md">
              <div className="flex items-center gap-3">
                <BotAvatar id={game.bot.id} name={game.bot.name} size="sm" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{game.bot.name}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                    >
                      {game.bot.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>~{game.bot.rating} Elo</span>
                    <span>•</span>
                    <span className="capitalize">{botIsWhite ? "White" : "Black"}</span>
                  </div>
                </div>
              </div>

              {/* Bot Status & Clock */}
              <div className="flex items-center gap-3">
                {isBotThinking && (
                  <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300 border border-amber-500/20">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    Thinking...
                  </div>
                )}
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-extrabold ${
                    !isPlayerTurn && !game.is_game_over
                      ? "border-amber-500/50 bg-amber-950/30 text-amber-300 ring-2 ring-amber-500/30"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  }`}
                >
                  <span className="text-xs">⏱</span>
                  {game.time_control === "unlimited" ? "∞" : formatTime(botClock)}
                </div>
              </div>
            </div>

            {/* Interactive Chessboard */}
            <InteractiveBoard
              fen={game.fen}
              orientation={game.player_color}
              lastMove={game.last_move}
              interactive={!game.is_game_over && !isBotThinking}
              isCheck={game.is_check}
              isCheckmate={game.is_checkmate}
              onMove={handleMakeMove}
            />

            {/* Bottom Player Bar (User) */}
            <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-800 bg-[#111A2E]/90 px-4 py-2.5 shadow-md">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 font-bold text-sm text-sky-400">
                  You
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">You</span>
                    <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                      Player
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="capitalize">{playerIsWhite ? "White" : "Black"}</span>
                    {game.material_advantage !== 0 && (
                      <span className="font-bold text-emerald-400">
                        {game.material_advantage > 0 ? `+${game.material_advantage}` : game.material_advantage}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Player Turn Indicator & Clock */}
              <div className="flex items-center gap-3">
                {isPlayerTurn && !game.is_game_over && (
                  <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Your Turn
                  </div>
                )}
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-extrabold ${
                    isPlayerTurn && !game.is_game_over
                      ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 ring-2 ring-emerald-500/30"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  }`}
                >
                  <span className="text-xs">⏱</span>
                  {game.time_control === "unlimited" ? "∞" : formatTime(playerClock)}
                </div>
              </div>
            </div>

            {/* Transient Move Errors */}
            {error && (
              <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-2.5 text-center text-xs font-semibold text-rose-300">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Game Controls, Move History, Captured Pieces, Analysis */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Bot Profile Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <BotAvatar id={game.bot.id} name={game.bot.name} size="md" />
              <div>
                <h2 className="font-display text-base font-bold text-white">{game.bot.name}</h2>
                <p className="text-xs text-slate-400">Target Rating: ~{game.bot.rating} Elo</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-300 italic border-l-2 border-slate-700 pl-2.5">
              &ldquo;{game.bot.description}&rdquo;
            </p>
          </div>

          {/* Captured Pieces & Material Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Captured Pieces
            </h3>
            <div className="mt-3">
              <CapturedRows game={game} />
            </div>
          </div>

          {/* Move History Table */}
          <div className="flex-1 rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg flex flex-col min-h-[220px] max-h-[340px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Move History
              </h3>
              <span className="text-xs text-slate-400">
                {Math.ceil(game.moves.length / 2)} moves
              </span>
            </div>

            <MoveHistoryList
              moves={game.moves}
              containerRef={movesContainerRef}
              className="mt-2 flex-1"
            />
          </div>

          {/* Action Buttons: Resign, Restart, New Game */}
          <div className="flex flex-col gap-2">
            {!game.is_game_over ? (
              <button
                type="button"
                onClick={() => setShowResignModal(true)}
                className="w-full rounded-xl border border-rose-500/30 bg-rose-950/40 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-900/40"
              >
                Resign Game
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700"
                >
                  Restart Match
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/bots")}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500"
                >
                  New Opponent
                </button>
              </div>
            )}
          </div>

          {/* Post-Game Summary & Analysis Card */}
          {game.is_game_over && (
            <AnalysisCard
              game={game}
              analysis={analysis}
              analyzing={analyzing}
              analysisError={analysisError}
              onAnalyze={handleAnalyzeGame}
            />
          )}
        </div>
      </div>
    </div>

    {/* ============ Immersive Zoom Mode (presentation only) ============ */}
    {zoomOpen && (
      <div
        className={`bz-overlay ${zoomClosing ? "bz-closing" : ""} ${panelOpen ? "bz-panel-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Immersive chess mode — match vs ${game.bot.name}`}
      >
        {/* Top bar: bot identity, clock, panel & exit controls */}
        <header className="bz-top">
          <div className="flex min-w-0 items-center gap-3">
            <BotAvatar id={game.bot.id} name={game.bot.name} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-white">{game.bot.name}</span>
                <span
                  className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                >
                  {game.bot.difficulty}
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-slate-400">
                <span>~{game.bot.rating} Elo</span>
                <span>•</span>
                <span className="capitalize">{botIsWhite ? "White" : "Black"}</span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">{game.time_control || "10+0"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isBotThinking && (
              <div className="hidden md:flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
                <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
                Thinking...
              </div>
            )}
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-extrabold ${
                !isPlayerTurn && !game.is_game_over
                  ? "border-amber-500/50 bg-amber-950/30 text-amber-300 ring-2 ring-amber-500/30"
                  : "border-slate-800 bg-slate-900 text-slate-300"
              }`}
            >
              <span className="text-xs">⏱</span>
              {game.time_control === "unlimited" ? "∞" : formatTime(botClock)}
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="bz-btn bz-btn-icon"
              aria-label={panelOpen ? "Hide match panel" : "Show match panel"}
              title={panelOpen ? "Hide match panel" : "Moves, captures & analysis"}
            >
              <Icon d={panelOpen ? ICON_X : ICON_PANEL} />
            </button>
            <button
              type="button"
              onClick={closeZoom}
              className="bz-btn bz-btn-exit"
              title="Exit immersive mode (Esc)"
            >
              <Icon d={ICON_MINIMIZE} />
              <span className="hidden sm:inline">Exit Zoom</span>
              <span className="bz-kbd hidden sm:inline-flex">Esc</span>
            </button>
          </div>
        </header>

        {/* Stage: the board is the hero, sized to the viewport by CSS */}
        <div className="bz-stage">
          <div className="bz-board-wrap">
            <InteractiveBoard
              fen={game.fen}
              orientation={game.player_color}
              lastMove={game.last_move}
              interactive={!game.is_game_over && !isBotThinking}
              isCheck={game.is_check}
              isCheckmate={game.is_checkmate}
              onMove={handleMakeMove}
              className="bz-board"
            />
          </div>

          {/* Scrim only renders below desktop, where the panel slides over the stage */}
          {panelOpen && (
            <div className="bz-scrim" onClick={() => setPanelOpen(false)} aria-hidden="true" />
          )}

          <aside className="bz-panel bz-scroll" aria-label="Match panel">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Match Panel
              </h3>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="bz-btn bz-btn-icon"
                aria-label="Close panel"
              >
                <Icon d={ICON_X} size={13} />
              </button>
            </div>

            {/* Bot profile */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-3">
                <BotAvatar id={game.bot.id} name={game.bot.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold text-white">
                    {game.bot.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    ~{game.bot.rating} Elo • {game.bot.difficulty}
                  </p>
                </div>
              </div>
              <p className="mt-2 border-l-2 border-slate-700 pl-2.5 text-xs italic leading-relaxed text-slate-300">
                &ldquo;{game.bot.description}&rdquo;
              </p>
            </div>

            {/* Captured pieces */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Captured Pieces
              </h4>
              <div className="mt-2">
                <CapturedRows game={game} />
              </div>
            </div>

            {/* Move history */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Move History
                </h4>
                <span className="text-[10px] text-slate-400">
                  {Math.ceil(game.moves.length / 2)} moves
                </span>
              </div>
              <MoveHistoryList
                moves={game.moves}
                containerRef={zoomMovesRef}
                className="bz-scroll mt-2 max-h-[240px]"
              />
            </div>

            {/* Post-game summary & analysis */}
            {game.is_game_over && (
              <AnalysisCard
                game={game}
                analysis={analysis}
                analyzing={analyzing}
                analysisError={analysisError}
                onAnalyze={handleAnalyzeGame}
              />
            )}
          </aside>
        </div>

        {/* Bottom bar: player identity, clock, recent moves, game controls */}
        <footer className="bz-bottom">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-sm font-bold text-sky-400">
              You
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">You</span>
                {game.is_game_over ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      game.result === "win"
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : game.result === "loss"
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                        : "border-slate-600 bg-slate-800 text-slate-300"
                    }`}
                  >
                    {game.result === "win" ? "🏆 Victory" : game.result === "loss" ? "Defeat" : "Draw"}
                  </span>
                ) : isPlayerTurn ? (
                  <span className="hidden sm:flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    Your Turn
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="capitalize">{playerIsWhite ? "White" : "Black"}</span>
                {game.material_advantage !== 0 && (
                  <span className="font-bold text-emerald-400">
                    {game.material_advantage > 0 ? `+${game.material_advantage}` : game.material_advantage}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`flex flex-none items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-extrabold ${
                isPlayerTurn && !game.is_game_over
                  ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-300 ring-2 ring-emerald-500/30"
                  : "border-slate-800 bg-slate-900 text-slate-300"
              }`}
            >
              <span className="text-xs">⏱</span>
              {game.time_control === "unlimited" ? "∞" : formatTime(playerClock)}
            </div>
          </div>

          {/* Recent moves strip */}
          <div className="hidden lg:flex min-w-0 items-center gap-1.5 overflow-hidden">
            {game.moves.slice(-6).map((m, i, arr) => (
              <span
                key={`${m.ply}-${m.san}`}
                className={`bz-move-chip ${i === arr.length - 1 ? "bz-move-chip-last" : ""}`}
              >
                <span className="text-slate-500">
                  {m.color === "white" ? `${m.move_number}.` : `${m.move_number}…`}
                </span>
                {m.san}
              </span>
            ))}
          </div>

          {/* Essential game controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestart}
              className="bz-btn"
              title="Restart this match"
            >
              <Icon d={ICON_RESTART} />
              <span className="hidden sm:inline">Restart</span>
            </button>
            {!game.is_game_over ? (
              <button
                type="button"
                onClick={() => setShowResignModal(true)}
                className="bz-btn bz-btn-danger"
                title="Resign this game"
              >
                <Icon d={ICON_FLAG} />
                <span className="hidden sm:inline">Resign</span>
              </button>
            ) : (
              !analysis && (
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={handleAnalyzeGame}
                  className="bz-btn bz-btn-primary"
                  title="Analyze this game with Stockfish"
                >
                  {analyzing ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Icon d={ICON_SEARCH} />
                  )}
                  <span className="hidden sm:inline">{analyzing ? "Analyzing..." : "Analyze"}</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => router.push("/bots")}
              className="bz-btn bz-btn-primary"
              title="Choose a new opponent"
            >
              <Icon d={ICON_PLUS} />
              <span className="hidden sm:inline">New Game</span>
            </button>
          </div>
        </footer>

        {/* Transient move errors float above the bottom bar */}
        {error && <div className="bz-error">{error}</div>}
      </div>
    )}

    {/* Confirmation Resign Modal (above both normal and zoom layouts) */}
    {showResignModal && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#111A2E] p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white">Resign Game?</h3>
            <p className="mt-2 text-sm text-slate-300">
              Are you sure you want to resign against {game.bot.name}? This will count as a loss.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResignModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resigning}
                onClick={handleResign}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {resigning ? "Resigning..." : "Yes, Resign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
