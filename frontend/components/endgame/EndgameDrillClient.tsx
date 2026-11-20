"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import InteractiveBoard from "@/components/arena/InteractiveBoard";
import SolutionViewer from "@/components/endgame/SolutionViewer";
import { ApiError } from "@/lib/bff";
import {
  fetchDrill, fetchActive, startDrill, submitMove, requestHint, revealSolution, resetAttempt,
  generateChallenge, sessionNext, sessionEnd, getSession,
  uciOptions, accentOf, DIFFICULTY_STYLE, DIFFICULTIES, PIECE_SYMBOLS, formatClock,
  type DrillDetail, type Attempt, type HintResult, type RevealResult, type Session,
} from "@/lib/endgame";
import "./endgame.css";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const I_BACK = "M19 12H5|M11 18l-6-6 6-6";
const I_RESET = "M3 3v5h5|M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8";
const I_HINT = "M9 18h6|M10 22h4|M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z";
const I_FLIP = "M3 12a9 9 0 0 1 15-6.7L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16|M3 21v-5h5";
const I_TARGET = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";
const I_CLOCK = "M12 7v5l3 2|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z";
const I_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const I_CHECK = "M20 6 9 17l-5-5";
const I_X = "M18 6 6 18|M6 6l12 12";
const I_ARROW = "M5 12h14|M13 6l6 6-6 6";
const I_PLAY = "M6 4l14 8-14 8z";
const I_FLAG = "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7";
const I_DICE = "M3 3h18v18H3z|M8 8h.01|M16 8h.01|M8 16h.01|M16 16h.01|M12 12h.01";
const I_FLAME = "M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5 0 2 1 3 2 3 0-3 1-5 1-7z";
const I_SESSION = "M8 2v4|M16 2v4|M3 10h18|M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";

function kingSquare(fen: string, color: "w" | "b"): string | null {
  try {
    const board = new Chess(fen).board();
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === "k" && p.color === color) return `${"abcdefgh"[f]}${8 - r}`;
    }
  } catch { /* ignore */ }
  return null;
}

function evalLabel(a: Attempt): string {
  if (a.is_checkmate) return "#";
  if (a.eval_mate != null) return a.eval_mate === 0 ? "#" : `M${Math.abs(a.eval_mate)}`;
  if (a.eval_cp != null) {
    const v = a.eval_cp / 100;
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  }
  return "—";
}

function evalShare(a: Attempt): number {
  if (a.is_checkmate) return a.turn === "black" ? 1 : 0; // player (white) mated -> full
  if (a.eval_mate != null) return a.eval_mate > 0 ? 0.97 : a.eval_mate < 0 ? 0.03 : 0.5;
  if (a.eval_cp != null) return 1 / (1 + Math.pow(10, -a.eval_cp / 400));
  return 0.5;
}

function Stars({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <div className={`flex justify-center gap-2 ${big ? "text-5xl" : "text-base"}`} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`${big ? "eg-star" : ""} ${i <= n ? "eg-star-lit" : "eg-star-dim"}`}
          style={big ? { animationDelay: `${0.15 + i * 0.18}s` } : undefined}>★</span>
      ))}
    </div>
  );
}

const PROMO_PIECES = [
  { suffix: "q", label: "Queen", glyph: "♕" },
  { suffix: "r", label: "Rook", glyph: "♖" },
  { suffix: "b", label: "Bishop", glyph: "♗" },
  { suffix: "n", label: "Knight", glyph: "♘" },
];

