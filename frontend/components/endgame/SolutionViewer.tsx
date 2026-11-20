"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import InteractiveBoard from "@/components/arena/InteractiveBoard";
import type { SolutionMove } from "@/lib/endgame";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const I_PREV = "M15 18l-6-6 6-6";
const I_NEXT = "M9 18l6-6-6-6";
const I_PLAY = "M6 4l14 8-14 8z";
const I_PAUSE = "M6 4h4v16H6z|M14 4h4v16h-4z";
const I_X = "M18 6 6 18|M6 6l12 12";
const I_CHECK = "M20 6 9 17l-5-5";
const I_TARGET = "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z";

interface SolutionViewerProps {
  startFen: string;
  moves: SolutionMove[];
  objectiveLabel: string;
  objectiveAchieved: boolean;
  playerColor: "white" | "black";
  source: string;
  note?: string;
  error?: string | null;
  onClose: () => void;
}

/**
 * Interactive, verified solution replay. The board shows a PREVIEW built from
 * the exact current position — the live attempt is never modified. Every move
 * is re-validated client-side with chess.js before display (defense in depth
 * on top of the backend's python-chess validation).
 */
export default function SolutionViewer({
  startFen, moves, objectiveLabel, objectiveAchieved, playerColor, source, note, error, onClose,
}: SolutionViewerProps) {
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(false);

  /* Client-side sequential re-validation: stop before any illegal move. */
  const line = useMemo(() => {
    const out: SolutionMove[] = [];
    try {
      const c = new Chess(startFen);
      for (const m of moves) {
        const res = c.move({ from: m.from_square, to: m.to_square, promotion: m.promotion ?? undefined });
        if (!res) break;
        out.push(m);
      }
    } catch { /* invalid start FEN or move — show only the validated prefix */ }
    return out;
  }, [startFen, moves]);

  const total = line.length;
  const atEnd = index >= total;
  const current = index > 0 ? line[index - 1] : null;
  const fen = current ? current.fen_after : startFen;
  const lastMove: [string, string] | null = current ? [current.from_square, current.to_square] : null;

  const prev = useCallback(() => { setAutoplay(false); setIndex((i) => Math.max(0, i - 1)); }, []);
  const next = useCallback(() => { setAutoplay(false); setIndex((i) => Math.min(total, i + 1)); }, [total]);

  /* Autoplay: async interval only; stops at the end of the line. */
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => {
      setIndex((i) => {
        if (i >= total) {
          window.setTimeout(() => setAutoplay(false), 0);
          return i;
        }
        return i + 1;
      });
    }, 1100);
    return () => window.clearInterval(t);
  }, [autoplay, total]);

  /* Keyboard navigation while the viewer is open. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === " ") { e.preventDefault(); setAutoplay((a) => !a); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose]);

  if (error && total === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-5 text-center">
        <p className="text-sm font-bold text-amber-300">Solution unavailable</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{error}</p>
        <button type="button" onClick={onClose}
          className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            <Icon d={I_CHECK} size={11} /> Verified solution
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-1 text-[10px] font-semibold text-slate-400">
            {source === "model" ? "Model technique" : "Stockfish line"} · from your position
          </span>
        </div>
        <button type="button" onClick={onClose} title="Close solution (Esc)"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
          <Icon d={I_X} size={13} /> Close
        </button>
      </div>

      {/* Preview board */}
      <div className="relative" style={{ ["--board-piece-size" as string]: "clamp(26px, 5.6vmin, 54px)" }}>
        <InteractiveBoard
          fen={fen}
          orientation={playerColor}
          playerColor={playerColor}
          lastMove={lastMove}
          interactive={false}
          isCheck={current?.is_check ?? false}
          isCheckmate={current?.is_mate ?? false}
          highlightSquares={lastMove ?? []}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
          <span className="rounded-full border border-slate-700 bg-slate-950/85 px-3 py-1 text-[10px] font-bold text-slate-300">
            Solution preview — your game is unchanged
          </span>
        </div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={prev} disabled={index === 0} title="Previous move (←)"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40">
          <Icon d={I_PREV} size={14} /> Previous
        </button>
        <button type="button" onClick={() => setAutoplay((a) => !a)} disabled={atEnd && !autoplay} title="Autoplay (Space)"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
            autoplay ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          } disabled:opacity-40`}>
          <Icon d={autoplay ? I_PAUSE : I_PLAY} size={13} /> {autoplay ? "Pause" : "Autoplay"}
        </button>
        <button type="button" onClick={next} disabled={atEnd} title="Next move (→)"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40">
          Next <Icon d={I_NEXT} size={14} />
        </button>
        <span className="ml-1 font-mono text-xs font-bold text-slate-400">{index} / {total}</span>
      </div>

      {/* Move list — player vs opponent clearly distinguished */}
      <div className="eg-scroll max-h-[150px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2 font-mono text-xs">
        <div className="grid grid-cols-12 gap-1">
          {Array.from({ length: Math.ceil(total / 2) }).map((_, idx) => {
            const w = line[idx * 2];
            const b = line[idx * 2 + 1];
            const wIdx = idx * 2 + 1;
            const bIdx = idx * 2 + 2;
            return (
              <div key={idx} className="contents">
                <div className="col-span-2 py-1 font-semibold text-slate-500">{idx + 1}.</div>
                <button type="button" onClick={() => { setAutoplay(false); setIndex(wIdx); }}
                  className={`col-span-5 rounded px-2 py-1 text-left transition ${
                    index === wIdx ? "bg-amber-400/25 font-bold text-amber-300"
                    : w?.color === playerColor ? "text-emerald-300 hover:bg-slate-800" : "text-slate-300 hover:bg-slate-800"
                  }`}>
                  {w?.san ?? ""}{w?.color === playerColor ? " ★" : ""}
                </button>
                <button type="button" onClick={() => { setAutoplay(false); setIndex(bIdx); }}
                  className={`col-span-5 rounded px-2 py-1 text-left transition ${
                    index === bIdx ? "bg-amber-400/25 font-bold text-amber-300"
                    : b?.color === playerColor ? "text-emerald-300 hover:bg-slate-800" : "text-slate-400 hover:bg-slate-800"
                  }`}>
                  {b?.san ?? ""}{b?.color === playerColor ? " ★" : ""}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-1 px-1 text-[10px] text-slate-500">★ your moves · click any move to jump · ← → to navigate</p>
      </div>

      {/* Objective status */}
      {atEnd && total > 0 && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${
          objectiveAchieved ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300" : "border-amber-500/40 bg-amber-950/30 text-amber-300"
        }`}>
          <Icon d={objectiveAchieved ? I_CHECK : I_TARGET} size={15} />
          <span>
            {objectiveAchieved
              ? <>Objective achieved: <strong>{objectiveLabel}</strong></>
              : <>The verified line ends here — the objective is not reached yet. Close the solution and keep playing from your position.</>}
          </span>
        </div>
      )}
      {note && <p className="text-[11px] italic leading-relaxed text-slate-500">{note}</p>}
    </div>
  );
}