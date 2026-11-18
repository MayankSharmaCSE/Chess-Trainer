"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import Board from "@/components/landing/Board";
import { api, platformLabel, resultLabel, type AnalysisOut, type GameDetail, type MoveExplanation, ApiError } from "@/lib/bff";

const KIND_STYLE: Record<string, string> = {
  BLUNDER: "bg-[#FBE4E2] text-[#9E2A21] ring-[#C8372D]/40",
  MISTAKE: "bg-[#FCEBD9] text-[#8A4A0E] ring-[#D9822B]/40",
  INACCURACY: "bg-[#F6F0D2] text-[#6B5A0A] ring-[#B59A1E]/40",
};

function fmtEval(cp: number | null, mate: number | null) {
  if (mate != null) return `${mate > 0 ? "+" : "−"}M${Math.abs(mate)}`;
  if (cp == null) return "—";
  return `${cp > 0 ? "+" : cp < 0 ? "−" : ""}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function ExplanationInner({ gameId, ply }: { gameId: string; ply: number }) {
  const [text, setText] = useState<MoveExplanation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let live = true;
    api<MoveExplanation>(`games/${gameId}/moves/${ply}/explanation`)
      .then((e) => {
        if (!live) return;
        setText(e);
        setState("ready");
      })
      .catch(() => {
        if (live) setState("error");
      });
    return () => {
      live = false;
    };
  }, [gameId, ply]);

  if (state === "loading") {
    return <p className="mt-2 text-sm text-[#56657A]" aria-live="polite">Explaining this move...</p>;
  }
  if (state === "error" || !text) {
    return <p className="mt-2 text-sm text-[#56657A]">Could not load the explanation for this move.</p>;
  }
  return (
    <div className="mt-2 rounded-[8px] border border-[#D5DCE4] bg-white p-2.5">
      <p className="text-sm leading-relaxed">{text.explanation}</p>
      <p className="mt-1 text-[11px] text-[#8593A6]">Grounded in Stockfish eval + best line · {text.source}</p>
    </div>
  );
}

function Explanation({ gameId, ply }: { gameId: string; ply: number }) {
  // Key remount resets state per move without setState-in-effect.
  return <ExplanationInner key={`${gameId}:${ply}`} gameId={gameId} ply={ply} />;
}

export default function GameReplay({ id }: { id: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisOut | null>(null);
  const [analysisState, setAnalysisState] = useState<"loading" | "ready" | "failed" | "unanalyzed">("loading");
  const [analysisMsg, setAnalysisMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    api<GameDetail>(`games/${id}`)
      .then(setGame)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load game."));
  }, [id]);

  useEffect(() => {
    api<AnalysisOut>(`games/${id}/analysis`)
      .then((a) => {
        setAnalysis(a);
        setAnalysisState("ready");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setAnalysisState("unanalyzed");
        else setAnalysisState("failed");
      });
  }, [id]);

  // Poll while the engine is working.
  useEffect(() => {
    if (analysisState !== "ready" || !analysis || analysis.status !== "pending") return;
    const t = window.setInterval(() => {
      api<AnalysisOut>(`games/${id}/analysis`)
        .then((a) => setAnalysis(a))
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [analysisState, analysis, id]);

  async function startAnalysis() {
    setAnalyzing(true);
    setAnalysisMsg(null);
    try {
      const a = await api<AnalysisOut>(`games/${id}/analyze?depth=15`, { method: "POST" });
      setAnalysis(a);
      setAnalysisState("ready");
    } catch (e) {
      setAnalysisMsg(e instanceof ApiError ? e.message : "Could not start analysis.");
    } finally {
      setAnalyzing(false);
    }
  }

  const clsByPly = useMemo(
    () => new Map((analysis?.moves ?? []).map((m) => [m.ply, m] as const)),
    [analysis]
  );

  const replay = useMemo(() => {
    if (!game) return null;
    try {
      const c = new Chess();
      c.loadPgn(game.pgn);
      const hist = c.history({ verbose: true });
      const walk = new Chess();
      const fens = [walk.fen()];
      const last: ([string, string] | null)[] = [null];
      for (const m of hist) {
        walk.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
        fens.push(walk.fen());
        last.push([m.from, m.to]);
      }
      return { fens, last, sans: hist.map((m) => m.san) };
    } catch {
      return null;
    }
  }, [game]);

  if (error) {
    return (
      <p role="alert" className="text-sm font-medium text-[#9E2A21]">
        {error}{" "}
        <Link href="/games" className="underline underline-offset-2">Back to library</Link>
      </p>
    );
  }
  if (!game) {
    return <p className="text-[#56657A]" aria-live="polite">Loading game...</p>;
  }
  if (!replay) {
    return (
      <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
        <p className="font-semibold">Could not parse this game&apos;s PGN.</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">Raw PGN</summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs">{game.pgn}</pre>
        </details>
      </div>
    );
  }

  const total = replay.sans.length;
  const clamped = Math.max(0, Math.min(total, ply));
  const pairs: { n: number; w?: number; b?: number }[] = [];
  for (let i = 1; i <= total; i += 2) {
    pairs.push({ n: (i + 1) / 2, w: i, b: i + 1 <= total ? i + 1 : undefined });
  }
  const rating = (r: number | null) => (r != null ? ` (${r})` : "");
  const sel = clsByPly.get(clamped);
  const analyzed = analysis?.status === "done";
  const curPos = clamped === 0 ? analysis?.moves[0] : analysis?.moves[clamped - 1];
  const curEval =
    analyzed && curPos
      ? clamped === 0
        ? fmtEval(curPos.eval_before_cp, curPos.mate_before)
        : fmtEval(curPos.eval_after_cp, curPos.mate_after)
      : null;

  const counts =
    analyzed && analysis
      ? `${analysis.blunder_count} blunders, ${analysis.mistake_count} mistakes, ${analysis.inaccuracy_count} inaccuracies`
      : null;

  return (
    <div className="grid gap-6">
      <div className="rounded-[18px] border border-[#D5DCE4] bg-white p-5">
        <p className="text-sm text-[#56657A]">
          {platformLabel(game.platform)}
          {game.played_at ? ` · ${new Date(game.played_at).toLocaleString()}` : ""}
          {game.time_control ? ` · ${game.time_control}` : ""}
          {game.rated ? " · Rated" : ""}
        </p>
        <p className="mt-1 text-[17px] font-bold">
          {game.white_username ?? "? "}{rating(game.white_rating)} vs {game.black_username ?? "?"}
          {rating(game.black_rating)}
        </p>
        <p className="mt-1 text-sm text-[#56657A]">
          You played {game.user_color ?? "?"} · result:{" "}
          <span className="font-bold text-[#13233A]">{resultLabel(game.user_result)}</span>
          {game.opening_name ? ` · ${game.opening_name}` : ""}
        </p>
      </div>

      <div className="rounded-[18px] border border-[#D5DCE4] bg-white p-5" aria-live="polite">
        {analysisState === "loading" && (
          <p className="text-sm text-[#56657A]">Checking analysis status...</p>
        )}
        {analysisState === "unanalyzed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#56657A]">
              No engine analysis yet. Stockfish checks every move at depth 15 (about 30s for a
              full game, runs in the background).
            </p>
            <button
              type="button"
              disabled={analyzing}
              onClick={startAnalysis}
              className="rounded-[10px] bg-[#13233A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:opacity-60"
            >
              {analyzing ? "Starting..." : "Analyze with Stockfish"}
            </button>
          </div>
        )}
        {analysisState === "ready" && analysis?.status === "pending" && (
          <p className="text-sm font-medium">Analyzing with Stockfish... this page updates automatically.</p>
        )}
        {analysisState === "ready" && analysis?.status === "done" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">
                {analysis.engine_version || analysis.engine_name}, depth {analysis.depth}: {counts}.
              </span>
            </p>
            <button
              type="button"
              disabled={analyzing}
              onClick={startAnalysis}
              className="rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] disabled:opacity-60"
            >
              Re-analyze
            </button>
          </div>
        )}
        {analysisState === "ready" && analysis?.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#9E2A21]" role="alert">
              Analysis failed: {analysis.error ?? "unknown error."}
            </p>
            <button
              type="button"
              disabled={analyzing}
              onClick={startAnalysis}
              className="rounded-[10px] border border-[#D5DCE4] px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] disabled:opacity-60"
            >
              Retry
            </button>
          </div>
        )}
        {analysisState === "failed" && (
          <p className="text-sm text-[#56657A]">
            Could not load analysis status. Reload the page to retry.
          </p>
        )}
        {analysisMsg && (
          <p className="mt-2 text-sm font-medium text-[#9E2A21]" role="alert">{analysisMsg}</p>
        )}
      </div>

      <div
        className="grid gap-6 rounded-[18px] border border-[#D5DCE4] bg-white p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setPly((p) => Math.min(total, p + 1));
          if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
        }}
      >
        <div>
          <Board
            fen={replay.fens[clamped]}
            lastMove={replay.last[clamped]}
            label={clamped === 0 ? "Starting position." : `Position after ${replay.sans[clamped - 1]}.`}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-[#56657A]">
              Move {Math.ceil(clamped / 2)} of {Math.ceil(total / 2)}
              {curEval != null && (
                <> · Eval <span className="font-mono font-semibold text-[#13233A]">{curEval}</span></>
              )}
            </p>
            <div className="flex gap-1" aria-label="Replay controls">
              {[
                { l: "First move", i: "⏮", p: 0 },
                { l: "Previous move", i: "◀", p: clamped - 1 },
                { l: "Next move", i: "▶", p: clamped + 1 },
                { l: "Last move", i: "⏭", p: total },
              ].map((b) => (
                <button
                  key={b.l}
                  type="button"
                  aria-label={b.l}
                  onClick={() => setPly(Math.max(0, Math.min(total, b.p)))}
                  className="grid h-9 w-9 place-items-center rounded-[8px] border border-[#D5DCE4] text-[13px] text-[#13233A] hover:bg-[#EEF1F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
                >
                  {b.i}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          {sel?.classification && (
            <div className="mb-2 rounded-[12px] bg-[#F2F4F6] p-3" aria-live="polite">
              <p>
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ring-1 ${KIND_STYLE[sel.classification]}`}>
                  {sel.classification}
                </span>
                <span className="font-mono font-semibold">{sel.played_san}</span>{" "}
                <span className="font-mono text-[#56657A]">
                  {fmtEval(sel.eval_before_cp, sel.mate_before)} → {fmtEval(sel.eval_after_cp, sel.mate_after)}
                </span>
              </p>
              {sel.best_san && (
                <p className="mt-1 text-sm">
                  Better: <span className="font-mono font-semibold">{sel.best_san}</span>
                  {sel.pv_sans && sel.pv_sans.length > 1 && (
                    <span className="text-[#56657A]"> ({sel.pv_sans.join(" ")})</span>
                  )}
                </p>
              )}
              {sel.is_user_move && <Explanation gameId={id} ply={clamped} />}
            </div>
          )}
        <ol className="grid content-start grid-cols-[2.2rem_1fr_1fr] gap-x-1 gap-y-1 font-mono text-[14px]" aria-label="Moves">
          {pairs.map((row) => (
            <li key={row.n} className="contents">
              <span className="py-1.5 text-[#8593A6]">{row.n}.</span>
              {[row.w, row.b].map((p, k) => {
                if (!p) return <span key={k} />;
                const active = clamped === p;
                const cls = clsByPly.get(p)?.classification;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPly(p)}
                    aria-current={active ? "step" : undefined}
                    className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] ${active ? "bg-[#13233A] text-white" : "text-[#13233A] hover:bg-[#EEF1F4]"}`}
                  >
                    <span>{replay.sans[p - 1]}</span>
                    {cls && (
                      <span className={`rounded-full px-1.5 py-px font-sans text-[9.5px] font-bold tracking-wide ring-1 ${KIND_STYLE[cls]}`}>
                        {cls}
                      </span>
                    )}
                  </button>
                );
              })}
            </li>
          ))}
        </ol>
        </div>
      </div>

      <p className="text-sm text-[#56657A]">
        <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">
          Back to library
        </Link>
      </p>
    </div>
  );
}
