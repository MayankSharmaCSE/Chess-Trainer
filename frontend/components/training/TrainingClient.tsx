"use client";

import { useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import Board from "@/components/landing/Board";
import { api, type AttemptResult, type Drill, type DrillCoaching, ApiError } from "@/lib/bff";

const KIND_STYLE: Record<string, string> = {
  BLUNDER: "bg-[#FBE4E2] text-[#9E2A21] ring-[#C8372D]/40",
  MISTAKE: "bg-[#FCEBD9] text-[#8A4A0E] ring-[#D9822B]/40",
  INACCURACY: "bg-[#F6F0D2] text-[#6B5A0A] ring-[#B59A1E]/40",
};

function toUciOptions(from: string, to: string, fen: string): string[] {
  try {
    const c = new Chess(fen);
    const moves = c.moves({ square: from as never, verbose: true }) as {
      from: string; to: string; promotion?: string;
    }[];
    const match = moves.filter((m) => m.to === to);
    if (match.length === 0) return [];
    const promos = match.filter((m) => m.promotion);
    if (promos.length > 0) return promos.map((m) => `${from}${to}${m.promotion}`);
    return [`${from}${to}`];
  } catch {
    return [];
  }
}

type CoachState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string; source: string }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/** Backend 503 detail when LLM_API_KEY is empty (the BFF also uses 503 for "backend down"). */
const COACHING_OFF = "AI coaching not configured";

