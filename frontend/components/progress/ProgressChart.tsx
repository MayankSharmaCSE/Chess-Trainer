"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type ProgressReport, ApiError } from "@/lib/bff";

function pct(x: number | null): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`;
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return <span className="text-[#8593A6]">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${14 - ((v - min) / span) * 12}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 16" className="h-6 w-28" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="#13233A" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Bars({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return <span className="text-[#8593A6]">—</span>;
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-10 items-end gap-1" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span key={i} title={`${v}`} className="w-3 rounded-t-[3px] bg-[#C8372D]/70"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}


export default function ProgressChart() {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      setReport(await api<ProgressReport>("progress"));
      setState("ready");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load progress.");
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div>
        <p className="text-sm text-[#56657A]">Rating, accuracy and mistakes per game over time.</p>
        <button type="button" onClick={load}
          className="mt-3 rounded-[10px] border border-[#D5DCE4] px-4 py-2 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]">
          Load my progress
        </button>
      </div>
    );
  }
  if (state === "loading") {
    return <p className="text-[#56657A]" aria-live="polite">Loading your progress...</p>;
  }
  if (state === "error" || !report) {
    return (
      <p role="alert" className="text-sm font-medium text-[#9E2A21]">
        {error ?? "Failed to load progress."}{" "}
        <button type="button" onClick={load} className="underline underline-offset-2">Retry</button>
      </p>
    );
  }
  if (report.games_analyzed === 0) {
    return (
      <p className="text-sm text-[#56657A]">
        No analyzed games yet.{" "}
        <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">Analyze a game</Link>{" "}
        to start tracking.
      </p>
    );
  }

  const acc = report.points.map((p) => (p.accuracy == null ? 0 : Math.round(p.accuracy * 100)));
  const flags = report.points.map((p) => p.blunders + p.mistakes + p.inaccuracies);
  const ratings = report.rating_trend.map((r) => r.rating);

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[#56657A]" aria-live="polite">
        {report.games_analyzed} games · accuracy {pct(report.overall_accuracy)} ·{" "}
        {report.avg_blunders_per_game.toFixed(1)} blunders/game ·{" "}
        {report.avg_mistakes_per_game.toFixed(1)} mistakes/game.
        {report.insufficient_data && <> Trends need at least 3 games — keep analyzing.</>}
      </p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[12px] border border-[#D5DCE4] p-3">
          <dt className="text-[11px] font-bold tracking-wide text-[#56657A]">RATING</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold">{ratings.length ? ratings[ratings.length - 1] : "—"}</span>
            <Sparkline values={ratings} label={`Rating trend: ${ratings.join(", ")}`} />
          </dd>
        </div>
        <div className="rounded-[12px] border border-[#D5DCE4] p-3">
          <dt className="text-[11px] font-bold tracking-wide text-[#56657A]">ACCURACY / GAME</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold">{pct(report.overall_accuracy)}</span>
            <Sparkline values={acc} label={`Accuracy per game: ${acc.join(", ")} percent`} />
          </dd>
        </div>
        <div className="rounded-[12px] border border-[#D5DCE4] p-3">
          <dt className="text-[11px] font-bold tracking-wide text-[#56657A]">FLAGS / GAME</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-lg font-bold">{flags.length ? flags[flags.length - 1] : "—"}</span>
            <Bars values={flags} label={`Flags per game: ${flags.join(", ")}`} />
          </dd>
        </div>
      </dl>
      <table className="w-full text-sm">
        <caption className="sr-only">Per-game accuracy and mistakes</caption>
        <thead>
          <tr className="text-left text-[11px] tracking-wide text-[#56657A]">
            <th className="py-1 pr-2">GAME</th>
            <th className="py-1 pr-2">RESULT</th>
            <th className="py-1 pr-2">ACC</th>
            <th className="py-1 pr-2">B/M/I</th>
          </tr>
        </thead>
        <tbody>
          {report.points.slice(-8).map((p) => (
            <tr key={p.game_id} className="border-t border-[#D5DCE4]">
              <td className="py-1.5 pr-2">
                <Link href={`/games/${p.game_id}`} className="font-semibold underline underline-offset-2">
                  vs {p.opponent ?? "?"}
                </Link>
              </td>
              <td className="py-1.5 pr-2 font-mono">{p.user_result ?? "—"}</td>
              <td className="py-1.5 pr-2 font-mono">{pct(p.accuracy)}</td>
              <td className="py-1.5 pr-2 font-mono">{p.blunders}/{p.mistakes}/{p.inaccuracies}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(report.training_accuracy != null || report.training_completion_rate != null) && (
        <p className="text-sm text-[#56657A]">
          Training: {report.training.reduce((s, t) => s + t.attempts, 0)} attempts ·{" "}
          accuracy {pct(report.training_accuracy)} · completion {pct(report.training_completion_rate)}.{" "}
          <Link href="/training" className="font-semibold text-[#13233A] underline underline-offset-2">Keep training →</Link>
        </p>
      )}
    </div>
  );
}