"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import InteractiveBoard from "@/components/arena/InteractiveBoard";
import SolutionViewer from "@/components/endgame/SolutionViewer";
import { ApiError } from "@/lib/bff";
import {
  fetchTaxonomy, generateChallenge, startDrill, submitMove, requestHint, revealSolution, resetAttempt,
  uciOptions, accentOf, DIFFICULTY_STYLE, DIFFICULTIES, PIECE_SYMBOLS, formatClock,
  type Taxonomy, type TaxonomyCategory, type Subcategory, type DrillDetail, type Attempt,
  type HintResult, type RevealResult,
} from "@/lib/endgame";
import "./endgame.css";
import "./trainer.css";

/* ------------------------------- icons ------------------------------- */

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const I_BACK = "M19 12H5|M11 18l-6-6 6-6";
const I_CHEVRON = "M6 9l6 6 6-6";
const I_RESET = "M3 3v5h5|M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8";
const I_HINT = "M9 18h6|M10 22h4|M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z";
const I_FLIP = "M3 12a9 9 0 0 1 15-6.7L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16|M3 21v-5h5";
const I_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const I_CHECK = "M20 6 9 17l-5-5";
const I_X = "M18 6 6 18|M6 6l12 12";
const I_ARROW = "M5 12h14|M13 6l6 6-6 6";
const I_DICE = "M3 3h18v18H3z|M8 8h.01|M16 8h.01|M8 16h.01|M16 16h.01|M12 12h.01";
const I_CLOCK = "M12 7v5l3 2|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z";
const I_SOUND = "M11 5 6 9H2v6h4l5 4z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a9 9 0 0 1 0 14";
const I_MUTE = "M11 5 6 9H2v6h4l5 4z|M23 9l-6 6|M17 9l6 6";
const I_TARGET = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";
const I_SHIELD = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";
const I_SWORDS = "M14.5 17.5 3 6V3h3l11.5 11.5|M13 19l6-6|M16 16l4 4|M19 21l2-2";

const KIND_META: Record<string, { label: string; icon: string; cls: string }> = {
  mate: { label: "Mate", icon: I_SWORDS, cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  win: { label: "Win", icon: I_ARROW, cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  defend: { label: "Draw", icon: I_SHIELD, cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  technique: { label: "Skill", icon: I_TARGET, cls: "text-violet-300 border-violet-500/30 bg-violet-500/10" },
};

const PROMO_PIECES = [
  { suffix: "q", label: "Queen", glyph: "♕" },
  { suffix: "r", label: "Rook", glyph: "♖" },
  { suffix: "b", label: "Bishop", glyph: "♗" },
  { suffix: "n", label: "Knight", glyph: "♘" },
];

/* Decorative position shown before the first challenge (the Lucena). */
const IDLE_FEN = "3K4/3P1k2/8/8/8/8/r7/2R5 w - - 0 1";

/* ------------------------------- sounds ------------------------------- */

type SoundKind = "move" | "capture" | "check" | "win" | "fail";

function useChessSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback((kind: SoundKind) => {
    if (!enabled) return;
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = ctxRef.current ?? (ctxRef.current = new Ctor());
      if (ctx.state === "suspended") void ctx.resume();
      const t = ctx.currentTime;
      const tone = (freq: number, start: number, dur: number, type: OscillatorType, gain = 0.12) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(gain, t + start);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.02);
      };
      if (kind === "move") tone(220, 0, 0.07, "triangle", 0.18);
      else if (kind === "capture") { tone(140, 0, 0.1, "square", 0.13); tone(90, 0.02, 0.12, "triangle", 0.16); }
      else if (kind === "check") { tone(660, 0, 0.09, "sine", 0.12); tone(880, 0.07, 0.1, "sine", 0.1); }
      else if (kind === "win") { tone(523, 0, 0.12, "sine"); tone(659, 0.1, 0.12, "sine"); tone(784, 0.2, 0.22, "sine"); }
      else { tone(330, 0, 0.14, "sine"); tone(220, 0.12, 0.24, "sine"); }
    } catch { /* audio unavailable — stay silent */ }
  }, [enabled]);
}

