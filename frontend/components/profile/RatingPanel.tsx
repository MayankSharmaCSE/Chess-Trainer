"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GameSummary } from "@/lib/bff";
import { RatingChart } from "./Charts";
import { EmptyState } from "./ui";
import {
  headlineRating,
  ratingPoints,
  ratingStats,
  SPEEDS,
  speedLabel,
  type Speed,
} from "@/lib/profile";

export default function RatingPanel({
  games,
  defaultSpeed,
  compact = false,
}: {
  games: GameSummary[];
  defaultSpeed?: Speed;
  compact?: boolean;
}) {
  const stats = useMemo(() => ratingStats(games), [games]);
  const rated = useMemo(() => stats.filter((stat) => stat.current != null), [stats]);

  const initial = useMemo<Speed>(() => {
    const preferred = defaultSpeed ?? headlineRating(games).speed;
    if (rated.some((stat) => stat.speed === preferred)) return preferred;
    const mostPlayed = [...rated].sort((a, b) => b.games - a.games)[0];
    return mostPlayed?.speed ?? preferred;
  }, [defaultSpeed, games, rated]);

  const [speed, setSpeed] = useState<Speed>(initial);
  const points = useMemo(() => ratingPoints(games, speed), [games, speed]);
  const stat = stats.find((entry) => entry.speed === speed);

  if (games.length === 0) {
    return (
      <EmptyState
        icon="chart"
        title="No synced games yet"
        body="Connect Chess.com or Lichess and sync a few games to draw your rating graph."
        action={
          <Link href="/connect" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
            Connect an account
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{speedLabel(speed)} trend</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-white">{stat?.current ?? "—"}</span>
            <span className="text-[10px] text-slate-500">peak {stat?.peak ?? "—"}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time control">
          {SPEEDS.filter((entry) => rated.some((item) => item.speed === entry.id)).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSpeed(entry.id)}
              aria-pressed={speed === entry.id}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                speed === entry.id
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className={compact ? "mt-3" : "mt-4"}>
        <RatingChart points={points} />
      </div>
    </div>
  );
}