function CoachingBox({
  title,
  idleLabel,
  state,
  onLoad,
}: {
  title: string;
  idleLabel: string;
  state: CoachState;
  onLoad: () => void;
}) {
  return (
    <div aria-live="polite" aria-busy={state.status === "loading"} className="mt-3">
      {state.status === "idle" && (
        <button
          type="button"
          onClick={onLoad}
          className="rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
        >
          {idleLabel}
        </button>
      )}
      {state.status === "loading" && <p className="text-sm text-[#56657A]">Coaching...</p>}
      {state.status === "ready" && (
        <div className="rounded-[10px] border border-[#D5DCE4] bg-[#F7F9FB] p-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#56657A]">{title}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ring-1 ${
                state.source === "llm"
                  ? "bg-[#E6EEF9] text-[#1D4E89] ring-[#1D4E89]/30"
                  : "bg-[#EEF1F4] text-[#56657A] ring-[#8593A6]/40"
              }`}
              title={state.source === "llm" ? "Written by the AI coach from Stockfish's analysis" : "Rule-based text from Stockfish's analysis"}
            >
              {state.source === "llm" ? "AI" : "BASIC"}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#13233A]">{state.text}</p>
        </div>
      )}
      {state.status === "unavailable" && (
        <p className="text-sm text-[#56657A]">AI coaching isn&apos;t set up on this server yet. Moves are still graded by the engine.</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-[#9E2A21]">
          {state.message}{" "}
          <button type="button" onClick={onLoad} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </p>
      )}
    </div>
  );
}

function DrillCard({ drill, onSolved }: { drill: Drill; onSolved: (id: number) => void }) {
  const [fen, setFen] = useState(drill.fen_before);
  const [tone, setTone] = useState<"info" | "good" | "bad">("info");
  const [msg, setMsg] = useState("Find the best move. Select one of your pieces, then its target square.");
  const [solved, setSolved] = useState(drill.solved);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string; options: string[] } | null>(null);
  // Stockfish's move is already in the drill; the LLM only explains it ("reveal").
  const [reveal, setReveal] = useState<CoachState>({ status: "idle" });

  async function loadReveal() {
    setReveal({ status: "loading" });
    try {
      const r = await api<DrillCoaching>(`training/drills/${drill.id}/coaching`, {
        method: "POST",
        body: { level: "reveal" },
      });
      setReveal({ status: "ready", text: r.text, source: r.source });
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.message === COACHING_OFF) {
        setReveal({ status: "unavailable" });
      } else {
        setReveal({ status: "error", message: e instanceof ApiError ? e.message : "Could not load coaching." });
      }
    }
  }

  async function submitUci(uci: string, from: string, to: string, currentFen: string) {
    setBusy(true);
    try {
      const r = await api<AttemptResult>(`training/drills/${drill.id}/attempts`, {
        method: "POST",
        body: { played_uci: uci },
      });
      setTries((t) => t + 1);
      if (r.correct) {
        try {
          const c = new Chess(currentFen);
          c.move({ from, to, promotion: uci.length === 5 ? uci[4] : undefined });
          setFen(c.fen());
        } catch {
          /* keep position */
        }
        setSolved(true);
        onSolved(drill.id);
        if (reveal.status === "idle" || reveal.status === "error") void loadReveal();
        setTone("good");
        setMsg(
          r.equivalent
            ? `Accepted — ${r.played_san} is just as good as ${drill.best_san ?? "the engine's top move"} here (within engine tolerance). You originally played ${drill.played_san}.`
            : `Correct — ${r.played_san} is the best move. You originally played ${drill.played_san} here.`
        );
      } else {
        setTone("bad");
        setMsg(`${r.played_san ?? "That move"} is legal but not the best. You originally played ${drill.played_san} here.`);
      }
    } catch (e) {
      setTone("bad");
      setMsg(e instanceof ApiError ? e.message : "Could not grade that move. Retry.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(from: string, to: string, currentFen: string) {
    if (solved || busy) return;
    const options = toUciOptions(from, to, currentFen);
    if (options.length === 0) {
      setTone("bad");
      setMsg("That move is not legal in this position. Try again.");
      return;
    }
    if (options.length > 1) {
      // Promotion choice: ask which piece before submitting.
      setPendingPromo({ from, to, options });
      setTone("info");
      setMsg("Choose your promotion piece below.");
      return;
    }
    await submitUci(options[0], from, to, currentFen);
  }

  const side = new Chess(drill.fen_before).turn() === "w" ? "White" : "Black";

  return (
    <article className="rounded-[18px] border border-[#D5DCE4] bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ring-1 ${KIND_STYLE[drill.classification] ?? KIND_STYLE.MISTAKE}`}>
          {drill.classification}
        </span>
        <span className="rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#56657A] ring-1 ring-[#8593A6]/40">
          {drill.phase.toUpperCase()}
        </span>
        {drill.opening && <span className="text-sm text-[#56657A]">{drill.opening}</span>}
        {solved && (
          <span className="rounded-full bg-[#E3F2E9] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#1F7A4D] ring-1 ring-[#1F7A4D]/40">
            SOLVED
          </span>
        )}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Board
            fen={fen}
            interactive={!solved}
            onMove={(from, to) => handleMove(from, to, fen)}
            label={`Training position, ${side} to move. From your game ${drill.game_id}.`}
          />
        </div>
        <div>
          <p aria-live="polite" className={`rounded-[10px] p-3 text-sm leading-relaxed ${
            tone === "good" ? "bg-[#E3F2E9] text-[#1F7A4D]"
            : tone === "bad" ? "bg-[#FBE4E2] text-[#9E2A21]"
            : "bg-[#F2F4F6] text-[#3B4B62]"
          }`}>
            {busy ? "Checking..." : msg}
          </p>
          <p className="mt-2 text-sm text-[#56657A]">Attempts on this drill: {tries}</p>
          {pendingPromo && !solved && (
            <div className="mt-2" role="group" aria-label="Choose promotion piece">
              <p className="text-sm font-semibold">Promote to:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    { suffix: "q", label: "Queen" },
                    { suffix: "r", label: "Rook" },
                    { suffix: "b", label: "Bishop" },
                    { suffix: "n", label: "Knight" },
                  ] as const
                )
                  .filter((p) => pendingPromo.options.includes(`${pendingPromo.from}${pendingPromo.to}${p.suffix}`))
                  .map((p) => (
                    <button
                      key={p.suffix}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const uci = `${pendingPromo.from}${pendingPromo.to}${p.suffix}`;
                        setPendingPromo(null);
                        submitUci(uci, pendingPromo.from, pendingPromo.to, fen);
                      }}
                      className="rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] disabled:opacity-60"
                    >
                      {p.label}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setPendingPromo(null);
                    setTone("info");
                    setMsg("Promotion cancelled. Find the best move.");
                  }}
                  className="rounded-[10px] px-3 py-1.5 text-sm font-semibold text-[#56657A] hover:text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {!solved && reveal.status === "idle" && (
            <button
              type="button"
              onClick={loadReveal}
              className="mt-3 rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
            >
              Need a hint?
            </button>
          )}
          {!solved && reveal.status !== "idle" && (
            <div className="mt-3">
              <div aria-live="polite" className="rounded-[10px] border border-[#D5DCE4] bg-white p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#56657A]">Stockfish&apos;s best move</p>
                <p className="mt-1 text-sm">
                  <span className="font-mono text-base font-bold text-[#13233A]">{drill.best_san ?? "—"}</span>
                  {drill.pv_sans && drill.pv_sans.length > 1 && (
                    <span className="text-[#56657A]"> (line: {drill.pv_sans.join(" ")})</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-[#56657A]">Play it on the board to finish this drill.</p>
              </div>
              <CoachingBox title="Coach's explanation" idleLabel="Explain this move" state={reveal} onLoad={loadReveal} />
            </div>
          )}
          {solved && (
            <div className="mt-3">
              <p className="text-sm">
                Best line: <span className="font-mono font-semibold">{drill.best_san ?? "—"}</span>
                {drill.pv_sans && drill.pv_sans.length > 1 && (
                  <span className="text-[#56657A]"> ({drill.pv_sans.join(" ")})</span>
                )}
              </p>
              <CoachingBox
                title="Coach's explanation"
                idleLabel="Explain this solution"
                state={reveal}
                onLoad={loadReveal}
              />
              <p className="mt-2 text-sm">
                <Link href={`/games/${drill.game_id}`} className="font-semibold text-[#13233A] underline underline-offset-2">
                  Review source game →
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function DrillList({ initial }: { initial: { drills: Drill[]; total: number } }) {
  const [drills, setDrills] = useState(initial.drills);
  const [index, setIndex] = useState(0);

  function markSolved(id: number) {
    // Keep the solved drill in place (even when solved ones are hidden) so its
    // feedback and coach's explanation stay visible; it drops out on next load.
    setDrills((ds) => ds.map((d) => (d.id === id ? { ...d, solved: true } : d)));
  }

  if (drills.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
        <p className="font-semibold">All drills solved — nice work</p>
        <p className="mt-1 text-sm text-[#56657A]">
          <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">Analyze more games</Link> to generate new drills.
        </p>
      </div>
    );
  }

  const safeIndex = Math.min(index, drills.length - 1);
  const current = drills[safeIndex];

  function goNext() {
    setIndex((i) => Math.min(i + 1, drills.length - 1));
  }

  function goPrev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#56657A]" aria-live="polite">
          Drill {safeIndex + 1} of {drills.length} ·{" "}
          {drills.every((d) => d.solved) ? "all solved — nice work." : "worst mistakes first."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex === 0}
            className="rounded-[10px] border border-[#D5DCE4] px-4 py-2 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex >= drills.length - 1}
            className="rounded-[10px] bg-[#13233A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
      <DrillCard key={current.id} drill={current} onSolved={markSolved} />
      <div className="flex justify-between gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={safeIndex === 0}
          className="rounded-[10px] border border-[#D5DCE4] px-4 py-2 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev drill
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={safeIndex >= drills.length - 1}
          className="rounded-[10px] bg-[#13233A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {safeIndex >= drills.length - 1 ? "Last drill" : "Next drill →"}
        </button>
      </div>
    </div>
  );
}

export default function TrainingClient() {
  const [showSolved, setShowSolved] = useState(false);
  const [data, setData] = useState<{ drills: Drill[]; total: number } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function load(solved: boolean) {
    setState("loading");
    setError(null);
    try {
      const d = await api<{ drills: Drill[]; total: number }>(
        `training/drills${solved ? "?include_solved=true" : ""}`
      );
      setData(d);
      setState("ready");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load drills.");
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
        <p className="font-semibold">Ready to train on your mistakes?</p>
        <p className="mt-1 text-sm text-[#56657A]">Drills are generated from your analyzed games — worst blunders first.</p>
        <button
          type="button"
          onClick={() => load(showSolved)}
          className="mt-3 rounded-[10px] bg-[#1F7A4D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16663E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F7A4D]"
        >
          Load my drills
        </button>
      </div>
    );
  }
  if (state === "loading") {
    return <p className="text-[#56657A]" aria-live="polite">Generating personalized drills...</p>;
  }
  if (state === "error") {
    return (
      <p role="alert" className="text-sm font-medium text-[#9E2A21]">
        {error}{" "}
        <button type="button" onClick={() => load(showSolved)} className="underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  }
  if (!data || data.drills.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
        <p className="font-semibold">No drills yet</p>
        <p className="mt-1 text-sm text-[#56657A]">
          <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">Analyze more games</Link>{" "}
          to generate drills from your mistakes.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <div>
        <button
          type="button"
          onClick={() => { setShowSolved((s) => !s); setState("idle"); setData(null); }}
          className="rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
        >
          {showSolved ? "Hide solved (reload)" : "Show solved (reload)"}
        </button>
      </div>
      <DrillList key={`${showSolved}-${data.total}`} initial={data} />
    </div>
  );
}