export default function EndgameDrillClient({ drillId }: { drillId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("session");
  const [drill, setDrill] = useState<DrillDetail | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [starting, setStarting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const [nextDiff, setNextDiff] = useState<string>("Intermediate");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [hints, setHints] = useState<HintResult[]>([]);
  const [hintSquares, setHintSquares] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealResult | null>(null);
  const [showSolutionReplay, setShowSolutionReplay] = useState(false);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string; options: string[] } | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [clock, setClock] = useState(0);
  const movesRef = useRef<HTMLDivElement>(null);

  /* ---- Load drill (+ session bundle) + resume any in-progress attempt ---- */
  useEffect(() => {
    let active = true;
    const load = sessionIdParam
      ? getSession(Number(sessionIdParam)).then((b) => [b.drill, b.attempt, b.session] as const)
      : Promise.all([fetchDrill(drillId), fetchActive(drillId).catch(() => null)]).then(([d, a]) => [d, a, null] as const);
    load
      .then(([d, a, s]) => {
        if (!active) return;
        setDrill(d);
        setOrientation(d.player_color);
        setNextDiff(d.difficulty);
        if (a) setAttempt(a);
        if (s) setSession(s);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) setUnauth(true);
        else setError(e instanceof ApiError ? e.message : "Failed to load drill.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [drillId, sessionIdParam]);

  /* ---- Live clock: async timer callbacks only (no synchronous setState) ---- */
  const attemptId = attempt?.id;
  const attemptStatus = attempt?.status;
  const attemptElapsed = attempt?.elapsed_seconds ?? 0;
  useEffect(() => {
    if (attemptId == null) {
      const t = window.setTimeout(() => setClock(0), 0);
      return () => window.clearTimeout(t);
    }
    if (attemptStatus !== "in_progress") {
      const t = window.setTimeout(() => setClock(attemptElapsed), 0);
      return () => window.clearTimeout(t);
    }
    const start = Date.now();
    const update = () => setClock(attemptElapsed + Math.floor((Date.now() - start) / 1000));
    const t0 = window.setTimeout(update, 0);
    const t = window.setInterval(update, 1000);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, [attemptId, attemptStatus, attemptElapsed]);

  /* ---- Auto-scroll move history ---- */
  useEffect(() => {
    if (movesRef.current) movesRef.current.scrollTop = movesRef.current.scrollHeight;
  }, [attempt?.moves.length]);

  const clearPositionExtras = useCallback(() => {
    setHints([]); setHintSquares([]); setReveal(null); setShowSolutionReplay(false); setMoveError(null); setPendingPromo(null);
  }, []);

  const doStart = useCallback(async () => {
    setStarting(true); setError(null);
    try {
      const a = await startDrill(drillId);
      setAttempt(a); clearPositionExtras();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start drill.");
    } finally { setStarting(false); }
  }, [drillId, clearPositionExtras]);

  const doMove = useCallback(async (uci: string) => {
    if (!attempt || attempt.status !== "in_progress" || moving) return;
    setMoving(true); setMoveError(null); setPendingPromo(null);
    try {
      const a = await submitMove(attempt.id, uci);
      setAttempt(a);
      if (a.session) setSession(a.session);
      setHints([]); setHintSquares([]);
      // Position changed: a previously revealed solution belongs to the OLD
      // board and must be cleared so it can never display stale/illegal moves.
      setReveal(null); setShowSolutionReplay(false);
      if (a.status === "completed") setShowComplete(true);
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Move failed.");
    } finally { setMoving(false); }
  }, [attempt, moving]);

  const handleBoardMove = useCallback((from: string, to: string) => {
    if (!attempt || attempt.status !== "in_progress" || moving) return;
    const options = uciOptions(from, to, attempt.fen);
    if (options.length === 0) { setMoveError("That move is not legal."); return; }
    if (options.length > 1) { setPendingPromo({ from, to, options }); return; }
    void doMove(options[0]);
  }, [attempt, moving, doMove]);

  const doHint = useCallback(async () => {
    if (!attempt || attempt.status !== "in_progress" || hintBusy) return;
    setHintBusy(true);
    try {
      const h = await requestHint(attempt.id);
      setHints((prev) => [...prev, h]);
      if (h.level >= 3 && h.from_square && h.to_square) setHintSquares([h.from_square, h.to_square]);
      setAttempt((a) => a ? { ...a, hints_used: h.hints_used, hint_level: h.level } : a);
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not load hint.");
    } finally { setHintBusy(false); }
  }, [attempt, hintBusy]);

  const doReveal = useCallback(async () => {
    if (!attempt) return;
    try {
      const r = await revealSolution(attempt.id);
      setReveal(r);
      setShowSolutionReplay(true);
      setAttempt((a) => a ? { ...a, solution_revealed: true } : a);
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not reveal solution.");
    }
  }, [attempt]);

  const doReset = useCallback(async () => {
    if (!attempt) return;
    setMoving(true);
    try {
      const a = await resetAttempt(attempt.id);
      setAttempt(a); clearPositionExtras(); setShowComplete(false);
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not reset.");
    } finally { setMoving(false); }
  }, [attempt, clearPositionExtras]);

  /* ---- Next Challenge: session-aware, never leaves the trainer ---- */
  const nextChallenge = useCallback(async () => {
    if (!drill || nextBusy) return;
    setNextBusy(true); setMoveError(null);
    try {
      if (session && session.status === "active") {
        const b = await sessionNext(session.id);
        router.replace(`/endgame/${b.drill.id}?session=${session.id}`);
      } else {
        const d = await generateChallenge(drill.category, nextDiff);
        await startDrill(d.id);
        router.replace(`/endgame/${d.id}`);
      }
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not generate the next challenge.");
      setNextBusy(false);
    }
  }, [drill, session, nextDiff, nextBusy, router]);

  const endSession = useCallback(async () => {
    if (!session) return;
    try { await sessionEnd(session.id); } catch { /* ignore */ }
    router.push("/endgame");
  }, [session, router]);

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") { setShowComplete(false); setPendingPromo(null); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "h") { e.preventDefault(); void doHint(); }
      else if (k === "r") { e.preventDefault(); void doReset(); }
      else if (k === "f") { e.preventDefault(); setOrientation((o) => o === "white" ? "black" : "white"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHint, doReset]);

  const accent = useMemo(() => accentOf(drill?.category === "knights" ? "sky"
    : drill?.category === "bishop-knight" ? "amber"
    : drill?.category === "pawn" ? "violet" : "emerald"), [drill?.category]);

  /* ------------------------------ Render gates ------------------------------ */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="font-semibold text-slate-300">Loading drill...</p>
        </div>
      </div>
    );
  }
  if (unauth) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="eg-pop rounded-3xl border border-slate-800 bg-[#111A2E] p-8 text-center">
          <h2 className="font-display text-xl font-bold text-white">Sign in to play</h2>
          <p className="mt-2 text-sm text-slate-300">Drills save your progress to your account.</p>
          <Link href="/login" className="mt-5 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Log in</Link>
        </div>
      </div>
    );
  }
  if (error && !drill) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-6 text-center text-rose-300">
          <p className="text-lg font-bold">Unable to load drill</p>
          <p className="mt-2 text-sm">{error}</p>
          <Link href="/endgame" className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Back to Endgame Drills</Link>
        </div>
      </div>
    );
  }
  if (!drill) return null;

  if (drill.locked && !attempt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="eg-pop rounded-3xl border border-slate-800 bg-[#111A2E] p-8 text-center">
          <span className="text-4xl text-slate-500"><Icon d={I_FLAG} size={40} /></span>
          <h2 className="mt-3 font-display text-xl font-bold text-white">Drill locked</h2>
          <p className="mt-2 text-sm text-slate-300">Complete the previous drill in this category to unlock “{drill.title}”.</p>
          <Link href="/endgame" className="mt-5 inline-block rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Back to Endgame Drills</Link>
        </div>
      </div>
    );
  }

  const a = attempt;
  const inProgress = a?.status === "in_progress";
  const playerTurn = a ? a.turn === a.player_color : false;
  const boardInteractive = !!a && inProgress && !moving && playerTurn;
  const enemyKing = a ? kingSquare(a.fen, a.player_color === "white" ? "b" : "w") : kingSquare(drill.fen, "b");
  const feedback = a?.feedback;
  const share = a ? evalShare(a) : 0.5;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="transition hover:text-slate-200">Dashboard</Link>
          <span>/</span>
          <Link href="/endgame" className="transition hover:text-slate-200">Endgame Drills</Link>
          <span>/</span>
          <span className="font-semibold text-slate-200">{drill.title}</span>
        </div>
        <Link href="/endgame" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700">
          <Icon d={I_BACK} size={13} /> All drills
        </Link>
      </div>

      {/* Session bar */}
      {session && (
        <div className="eg-fade-up mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-[#111A2E]/90 px-4 py-3 shadow-lg">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${accent.chip}`}>
            <Icon d={I_SESSION} size={12} /> Session
          </span>
          <span className="text-xs font-bold text-slate-200">
            {session.target_count === 0 ? `Endless · ${session.completed} done` : `${session.completed}/${session.target_count}`}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300"><Icon d={I_FLAME} size={13} /> {session.streak}</span>
          <span className="text-xs text-slate-400">best {session.best_streak}</span>
          <span className="text-xs font-bold text-emerald-300">{session.score} pts</span>
          <span className="font-mono text-xs text-slate-400">{formatClock(session.total_seconds)}</span>
          <span className="text-xs text-slate-400">{session.correct}✓ / {session.incorrect}✗</span>
          <div className="ml-auto flex items-center gap-2">
            {session.target_count > 0 && (
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                <div className={`h-full ${accent.bar} transition-all duration-500`} style={{ width: `${Math.min(100, (session.completed / session.target_count) * 100)}%` }} />
              </div>
            )}
            <button type="button" onClick={endSession}
              className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-900/40">
              End session
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ===================== LEFT PANEL ===================== */}
        <aside className="order-2 flex flex-col gap-4 lg:order-none lg:col-span-3">
          <div className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${accent.gradient} to-[#111A2E] p-4 shadow-lg`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${accent.chip}`}>
                {drill.category_title}{drill.generated ? "" : ` · ${drill.level}`}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${DIFFICULTY_STYLE[drill.difficulty] ?? ""}`}>
                {drill.difficulty}
              </span>
              {drill.generated && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300">
                  <Icon d={I_DICE} size={11} /> Random Challenge
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-xl font-extrabold text-white">{drill.title}</h1>
            <p className={`mt-1 text-sm ${accent.text}`}>{drill.tagline}</p>
          </div>

          {/* Objective */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Icon d={I_TARGET} size={14} /> Objective
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{drill.objective_label}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Moves</span>
              <span className="font-mono font-bold text-slate-200">{a?.player_moves ?? 0} / {drill.max_moves}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full ${accent.bar} transition-all duration-500`}
                style={{ width: `${Math.min(100, ((a?.player_moves ?? 0) / drill.max_moves) * 100)}%` }} />
            </div>
            {drill.objective.type === "king_zone" && enemyKing && (
              <p className="mt-2 text-xs text-slate-400">Enemy king: <span className="font-mono font-bold text-slate-200">{enemyKing}</span></p>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2">
            {!a ? (
              <button type="button" onClick={doStart} disabled={starting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-60">
                {starting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" /> : <Icon d={I_PLAY} size={15} />}
                {starting ? "Starting..." : "Start Drill"}
              </button>
            ) : (
              <>
                <button type="button" onClick={doHint} disabled={!inProgress || hintBusy || (a.hint_level >= drill.hint_max)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 py-2.5 text-sm font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50">
                  <Icon d={I_HINT} size={15} />
                  {hintBusy ? "Thinking..." : a.hint_level >= drill.hint_max ? `Hints maxed (${drill.hint_max}/${drill.hint_max})` : `Hint (${a.hint_level}/${drill.hint_max})`}
                  <span className="ml-1 rounded border border-violet-500/30 px-1 text-[10px]">H</span>
                </button>
                <button type="button" onClick={doReset} disabled={moving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50">
                  <Icon d={I_RESET} size={15} /> Reset <span className="ml-1 rounded border border-slate-600 px-1 text-[10px]">R</span>
                </button>
              </>
            )}
            {/* Generate / Next challenge — stays in the trainer */}
            <div className="mt-1 flex items-center gap-2">
              <select value={nextDiff} onChange={(e) => setNextDiff(e.target.value)} aria-label="Next challenge difficulty"
                className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-2 text-xs font-semibold text-slate-200 focus:border-slate-500 focus:outline-none">
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <button type="button" onClick={nextChallenge} disabled={nextBusy}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-950 transition active:scale-95 disabled:opacity-60 ${accent.bar} hover:brightness-110`}>
                {nextBusy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" /> : <Icon d={I_DICE} size={14} />}
                {nextBusy ? "Generating..." : "Next Challenge"}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">How to play</h2>
            <ol className="mt-2 space-y-2">
              {drill.instructions.map((ins, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                  <span className={`flex-none font-bold ${accent.text}`}>{i + 1}.</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ol>
            <h3 className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Tips</h3>
            <ul className="mt-1.5 space-y-1.5">
              {drill.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-400">
                  <span className={accent.text}>•</span><span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ===================== CENTER: BOARD ===================== */}
        <main className="order-1 lg:order-none lg:col-span-6">
          <div className="mx-auto w-full max-w-[620px]">
            {/* Opponent bar */}
            <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-800 bg-[#111A2E]/90 px-4 py-2.5 shadow-md">
              <div className="flex items-center gap-3">
                <span className="font-chesspieces grid h-9 w-9 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-2xl text-slate-300">♚</span>
                <div>
                  <p className="text-sm font-bold text-white">Defender</p>
                  <p className="text-xs text-slate-400">
                    {a?.engine_available === false || !drill.engine_available ? "Drill responses (engine offline)" : "Stockfish · best defence"}
                  </p>
                </div>
              </div>
              {moving && (
                <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-300">
                  <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" /> Thinking...
                </div>
              )}
            </div>

            {/* Board + eval bar */}
            <div className="flex gap-2">
              <div className="flex w-6 flex-none flex-col items-center">
                <span className="mb-1 font-mono text-[10px] font-bold text-slate-300">{a ? evalLabel(a) : "—"}</span>
                <div className="relative w-3 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
                  <div className="eg-eval-fill absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-100 to-slate-300"
                    style={{ height: `${share * 100}%` }} />
                </div>
              </div>
              <div className="relative min-w-0 flex-1">
                <InteractiveBoard
                  fen={a?.fen ?? drill.fen}
                  orientation={orientation}
                  playerColor={drill.player_color}
                  lastMove={a?.last_move ?? null}
                  interactive={boardInteractive}
                  isCheck={a?.is_check ?? false}
                  isCheckmate={a?.is_checkmate ?? false}
                  highlightSquares={hintSquares}
                  onMove={handleBoardMove}
                />
                {/* Promotion picker overlay */}
                {pendingPromo && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-sm">
                    <div className="eg-pop rounded-2xl border border-slate-700 bg-[#111A2E] p-4 text-center shadow-2xl">
                      <p className="text-sm font-bold text-white">Promote to</p>
                      <div className="mt-3 flex gap-2">
                        {PROMO_PIECES.filter((p) => pendingPromo.options.includes(`${pendingPromo.from}${pendingPromo.to}${p.suffix}`)).map((p) => (
                          <button key={p.suffix} type="button"
                            onClick={() => doMove(`${pendingPromo.from}${pendingPromo.to}${p.suffix}`)}
                            className="flex flex-col items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 transition hover:border-emerald-500 hover:bg-emerald-500/10">
                            <span className="font-chesspieces text-3xl text-white">{p.glyph}</span>
                            <span className="text-[10px] font-semibold text-slate-300">{p.label}</span>
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setPendingPromo(null)}
                        className="mt-3 text-xs font-semibold text-slate-400 hover:text-slate-200">Cancel</button>
                    </div>
                  </div>
                )}
                {/* Start overlay hint */}
                {!a && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center rounded-2xl bg-gradient-to-t from-slate-950/70 to-transparent p-4">
                    <span className="rounded-full border border-emerald-500/40 bg-slate-950/90 px-4 py-1.5 text-xs font-bold text-emerald-300">
                      Press “Start Drill” to begin
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Player bar */}
            <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-800 bg-[#111A2E]/90 px-4 py-2.5 shadow-md">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-sm font-bold text-sky-400">You</span>
                <div>
                  <p className="text-sm font-bold text-white">You <span className="capitalize text-slate-400">· {drill.player_color}</span></p>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <span className="font-chesspieces text-sm tracking-wider">
                      {a && a.captured_black.length > 0 ? a.captured_black.map((p) => PIECE_SYMBOLS[p] ?? p).join("") : ""}
                    </span>
                    {a && a.material_advantage > 0 && <span className="font-bold text-emerald-400">+{a.material_advantage}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {inProgress && playerTurn && !moving && (
                  <span className="hidden items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 sm:flex">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Your turn
                  </span>
                )}
                <span className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-sm font-extrabold text-slate-300">
                  <Icon d={I_CLOCK} size={13} /> {formatClock(clock)}
                </span>
                <button type="button" onClick={() => setOrientation((o) => o === "white" ? "black" : "white")}
                  title="Flip board (F)"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700">
                  <Icon d={I_FLIP} size={15} />
                </button>
              </div>
            </div>

            {/* Captured by defender */}
            {a && a.captured_white.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                Lost: <span className="font-chesspieces text-base tracking-wider text-slate-300">{a.captured_white.map((p) => PIECE_SYMBOLS[p] ?? p).join("")}</span>
              </p>
            )}

            {/* Feedback */}
            <div aria-live="polite" className="mt-3 min-h-[2.5rem]">
              {moveError ? (
                <p className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-2.5 text-center text-xs font-semibold text-rose-300">{moveError}</p>
              ) : feedback ? (
                <p className={`rounded-xl border p-2.5 text-center text-xs font-semibold ${
                  feedback.tone === "good" ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                  : feedback.tone === "warn" ? "border-amber-500/30 bg-amber-950/30 text-amber-300"
                  : feedback.tone === "bad" ? "border-rose-500/30 bg-rose-950/30 text-rose-300"
                  : "border-slate-800 bg-slate-900/60 text-slate-300"
                }`}>{feedback.message}</p>
              ) : (
                <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-2.5 text-center text-xs text-slate-500">
                  {a ? "Select a piece, then its target square. Drag & drop also works." : "Read the objective, then start the drill."}
                </p>
              )}
            </div>
          </div>
        </main>

        {/* ===================== RIGHT PANEL ===================== */}
        <aside className="order-3 flex flex-col gap-4 lg:order-none lg:col-span-3">
          {/* Status */}
          <div className={`rounded-2xl border p-4 shadow-lg ${
            a?.status === "completed" ? "border-emerald-500/40 bg-emerald-950/30"
            : a?.status === "failed" ? "border-rose-500/40 bg-rose-950/30"
            : "border-slate-800 bg-[#111A2E]/90"
          }`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</h2>
            <p className={`mt-1.5 flex items-center gap-2 text-sm font-bold ${
              a?.status === "completed" ? "text-emerald-300" : a?.status === "failed" ? "text-rose-300" : "text-slate-200"
            }`}>
              {a?.status === "completed" ? <><Icon d={I_CHECK} size={15} /> Objective achieved</>
                : a?.status === "failed" ? <><Icon d={I_X} size={15} /> {a.fail_reason?.replace(/_/g, " ")}</>
                : a ? "In progress" : "Not started"}
            </p>
            {a && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-950/60 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Hints</p>
                  <p className="text-sm font-bold text-violet-300">{a.hints_used}</p>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Errors</p>
                  <p className="text-sm font-bold text-amber-300">{a.mistakes}</p>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Eval</p>
                  <p className="font-mono text-sm font-bold text-slate-200">{evalLabel(a)}</p>
                </div>
              </div>
            )}
            {a?.status === "completed" && (
              <button type="button" onClick={() => setShowComplete(true)}
                className="mt-3 w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                View result
              </button>
            )}
          </div>

          {/* Failure card */}
          {a?.status === "failed" && (
            <div className="eg-pop rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4">
              <h3 className="text-sm font-bold text-rose-300">Not this time</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{feedback?.message}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={doReset}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500">Retry</button>
                <button type="button" onClick={doReveal}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">Reveal solution</button>
              </div>
            </div>
          )}

          {/* Move history */}
          <div className="flex min-h-[180px] flex-1 flex-col rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Move history</h2>
              <span className="text-xs text-slate-500">{a ? Math.ceil(a.moves.length / 2) : 0} moves</span>
            </div>
            <div ref={movesRef} className="eg-scroll mt-2 max-h-[240px] flex-1 overflow-y-auto pr-1 font-mono text-xs">
              {!a || a.moves.length === 0 ? (
                <p className="py-6 text-center text-slate-500">No moves yet.</p>
              ) : (
                <div className="grid grid-cols-12 gap-1 py-0.5">
                  {Array.from({ length: Math.ceil(a.moves.length / 2) }).map((_, idx) => {
                    const w = a.moves[idx * 2];
                    const b = a.moves[idx * 2 + 1];
                    const lastPly = a.moves.length;
                    return (
                      <div key={idx} className="contents">
                        <div className="col-span-2 py-1 font-semibold text-slate-500">{idx + 1}.</div>
                        <div className={`col-span-5 rounded px-2 py-1 ${w && w.ply === lastPly ? "bg-amber-400/20 font-bold text-amber-300" : "text-slate-200"}`}>{w?.san ?? ""}</div>
                        <div className={`col-span-5 rounded px-2 py-1 ${b && b.ply === lastPly ? "bg-amber-400/20 font-bold text-amber-300" : "text-slate-400"}`}>{b?.san ?? ""}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Hints */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/90 p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Icon d={I_HINT} size={14} /> Hints
              </h2>
              {a && inProgress && (
                <button type="button" onClick={doReveal}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 transition hover:text-violet-300">
                  <Icon d={I_EYE} size={12} /> Reveal solution
                </button>
              )}
            </div>
            {hints.length === 0 && !reveal ? (
              <p className="mt-2 text-xs text-slate-500">
                Stuck? Request a hint — strategic clue first, then the key piece, then the best move.
              </p>
            ) : (
              <div className="eg-scroll mt-2 max-h-[200px] space-y-2 overflow-y-auto pr-1">
                {hints.map((h, i) => (
                  <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Hint {h.level}{h.best_san ? ` · ${h.best_san}` : ""}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{h.text}</p>
                  </div>
                ))}
                {reveal && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Verified solution</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {reveal.error
                        ? reveal.error
                        : `${reveal.solution.length} validated moves from your current position (${reveal.source === "model" ? "model technique" : "Stockfish"}).`}
                    </p>
                    {!reveal.error && (
                      <button type="button" onClick={() => setShowSolutionReplay(true)}
                        className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/20">
                        Replay on board
                      </button>
                    )}
                    <p className="mt-1.5 text-[10px] italic text-slate-500">{reveal.note}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Theory */}
          <div className="rounded-2xl border border-slate-800 bg-[#111A2E]/60 p-4">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Theory</h2>
            <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-400">{drill.theory}</p>
          </div>
        </aside>
      </div>

      {/* ===================== SOLUTION REPLAY MODAL ===================== */}
      {showSolutionReplay && reveal && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="eg-pop eg-scroll max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-slate-700 bg-[#0D1424] p-4 shadow-2xl">
            <SolutionViewer
              startFen={reveal.start_fen ?? a?.fen ?? drill.fen}
              moves={reveal.solution}
              objectiveLabel={drill.objective_label}
              objectiveAchieved={reveal.objective_achieved}
              playerColor={drill.player_color}
              source={reveal.source}
              note={reveal.note}
              error={reveal.error}
              onClose={() => setShowSolutionReplay(false)}
            />
          </div>
        </div>
      )}

      {/* ===================== COMPLETION MODAL ===================== */}
      {showComplete && a?.status === "completed" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="eg-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#111A2E] p-7 text-center shadow-2xl">
            <div className="eg-glow pointer-events-none absolute -top-20 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <span className="text-5xl">🏆</span>
              <h2 className="mt-2 font-display text-2xl font-extrabold text-white">Drill Completed!</h2>
              <p className="mt-1 text-sm text-emerald-300">{drill.objective_label}</p>
              <div className="mt-4"><Stars n={a.stars ?? 1} big /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Moves</p>
                  <p className="text-lg font-extrabold text-white">{a.player_moves}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Time</p>
                  <p className="text-lg font-extrabold text-white">{formatClock(a.elapsed_seconds)}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Accuracy</p>
                  <p className="text-lg font-extrabold text-emerald-400">{a.accuracy != null ? `${a.accuracy}%` : "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase text-slate-500">Hints</p>
                  <p className="text-lg font-extrabold text-violet-300">{a.hints_used}</p>
                </div>
              </div>
              {session && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  Session: {session.completed}/{session.target_count === 0 ? "∞" : session.target_count} · streak {session.streak} · {session.score} pts
                  {session.status === "completed" && <span className="ml-1 font-bold text-emerald-300">Session complete!</span>}
                </div>
              )}
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" onClick={nextChallenge} disabled={nextBusy || session?.status === "completed"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-60">
                  {nextBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" /> : <Icon d={I_DICE} size={15} />}
                  Next Challenge <Icon d={I_ARROW} size={15} />
                </button>
                {a.next_drill_id && !session && (
                  <button type="button" onClick={() => router.push(`/endgame/${a.next_drill_id}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700">
                    Next curated drill <Icon d={I_ARROW} size={14} />
                  </button>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={doReset}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700">Retry</button>
                  <Link href="/endgame"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-slate-700">All drills</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}