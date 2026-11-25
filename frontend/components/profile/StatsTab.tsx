"use client";

import Link from "next/link";
import { useProfileData } from "./ProfileProvider";
import { Donut, PhaseBars, ProgressTrack } from "./Charts";
import RatingPanel from "./RatingPanel";
import { EmptyState, Panel } from "./ui";
import {
  accuracyPct,
  analysisCoverage,
  gameRecord,
  openingPerformance,
  pct,
} from "@/lib/profile";

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-extrabold leading-none ${tone}`}>{value}</p>
      <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{detail}</p>
    </div>
  );
}

export default function StatsTab() {
  const { games, totalGames, progress, training } = useProfileData();
  const record = gameRecord(games);
  const winRate = Math.round(pct(record.wins, record.total));
  const lossRate = Math.round(pct(record.losses, record.total));
  const drawRate = Math.round(pct(record.draws, record.total));
  const accuracy = accuracyPct(progress);
  const blunders = progress?.avg_blunders_per_game;
  const analyzed = progress?.games_analyzed ?? 0;
  const coverage = analysisCoverage(progress, totalGames);
  const openings = openingPerformance(games, 6);
  const phases = progress?.phases ?? [];

  if (games.length === 0) {
    return (
      <Panel title="Statistics">
        <EmptyState
          icon="chart"
          title="Your stats start with a sync"
          body="Once your games are synced and analyzed, win rates, accuracy, mistakes by phase and opening performance all show up here."
          action={
            <Link href="/connect" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
              Connect an account
            </Link>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="Key statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Win rate" value={`${winRate}%`} detail={`${record.wins} of ${record.total} games`} tone="text-emerald-300" />
        <StatCard label="Loss rate" value={`${lossRate}%`} detail={`${record.losses} of ${record.total} games`} tone="text-rose-300" />
        <StatCard label="Draw rate" value={`${drawRate}%`} detail={`${record.draws} of ${record.total} games`} tone="text-slate-300" />
        <StatCard
          label="Avg accuracy"
          value={accuracy != null ? `${accuracy}%` : "—"}
          detail={analyzed > 0 ? `across ${analyzed} analyzed games` : "analyze a game to measure"}
          tone="text-sky-300"
        />
        <StatCard label="Total games" value={totalGames.toLocaleString("en-US")} detail={`${games.length} loaded for stats`} tone="text-violet-300" />
        <StatCard
          label="Blunders / game"
          value={blunders != null && !progress?.insufficient_data ? blunders.toFixed(1) : "—"}
          detail={progress?.insufficient_data ? "needs more analyzed games" : "Stockfish flags per game"}
          tone="text-amber-300"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Results" subtitle={`${record.total} synced games`}>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-around">
            <Donut
              segments={[
                { label: "Wins", value: record.wins, color: "#34d399" },
                { label: "Losses", value: record.losses, color: "#fb7185" },
                { label: "Draws", value: record.draws, color: "#94a3b8" },
              ]}
              centerValue={`${winRate}%`}
              centerLabel="Win rate"
            />
            <dl className="w-full max-w-[220px] space-y-2 text-xs">
              {[
                { label: "Wins", value: record.wins, share: winRate, color: "bg-emerald-400", text: "text-emerald-300" },
                { label: "Losses", value: record.losses, share: lossRate, color: "bg-rose-400", text: "text-rose-300" },
                { label: "Draws", value: record.draws, share: drawRate, color: "bg-slate-400", text: "text-slate-300" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-2 text-slate-400">
                    <span className={`h-2 w-2 rounded-sm ${row.color}`} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-slate-200">{row.value}</span>
                    <span className={`w-9 text-right font-mono text-[10px] ${row.text}`}>{row.share}%</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>

        <Panel title="Mistakes by game phase" subtitle="Ply 1–20 opening · 21–60 middlegame · 61+ endgame">
          {analyzed === 0 || phases.length === 0 ? (
            <EmptyState
              icon="target"
              title="No analyzed mistakes yet"
              body="Analyze a game to see where your blunders, mistakes and inaccuracies cluster."
              action={
                <Link href="/profile/games" className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
                  Pick a game
                </Link>
              }
            />
          ) : (
            <PhaseBars phases={phases} />
          )}
        </Panel>
      </div>

      <Panel title="Rating progress" subtitle="Stockfish analysis and ratings from your synced accounts.">
        <RatingPanel games={games} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Opening performance"
          subtitle={`Top ${openings.length} openings across your latest ${games.length} games`}
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-[9px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 font-bold">Opening</th>
                  <th className="px-2 py-2 text-right font-bold">Games</th>
                  <th className="px-2 py-2 text-right font-bold">W/D/L</th>
                  <th className="px-4 py-2 font-bold">Score</th>
                </tr>
              </thead>
              <tbody>
                {openings.map((opening) => (
                  <tr key={opening.name} className="border-b border-slate-800/60 last:border-b-0">
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="block truncate font-semibold text-slate-200">{opening.name}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-slate-400">{opening.games}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-[10px]">
                      <span className="text-emerald-400">{opening.wins}</span>
                      <span className="text-slate-700">/</span>
                      <span className="text-slate-300">{opening.draws}</span>
                      <span className="text-slate-700">/</span>
                      <span className="text-rose-400">{opening.losses}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ProgressTrack
                          value={opening.score}
                          className="w-16"
                          tone={opening.score >= 55 ? "bg-emerald-400" : opening.score >= 45 ? "bg-slate-400" : "bg-rose-400"}
                        />
                        <span className="w-9 font-mono text-[10px] text-slate-400">{Math.round(opening.score)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-800/70 px-4 py-2 text-[10px] text-slate-600">
            Score counts a draw as half a point. Unclassified games are grouped together.
          </p>
        </Panel>

        <Panel title="Analysis & training" subtitle="How much of your play is covered.">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Games analyzed</span>
              <span className="font-mono text-slate-300">
                {analyzed} / {totalGames}
              </span>
            </div>
            <ProgressTrack value={coverage} className="mt-1.5" tone="bg-sky-400" />
            <p className="mt-1 text-[10px] text-slate-600">{Math.round(coverage)}% of your synced games have a Stockfish review.</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
              <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Drills solved</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold text-emerald-300">{training?.solved ?? 0}</dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
              <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Attempts</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold text-slate-200">{training?.attempts ?? 0}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/games" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-emerald-400">
              Analyze games
            </Link>
            <Link href="/training" className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-slate-700">
              Train mistakes
            </Link>
          </div>

          {progress?.insufficient_data && (
            <p className="mt-3 text-[10px] leading-relaxed text-amber-300/80">
              Trends need at least three analyzed games. Keep analyzing to make these numbers meaningful.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