function Stars({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <div className={`flex justify-center gap-1.5 ${big ? "text-4xl" : "text-sm"}`} aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`${big ? "eg-star" : ""} ${i <= n ? "eg-star-lit" : "eg-star-dim"}`}
          style={big ? { animationDelay: `${0.15 + i * 0.18}s` } : undefined}>★</span>
      ))}
    </div>
  );
}

/* =============================== COMPONENT =============================== */

export default function EndgameTrainerClient() {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);

  const [expanded, setExpanded] = useState<string | null>("checkmates");
  const [mode, setMode] = useState<"browse" | "train">("browse");
  const [activeCat, setActiveCat] = useState<TaxonomyCategory | null>(null);
  const [activeSub, setActiveSub] = useState<Subcategory | null>(null);
  const [difficulty, setDifficulty] = useState<string>("Intermediate");

  const [drill, setDrill] = useState<DrillDetail | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [hints, setHints] = useState<HintResult[]>([]);
  const [hintSquares, setHintSquares] = useState<string[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealResult | null>(null);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [soundOn, setSoundOn] = useState(true);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string; options: string[] } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [clock, setClock] = useState(0);
  const movesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const play = useChessSounds(soundOn);

  /* ---- sound preference ---- */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSoundOn(window.localStorage.getItem("eg-trainer-sound") !== "off");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const toggleSound = useCallback(() => {
    setSoundOn((s) => {
      window.localStorage.setItem("eg-trainer-sound", s ? "off" : "on");
      return !s;
    });
  }, []);

  /* ---- taxonomy load ---- */
  useEffect(() => {
    let active = true;
    fetchTaxonomy()
      .then((t) => { if (active) { setTaxonomy(t); setLoading(false); } })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) setUnauth(true);
        else setError(e instanceof ApiError ? e.message : "Failed to load Endgames.");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const refreshProgress = useCallback(() => {
    fetchTaxonomy().then(setTaxonomy).catch(() => { /* keep stale progress */ });
  }, []);

  /* ---- live clock (async timer callbacks only) ---- */
  const attemptId = attempt?.id;
  const attemptStatus = attempt?.status;
  const attemptElapsed = attempt?.elapsed_seconds ?? 0;
  useEffect(() => {
    if (attemptId == null || attemptStatus !== "in_progress") {
      const t = window.setTimeout(() => setClock(attemptId == null ? 0 : attemptElapsed), 0);
      return () => window.clearTimeout(t);
    }
    const start = Date.now();
    const update = () => setClock(attemptElapsed + Math.floor((Date.now() - start) / 1000));
    const t0 = window.setTimeout(update, 0);
    const t = window.setInterval(update, 1000);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, [attemptId, attemptStatus, attemptElapsed]);

  useEffect(() => {
    if (movesRef.current) movesRef.current.scrollTop = movesRef.current.scrollHeight;
  }, [attempt?.moves.length]);

  /* Keep the panel scrolled to the top so the sticky header never covers the
     back button / first controls when switching views or challenges. */
  const drillId = drill?.id;
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [mode, drillId]);

  const clearExtras = useCallback(() => {
    setHints([]); setHintSquares([]); setReveal(null); setMoveError(null);
    setPendingPromo(null); setShowResult(false);
  }, []);

  /* ---- load a fresh challenge for a subcategory (stays on this page) ---- */
  const loadChallenge = useCallback(async (cat: TaxonomyCategory, sub: Subcategory) => {
    setBusy(true); setMoveError(null);
    try {
      const d = await generateChallenge(cat.id, difficulty, sub.id);
      const a = await startDrill(d.id);
      setActiveCat(cat); setActiveSub(sub);
      setDrill(d); setAttempt(a);
      setOrientation(d.player_color);
      setMode("train");
      clearExtras();
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not generate a challenge.");
    } finally { setBusy(false); }
  }, [difficulty, clearExtras]);

  const newChallenge = useCallback(() => {
    if (activeCat && activeSub && !busy) void loadChallenge(activeCat, activeSub);
  }, [activeCat, activeSub, busy, loadChallenge]);

  const doMove = useCallback(async (uci: string) => {
    if (!attempt || attempt.status !== "in_progress" || moving) return;
    setMoving(true); setMoveError(null); setPendingPromo(null);
    const prevCaptured = attempt.captured_black.length + attempt.captured_white.length;
    try {
      const a = await submitMove(attempt.id, uci);
      setAttempt(a);
      setHints([]); setHintSquares([]);
      // The position changed — any previously revealed solution is now stale
      // and must never stay on screen (it would show moves for the old board).
      setReveal(null);
      const captured = a.captured_black.length + a.captured_white.length > prevCaptured;
      if (a.status === "completed") { play("win"); setShowResult(true); refreshProgress(); }
      else if (a.status === "failed") { play("fail"); setShowResult(true); }
      else if (a.is_check) play("check");
      else if (captured) play("capture");
      else play("move");
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Move failed.");
    } finally { setMoving(false); }
  }, [attempt, moving, play, refreshProgress]);

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
      setAttempt((a) => a ? { ...a, solution_revealed: true } : a);
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not reveal solution.");
    }
  }, [attempt]);

  const doReset = useCallback(async () => {
    if (!attempt || moving) return;
    setMoving(true);
    try {
      const a = await resetAttempt(attempt.id);
      setAttempt(a); clearExtras();
    } catch (e) {
      setMoveError(e instanceof ApiError ? e.message : "Could not reset.");
    } finally { setMoving(false); }
  }, [attempt, moving, clearExtras]);

  const backToBrowse = useCallback(() => {
    setMode("browse");
    if (activeCat) setExpanded(activeCat.id);
  }, [activeCat]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") { setShowResult(false); setPendingPromo(null); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "h") { e.preventDefault(); void doHint(); }
      else if (k === "r") { e.preventDefault(); void doReset(); }
      else if (k === "f") { e.preventDefault(); setOrientation((o) => o === "white" ? "black" : "white"); }
      else if (k === "n") { e.preventDefault(); newChallenge(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHint, doReset, newChallenge]);

  const accent = useMemo(() => accentOf(activeCat?.accent ?? "emerald"), [activeCat?.accent]);

  /* ------------------------------ render gates ------------------------------ */
  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-4 lg:h-screen lg:flex-row">
        <div className="flex flex-1 items-center justify-center">
          <div className="eg-board-wrap aspect-square animate-pulse rounded-2xl border border-slate-800 bg-[#111A2E]/70" />
        </div>
        <div className="w-full shrink-0 space-y-3 lg:w-[400px]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-800 bg-[#111A2E]/70" />
          ))}
        </div>
      </div>
    );
  }
  if (unauth) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="eg-pop rounded-3xl border border-slate-800 bg-[#111A2E] p-8 text-center shadow-2xl">
          <span className="font-chesspieces text-5xl text-emerald-400">♚</span>
          <h2 className="mt-3 font-display text-xl font-bold text-white">Sign in to train</h2>
          <p className="mt-2 text-sm text-slate-300">
            Endgame training saves your progress, stars and streaks to your account.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/login" className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">Log in</Link>
            <Link href="/signup" className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">Create account</Link>
          </div>
        </div>
      </div>
    );
  }
  if (error || !taxonomy) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-6 text-center text-rose-300">
          <p className="text-lg font-bold">Unable to load Endgames</p>
          <p className="mt-2 text-sm">{error}</p>
          <button type="button" onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Retry</button>
        </div>
      </div>
    );
  }

  const a = attempt;
  const inProgress = a?.status === "in_progress";
  const playerTurn = a ? a.turn === a.player_color : false;
  const boardInteractive = !!a && inProgress && !moving && !busy && playerTurn;
  const boardFen = a?.fen ?? drill?.fen ?? IDLE_FEN;
  const feedback = a?.feedback;
  const solutionOpen = !!reveal && (reveal.solution.length > 0 || !!reveal.error);
  const totalSolved = taxonomy.categories.reduce((n, c) => n + c.completed, 0);
  const kindMeta = activeSub ? KIND_META[activeSub.kind] ?? KIND_META.win : KIND_META.win;

  const statusChip = busy ? { text: "Generating…", cls: "border-violet-500/30 bg-violet-500/10 text-violet-300" }
    : mode === "browse" ? { text: "Pick a topic to train", cls: "border-slate-700 bg-slate-800/60 text-slate-400" }
    : moving ? { text: "Defender thinking…", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" }
    : a?.status === "completed" ? { text: "Objective achieved!", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
    : a?.status === "failed" ? { text: a.fail_reason?.replace(/_/g, " ") ?? "Failed", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" }
    : a?.is_check ? { text: "Check!", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" }
    : inProgress && playerTurn ? { text: "Your turn", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
    : { text: "In progress", cls: "border-slate-700 bg-slate-800/60 text-slate-300" };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* ============================ LEFT: BOARD ============================ */}
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 px-3 py-4 sm:px-6 lg:overflow-y-auto">
        {/* Top strip */}
        <div className="eg-board-wrap flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
            <Link href="/dashboard" className="hidden transition hover:text-slate-200 sm:inline">Dashboard</Link>
            <span className="hidden sm:inline">/</span>
            <button type="button" onClick={backToBrowse} className="font-semibold text-slate-200 transition hover:text-white">Endgames</button>
            {mode === "train" && activeCat && activeSub && (
              <>
                <span>/</span>
                <span className="truncate">{activeCat.title}</span>
                <span>/</span>
                <span className={`truncate font-semibold ${accent.text}`}>{activeSub.title}</span>
              </>
            )}
          </div>
          <span className={`inline-flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusChip.cls}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {statusChip.text}
          </span>
        </div>

        {/* Board — or the verified solution replay when Show Solution is active */}
        {solutionOpen && reveal ? (
          <div className="eg-board-wrap">
            <SolutionViewer
              startFen={reveal.start_fen ?? boardFen}
              moves={reveal.solution}
              objectiveLabel={drill?.objective_label ?? ""}
              objectiveAchieved={reveal.objective_achieved}
              playerColor={drill?.player_color ?? "white"}
              source={reveal.source}
              note={reveal.note}
              error={reveal.error}
              onClose={() => setReveal(null)}
            />
          </div>
        ) : (
        <div className="eg-board-wrap relative" style={{ ["--board-piece-size" as string]: "clamp(28px, 6.4vmin, 62px)" }}>
          <InteractiveBoard
            fen={boardFen}
            orientation={orientation}
            playerColor={drill?.player_color ?? "white"}
            lastMove={a?.last_move ?? null}
            interactive={boardInteractive}
            isCheck={a?.is_check ?? false}
            isCheckmate={a?.is_checkmate ?? false}
            highlightSquares={hintSquares}
            onMove={handleBoardMove}
          />

          {/* Generating overlay */}
          {busy && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-slate-950/70 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <span className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-xs font-bold text-slate-200">Generating a verified challenge…</p>
              </div>
            </div>
          )}

          {/* Idle hint */}
          {mode === "browse" && !a && !busy && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center rounded-b-2xl bg-gradient-to-t from-slate-950/80 to-transparent p-4">
              <span className="rounded-full border border-emerald-500/40 bg-slate-950/90 px-4 py-1.5 text-xs font-bold text-emerald-300">
                Select a topic on the right to start training
              </span>
            </div>
          )}

          {/* Promotion picker */}
          {pendingPromo && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-slate-950/80 backdrop-blur-sm">
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

          {/* Result modal */}
          {showResult && a && a.status !== "in_progress" && (
            <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-slate-950/75 p-4 backdrop-blur-sm">
              <div className={`eg-pop w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl ${
                a.status === "completed" ? "border-emerald-500/40 bg-[#0D1A14]" : "border-rose-500/40 bg-[#1A0D12]"
              }`}>
                {a.status === "completed" ? (
                  <>
                    <p className="text-4xl">🏆</p>
                    <h3 className="mt-2 font-display text-xl font-extrabold text-white">
                      {a.objective.type === "defend" ? "Draw Secured!" : "Challenge Complete!"}
                    </h3>
                    <div className="mt-3"><Stars n={a.stars ?? 1} big /></div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-950/60 p-2">
                        <p className="text-[9px] uppercase text-slate-500">Moves</p>
                        <p className="text-sm font-extrabold text-white">{a.player_moves}</p>
                      </div>
                      <div className="rounded-lg bg-slate-950/60 p-2">
                        <p className="text-[9px] uppercase text-slate-500">Time</p>
                        <p className="text-sm font-extrabold text-white">{formatClock(a.elapsed_seconds)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-950/60 p-2">
                        <p className="text-[9px] uppercase text-slate-500">Accuracy</p>
                        <p className="text-sm font-extrabold text-emerald-400">{a.accuracy != null ? `${a.accuracy}%` : "—"}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="inline-grid h-12 w-12 place-items-center rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300">
                      <Icon d={I_X} size={22} />
                    </span>
                    <h3 className="mt-2 font-display text-xl font-extrabold text-white">Not this time</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">{feedback?.message}</p>
                  </>
                )}
                <div className="mt-5 flex flex-col gap-2">
                  <button type="button" onClick={newChallenge} disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-60">
                    <Icon d={I_DICE} size={15} /> Next Position <Icon d={I_ARROW} size={14} />
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={doReset}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
                      {a.status === "completed" ? "Replay" : "Retry"}
                    </button>
                    {a.status === "failed" && (
                      <button type="button" onClick={() => { setShowResult(false); void doReveal(); }}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
                        Show Solution
                      </button>
                    )}
                    <button type="button" onClick={() => setShowResult(false)}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
                      View board
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Board control bar */}
        {!solutionOpen && (
        <div className="eg-board-wrap flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#111A2E]/90 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setOrientation((o) => o === "white" ? "black" : "white")} title="Flip board (F)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700">
              <Icon d={I_FLIP} size={13} /> Flip
            </button>
            <button type="button" onClick={doReset} disabled={!a || moving} title="Reset position (R)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40">
              <Icon d={I_RESET} size={13} /> Reset
            </button>
            <button type="button" onClick={toggleSound} title={soundOn ? "Mute sounds" : "Enable sounds"}
              aria-pressed={soundOn}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                soundOn ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}>
              <Icon d={soundOn ? I_SOUND : I_MUTE} size={13} /> {soundOn ? "Sound" : "Muted"}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {a && (
              <span className="hidden items-center gap-1 sm:inline-flex">
                <span className="font-chesspieces tracking-wider text-slate-300">
                  {a.captured_black.map((p) => PIECE_SYMBOLS[p] ?? p).join("")}
                </span>
                {a.material_advantage > 0 && <span className="font-bold text-emerald-400">+{a.material_advantage}</span>}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-300">
              <Icon d={I_CLOCK} size={13} /> {formatClock(clock)}
            </span>
          </div>
        </div>
        )}

        {/* Feedback line */}
        <div aria-live="polite" className="eg-board-wrap min-h-[2.25rem]">
          {moveError ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-center text-xs font-semibold text-rose-300">{moveError}</p>
          ) : feedback && mode === "train" ? (
            <p className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${
              feedback.tone === "good" ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
              : feedback.tone === "warn" ? "border-amber-500/30 bg-amber-950/30 text-amber-300"
              : feedback.tone === "bad" ? "border-rose-500/30 bg-rose-950/30 text-rose-300"
              : "border-slate-800 bg-slate-900/60 text-slate-300"
            }`}>{feedback.message}</p>
          ) : (
            <p className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-center text-xs text-slate-500">
              {mode === "train"
                ? "Click or drag a piece to move. Legal squares are highlighted."
                : "Every position is generated fresh, validated and Stockfish-verified."}
            </p>
          )}
        </div>
      </main>

      {/* ============================ RIGHT: PANEL ============================ */}
      <aside ref={panelRef} className="eg-panel w-full shrink-0 border-t border-slate-800 bg-[#0D1424] lg:w-[400px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        {/* Panel header */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-[#0D1424]/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Endgames</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              taxonomy.engine_available ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {taxonomy.engine_available ? "Stockfish verified" : "Engine offline"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {totalSolved > 0 ? `${totalSolved} challenges solved · ` : ""}randomized positions, endless practice
          </p>
        </div>

        {mode === "browse" ? (
          /* ------------------------- BROWSE: categories ------------------------- */
          <nav className="px-3 py-3" aria-label="Endgame categories">
            {taxonomy.categories.map((cat) => {
              const open = expanded === cat.id;
              const ca = accentOf(cat.accent);
              return (
                <div key={cat.id} className="border-b border-slate-800/60 last:border-b-0">
                  <button type="button" onClick={() => setExpanded(open ? null : cat.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-800/50">
                    <span className={`font-chesspieces grid h-10 w-10 flex-none place-items-center rounded-xl border text-2xl ${ca.chip}`}>
                      {cat.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-100">{cat.title}</span>
                      <span className="block text-[11px] text-slate-500">
                        {cat.subcategories.length} topics{cat.completed > 0 ? ` · ${cat.completed} solved` : ""}
                      </span>
                    </span>
                    <span className={`flex-none text-slate-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
                      <Icon d={I_CHEVRON} size={16} />
                    </span>
                  </button>
                  <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <div className="overflow-hidden" inert={!open} aria-hidden={!open}>
                      <div className="space-y-1 pb-3 pl-4 pr-1">
                        <p className={`px-2 pb-1 text-[11px] italic leading-snug text-slate-500`}>{cat.tagline}</p>
                        {cat.subcategories.map((sub) => {
                          const km = KIND_META[sub.kind] ?? KIND_META.win;
                          const isActive = activeSub?.id === sub.id;
                          return (
                            <button key={sub.id} type="button" disabled={busy}
                              onClick={() => void loadChallenge(cat, sub)}
                              className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-50 ${
                                isActive
                                  ? `${ca.border} ${ca.bg}`
                                  : "border-transparent hover:border-slate-700 hover:bg-slate-800/60"
                              }`}>
                              <span className={`grid h-7 w-7 flex-none place-items-center rounded-md border ${km.cls}`}>
                                <Icon d={km.icon} size={13} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-slate-200 group-hover:text-white">{sub.title}</span>
                                <span className="block truncate text-[10px] text-slate-500">{sub.blurb}</span>
                              </span>
                              {sub.progress.completed > 0 && (
                                <span className="inline-flex flex-none items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                  <Icon d={I_CHECK} size={10} /> {sub.progress.completed}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="px-2 pt-4 text-[11px] leading-relaxed text-slate-600">
              Positions are constructed from real endgame theory, validated with python-chess and
              verified by Stockfish before you see them. Recently played positions are remembered
              so you always get a fresh challenge.
            </p>
          </nav>
        ) : (
          /* ------------------------- TRAIN: exercise panel ------------------------- */
          <div className="flex flex-col gap-4 px-5 py-4">
            <button type="button" onClick={backToBrowse}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
              <Icon d={I_BACK} size={13} /> All endgames
            </button>

            {drill && (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${kindMeta.cls}`}>
                      <Icon d={kindMeta.icon} size={10} /> {kindMeta.label}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${DIFFICULTY_STYLE[drill.difficulty] ?? ""}`}>
                      {drill.difficulty}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-300">
                      <Icon d={I_DICE} size={10} /> Random
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-lg font-extrabold leading-tight text-white">{drill.title}</h2>
                  <p className={`mt-0.5 text-xs ${accent.text}`}>{drill.tagline}</p>
                </div>

                {/* Objective + move counter */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <Icon d={I_TARGET} size={12} /> Objective
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-100">{drill.objective_label}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Move counter</span>
                    <span className="font-mono font-bold text-slate-200">{a?.player_moves ?? 0} / {drill.max_moves}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${accent.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(100, ((a?.player_moves ?? 0) / drill.max_moves) * 100)}%` }} />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={newChallenge} disabled={busy}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-slate-950 transition active:scale-95 disabled:opacity-60 ${accent.bar} hover:brightness-110`}>
                    {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" /> : <Icon d={I_DICE} size={15} />}
                    {busy ? "Generating…" : "New Challenge"}
                    <span className="ml-1 rounded border border-slate-950/30 px-1 text-[10px]">N</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={doHint} disabled={!inProgress || hintBusy || (a ? a.hint_level >= drill.hint_max : false)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 py-2 text-xs font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50">
                      <Icon d={I_HINT} size={13} />
                      {hintBusy ? "Thinking…" : a && a.hint_level >= drill.hint_max ? "Hints maxed" : `Show Hint (${a?.hint_level ?? 0}/${drill.hint_max})`}
                    </button>
                    <button type="button" onClick={doReveal} disabled={!a}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50">
                      <Icon d={I_EYE} size={13} /> Show Solution
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={doReset} disabled={!a || moving}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50">
                      <Icon d={I_RESET} size={13} /> Reset Position
                    </button>
                    <button type="button" onClick={newChallenge} disabled={busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50">
                      Next Position <Icon d={I_ARROW} size={13} />
                    </button>
                  </div>
                  <label className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
                    Difficulty of next challenge
                    <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1.5 text-xs font-semibold text-slate-200 focus:border-slate-500 focus:outline-none">
                      {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                </div>

                {/* Instructions */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Instructions</p>
                  <ol className="mt-1.5 space-y-1.5">
                    {drill.instructions.map((ins, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                        <span className={`flex-none font-bold ${accent.text}`}>{i + 1}.</span>
                        <span>{ins}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Hints + solution */}
                {(hints.length > 0 || reveal) && (
                  <div className="space-y-2">
                    {hints.map((h, i) => (
                      <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                          Hint {h.level}{h.best_san ? ` · ${h.best_san}` : ""}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">{h.text}</p>
                      </div>
                    ))}
                    {reveal && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Solution</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">
                          {reveal.error
                            ? reveal.error
                            : `A verified ${reveal.source === "model" ? "technique" : "engine"} line from your current position is open on the board. Use Previous / Next / Autoplay to replay it — your game is unchanged.`}
                        </p>
                        <button type="button" onClick={() => setReveal(null)}
                          className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-slate-700">
                          Close Solution
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Move history */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Moves</p>
                    <span className="text-[10px] text-slate-500">{a ? Math.ceil(a.moves.length / 2) : 0}</span>
                  </div>
                  <div ref={movesRef} className="eg-scroll mt-1.5 max-h-[120px] overflow-y-auto pr-1 font-mono text-xs">
                    {!a || a.moves.length === 0 ? (
                      <p className="py-2 text-center text-slate-600">No moves yet.</p>
                    ) : (
                      <div className="grid grid-cols-12 gap-1">
                        {Array.from({ length: Math.ceil(a.moves.length / 2) }).map((_, idx) => {
                          const w = a.moves[idx * 2];
                          const b = a.moves[idx * 2 + 1];
                          const lastPly = a.moves.length;
                          return (
                            <div key={idx} className="contents">
                              <div className="col-span-2 py-0.5 font-semibold text-slate-500">{idx + 1}.</div>
                              <div className={`col-span-5 rounded px-1.5 py-0.5 ${w && w.ply === lastPly ? "bg-amber-400/20 font-bold text-amber-300" : "text-slate-200"}`}>{w?.san ?? ""}</div>
                              <div className={`col-span-5 rounded px-1.5 py-0.5 ${b && b.ply === lastPly ? "bg-amber-400/20 font-bold text-amber-300" : "text-slate-400"}`}>{b?.san ?? ""}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Theory */}
                <details className="rounded-xl border border-slate-800/70 bg-slate-900/30 p-3">
                  <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Theory · {activeCat?.title}
                  </summary>
                  <p className="mt-2 text-[11px] italic leading-relaxed text-slate-400">{drill.theory}</p>
                </details>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}