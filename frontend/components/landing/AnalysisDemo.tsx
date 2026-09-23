"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import Board, { BoardArrow } from "./Board";
import { DEMO_GAME, DEMO_MISTAKES, DemoMistake, MistakeKind } from "./data";

const KIND_STYLE: Record<MistakeKind, string> = {
  BLUNDER: "bg-[#FBE4E2] text-[#9E2A21] ring-[#C8372D]/40",
  MISTAKE: "bg-[#FCEBD9] text-[#8A4A0E] ring-[#D9822B]/40",
  INACCURACY: "bg-[#F6F0D2] text-[#6B5A0A] ring-[#B59A1E]/40",
};
const RED = "#C8372D";
const GREEN = "#1F7A4D";

function evalToPercent(v: number | string) {
  if (typeof v === "string") return v.startsWith("-") || v === "0-1" ? 3 : 97;
  return 50 + 50 * Math.tanh(v / 4);
}
function formatEval(v: number | string) {
  if (typeof v === "string") return v === "-M1" ? "−M1" : v;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
}

type Feedback = { tone: "good" | "bad" | "info"; text: string } | null;

export default function AnalysisDemo() {
  const { fens, squares } = useMemo(() => {
    const g = new Chess();
    const f = [g.fen()];
    const s: ([string, string] | null)[] = [null];
    for (const san of DEMO_GAME.sans) {
      const m = g.move(san);
      f.push(g.fen());
      s.push([m.from, m.to]);
    }
    return { fens: f, squares: s };
  }, []);

  const last = DEMO_GAME.sans.length;
  const [ply, setPly] = useState(0);
  const [focus, setFocus] = useState<DemoMistake | null>(null);
  const [drill, setDrill] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hint, setHint] = useState(false);
  const [solved, setSolved] = useState(false);
  const touched = useRef(false);

  // One orchestrated moment: replay the opening, then stop on the blunder.
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stopAt = DEMO_MISTAKES[1];
    if (reduce) {
      setPly(stopAt.ply);
      setFocus(stopAt);
      return;
    }
    let p = 0;
    const id = window.setInterval(() => {
      if (touched.current) return window.clearInterval(id);
      p += 1;
      if (p >= stopAt.ply) {
        window.clearInterval(id);
        setPly(stopAt.ply);
        setFocus(stopAt);
        return;
      }
      setPly(p);
    }, 520);
    return () => window.clearInterval(id);
  }, []);

  function resetDrill() {
    setDrill(false);
    setFeedback(null);
    setHint(false);
    setSolved(false);
  }
  function goTo(p: number) {
    touched.current = true;
    const clamped = Math.max(0, Math.min(last, p));
    setPly(clamped);
    setFocus(DEMO_MISTAKES.find((m) => m.ply === clamped) ?? null);
    resetDrill();
  }
  function openMistake(m: DemoMistake) {
    touched.current = true;
    setPly(m.ply);
    setFocus(m);
    resetDrill();
  }

  function handleDrillMove(from: string, to: string) {
    if (!focus) return;
    const g = new Chess(fens[focus.ply - 1]);
    let san: string;
    try {
      san = g.move({ from, to, promotion: "q" }).san;
    } catch {
      setFeedback({ tone: "bad", text: `${from}–${to} isn't a legal move here. Pick another square.` });
      return;
    }
    const clean = san.replace(/[+#]/g, "");
    if (focus.accept.some((a) => a.replace(/[+#]/g, "") === clean)) {
      setSolved(true);
      setFeedback({ tone: "good", text: `Correct. ${san} is what Stockfish recommends here.` });
    } else {
      setFeedback({ tone: "bad", text: `${san} is legal, but not the best move. Try again or use a hint.` });
    }
  }

  const showingBefore = !!focus;
  const fen = showingBefore ? fens[focus!.ply - 1] : fens[ply];
  const lastMove = showingBefore ? squares[focus!.ply - 1] : squares[ply];
  const evalValue = showingBefore ? DEMO_GAME.evals[focus!.ply - 1] : DEMO_GAME.evals[ply];
  const arrows: BoardArrow[] = [];
  if (focus && (!drill || solved)) {
    arrows.push({ from: focus.played[0], to: focus.played[1], color: RED });
    arrows.push({ from: focus.best.from, to: focus.best.to, color: GREEN });
  }
  const whitePct = evalToPercent(evalValue);
  const boardLabel = focus
    ? `Position before ${focus.label}. Red arrow shows the move played, green arrow shows ${focus.best.san}.`
    : ply === 0
      ? "Starting position."
      : `Position after move ${Math.ceil(ply / 2)}${ply % 2 ? "" : "..."} ${DEMO_GAME.sans[ply - 1]}.`;

  const pairs: { n: number; w?: number; b?: number }[] = [];
  for (let i = 1; i <= last; i += 2) pairs.push({ n: (i + 1) / 2, w: i, b: i + 1 <= last ? i + 1 : undefined });
  const counts = DEMO_MISTAKES.reduce<Record<string, number>>((acc, m) => ((acc[m.kind] = (acc[m.kind] || 0) + 1), acc), {});

  return (
    <div
      className="grid gap-6 rounded-[18px] border border-[#D5DCE4] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8"
      onKeyDown={(e) => {
        if (drill) return;
        if (e.key === "ArrowRight") { e.preventDefault(); goTo((focus ? focus.ply : ply) + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); goTo((focus ? focus.ply : ply) - 1); }
      }}
    >
      {/* Board column */}
      <div>
        <div className="flex gap-3">
          <div
            className="relative w-4 shrink-0 overflow-hidden rounded-[4px] bg-[#1B2B42] ring-1 ring-[#13233A]/30"
            role="meter"
            aria-label="Engine evaluation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(whitePct)}
            aria-valuetext={`Evaluation ${focus ? focus.evalBefore : formatEval(evalValue)} for White`}
          >
            <div className="absolute inset-x-0 bottom-0 bg-[#F4F6F2] transition-[height] duration-500 motion-reduce:transition-none" style={{ height: `${whitePct}%` }} />
          </div>
          <div className="min-w-0 flex-1">
            <Board fen={fen} lastMove={lastMove} arrows={arrows} interactive={drill && !solved} hintSquare={drill && hint && !solved ? focus?.best.from : null} onMove={handleDrillMove} label={boardLabel} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 pl-7">
          <p className="text-sm text-[#56657A]">
            Eval <span className="font-mono font-semibold text-[#13233A]">{focus ? focus.evalBefore : formatEval(evalValue)}</span>
            {focus && <span> before the move</span>}
          </p>
          <div className="flex gap-1" aria-label="Replay controls">
            {[
              { l: "First move", i: "⏮", p: 0 },
              { l: "Previous move", i: "◀", p: (focus ? focus.ply : ply) - 1 },
              { l: "Next move", i: "▶", p: (focus ? focus.ply : ply) + 1 },
              { l: "Last move", i: "⏭", p: last },
            ].map((b) => (
              <button
                key={b.l}
                type="button"
                aria-label={b.l}
                disabled={drill}
                onClick={() => goTo(b.p)}
                className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#D5DCE4] text-[13px] text-[#13233A] hover:bg-[#EEF1F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] disabled:opacity-40"
              >
                {b.i}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analysis column */}
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <p className="text-sm text-[#56657A]">{DEMO_GAME.title}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-[#13233A]">
            {DEMO_GAME.white} vs {DEMO_GAME.black}, {DEMO_GAME.result}
          </p>
        </div>

        <ol className="grid grid-cols-[2.2rem_1fr_1fr] gap-x-1 gap-y-1 font-mono text-[14px]" aria-label="Moves">
          {pairs.map((row) => (
            <li key={row.n} className="contents">
              <span className="py-1.5 text-[#8593A6]">{row.n}.</span>
              {[row.w, row.b].map((p, k) => {
                if (!p) return <span key={k} />;
                const m = DEMO_MISTAKES.find((x) => x.ply === p);
                const active = (focus ? focus.ply : ply) === p;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={drill}
                    onClick={() => (m ? openMistake(m) : goTo(p))}
                    aria-current={active ? "step" : undefined}
                    className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] ${active ? "bg-[#13233A] text-white" : "text-[#13233A] hover:bg-[#EEF1F4]"}`}
                  >
                    <span>{DEMO_GAME.sans[p - 1]}{m ? m.symbol : ""}</span>
                    {m && (
                      <span className={`rounded-full px-1.5 py-px font-sans text-[9.5px] font-bold tracking-wide ring-1 ${KIND_STYLE[m.kind]}`}>{m.kind}</span>
                    )}
                  </button>
                );
              })}
            </li>
          ))}
        </ol>

        <div className="rounded-[12px] bg-[#F2F4F6] p-4" aria-live="polite">
          {!focus ? (
            <>
              <p className="font-semibold text-[#13233A]">
                {DEMO_MISTAKES.length} moves flagged in this game: {counts.BLUNDER} blunders, {counts.MISTAKE} mistake, {counts.INACCURACY} inaccuracy.
              </p>
              <p className="mt-1 text-sm text-[#56657A]">Select a flagged move to see what went wrong and what Stockfish would have played.</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ring-1 ${KIND_STYLE[focus.kind]}`}>{focus.kind}</span>
                <span className="font-mono font-semibold text-[#13233A]">{focus.label}{focus.symbol}</span>
                <span className="font-mono text-sm text-[#56657A]">{focus.evalBefore} → {focus.evalAfter}</span>
              </div>

              {!drill ? (
                <>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#13233A]">{focus.explanation}</p>
                  <p className="mt-3 text-sm text-[#13233A]">
                    <span className="mr-1.5 inline-block h-2 w-4 translate-y-[-1px] rounded-full bg-[#1F7A4D]" aria-hidden="true" />
                    Better: <span className="font-mono font-semibold">{focus.best.san}</span>
                    <span className="ml-3 mr-1.5 inline-block h-2 w-4 translate-y-[-1px] rounded-full bg-[#C8372D]" aria-hidden="true" />
                    Played: <span className="font-mono font-semibold">{DEMO_GAME.sans[focus.ply - 1]}</span>
                  </p>
                  <p className="mt-2 text-xs text-[#8593A6]">Based on move {Math.ceil(focus.ply / 2)} of this game, {DEMO_GAME.engine}.</p>
                  <button
                    type="button"
                    onClick={() => { touched.current = true; setDrill(true); setFeedback({ tone: "info", text: "You're White. Select a piece, then the square to move it to." }); }}
                    className="mt-4 rounded-[10px] border border-[#13233A] px-4 py-2 text-sm font-semibold text-[#13233A] hover:bg-[#13233A] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A]"
                  >
                    Find the better move yourself
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[15px] text-[#13233A]">What should White play instead of {DEMO_GAME.sans[focus.ply - 1]}?</p>
                  {feedback && (
                    <p className={`mt-2 text-sm font-medium ${feedback.tone === "good" ? "text-[#1F7A4D]" : feedback.tone === "bad" ? "text-[#9E2A21]" : "text-[#56657A]"}`}>
                      {feedback.text}
                    </p>
                  )}
                  {hint && !solved && <p className="mt-2 text-sm text-[#13233A]">Hint: {focus.hint} The piece to move is circled.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!solved && !hint && (
                      <button type="button" onClick={() => setHint(true)} className="rounded-[10px] border border-[#D5DCE4] bg-white px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A]">
                        Show a hint
                      </button>
                    )}
                    {!solved && (
                      <button type="button" onClick={() => { setSolved(true); setFeedback({ tone: "info", text: `The answer is ${focus.best.san}.` }); }} className="rounded-[10px] border border-[#D5DCE4] bg-white px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A]">
                        Show the answer
                      </button>
                    )}
                    <button type="button" onClick={resetDrill} className="rounded-[10px] px-3 py-1.5 text-sm font-semibold text-[#56657A] hover:text-[#13233A]">
                      Back to the explanation
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
