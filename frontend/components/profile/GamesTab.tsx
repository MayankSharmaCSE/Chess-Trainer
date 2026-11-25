"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, type GameDetail } from "@/lib/bff";
import { useProfileData } from "./ProfileProvider";
import { GameListRow } from "./GameBits";
import { EmptyState, Panel } from "./ui";
import { Icon } from "./icons";
import {
  accuracyByGame,
  classifyTimeControl,
  finalPosition,
  SPEEDS,
  type GamePreview,
  type Speed,
} from "@/lib/profile";

type ResultFilter = "all" | "win" | "loss" | "draw";
type SpeedFilter = "all" | Speed;

const PAGE_SIZE = 12;

const RESULT_OPTIONS: { id: ResultFilter; label: string; active: string }[] = [
  { id: "all", label: "All", active: "border-slate-600 bg-slate-700/60 text-white" },
  { id: "win", label: "Wins", active: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  { id: "loss", label: "Losses", active: "border-rose-500/40 bg-rose-500/15 text-rose-300" },
  { id: "draw", label: "Draws", active: "border-slate-500/50 bg-slate-600/40 text-slate-200" },
];

export default function GamesTab() {
  const { games, totalGames, progress } = useProfileData();
  const [result, setResult] = useState<ResultFilter>("all");
  const [speed, setSpeed] = useState<SpeedFilter>("all");
  const [page, setPage] = useState(1);
  const [previews, setPreviews] = useState<Record<number, GamePreview | null>>({});
  const requested = useRef<Set<number>>(new Set());

  const accuracies = useMemo(() => accuracyByGame(progress), [progress]);

  const speedBase = useMemo(
    () => games.filter((game) => speed === "all" || classifyTimeControl(game.time_control) === speed),
    [games, speed]
  );
  const filtered = useMemo(
    () => speedBase.filter((game) => result === "all" || game.user_result === result),
    [speedBase, result]
  );
  const visible = filtered.slice(0, page * PAGE_SIZE);

  const resultCount = (id: ResultFilter) =>
    id === "all" ? speedBase.length : speedBase.filter((game) => game.user_result === id).length;

  const speedCount = (id: SpeedFilter) =>
    id === "all"
      ? games.filter((game) => result === "all" || game.user_result === result).length
      : games.filter(
          (game) => classifyTimeControl(game.time_control) === id && (result === "all" || game.user_result === result)
        ).length;

  const visibleKey = visible.map((game) => game.id).join(",");

  useEffect(() => {
    const ids = visibleKey ? visibleKey.split(",").map(Number) : [];
    const queue = games.filter((game) => ids.includes(game.id) && !requested.current.has(game.id));
    if (queue.length === 0) return;
    queue.forEach((game) => requested.current.add(game.id));

    void Promise.all(
      queue.map(async (game) => {
        try {
          const detail = await api<GameDetail>(`games/${game.id}`);
          return [game.id, finalPosition(detail.pgn)] as const;
        } catch {
          return [game.id, null] as const;
        }
      })
    ).then((rows) => {
      setPreviews((previous) => {
        const next = { ...previous };
        rows.forEach(([id, preview]) => {
          next[id] = preview;
        });
        return next;
      });
    });
  }, [visibleKey, games]);

  function applyResult(next: ResultFilter) {
    setResult(next);
    setPage(1);
  }

  function applySpeed(next: SpeedFilter) {
    setSpeed(next);
    setPage(1);
  }

  if (games.length === 0) {
    return (
      <Panel title="Game history">
        <EmptyState
          icon="book"
          title="No games to review yet"
          body="Sync your Chess.com or Lichess account and every game will appear here with a board preview and accuracy."
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
      <Panel
        title="Game history"
        subtitle="Click a game to open the full Stockfish review."
        action={
          <span className="font-mono text-[10px] text-slate-500">
            {filtered.length} of {totalGames} games
          </span>
        }
        padded={false}
      >
        <div className="space-y-2.5 border-b border-slate-800/80 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by result">
            {RESULT_OPTIONS.map((option) => {
              const active = result === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applyResult(option.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                    active
                      ? option.active
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  {option.label}
                  <span className={`font-mono text-[10px] ${active ? "opacity-80" : "text-slate-600"}`}>{resultCount(option.id)}</span>
                </button>
              );
            })}
            <span className="mx-1 hidden h-4 w-px bg-slate-800 sm:block" aria-hidden="true" />
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <Icon name="filter" size={11} /> Time control
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by time control">
            {([{ id: "all", label: "All" }, ...SPEEDS] as { id: SpeedFilter; label: string }[]).map((option) => {
              const active = speed === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => applySpeed(option.id)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  {option.label}
                  <span className={`font-mono text-[10px] ${active ? "opacity-80" : "text-slate-600"}`}>{speedCount(option.id)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="filter"
            title="No games match these filters"
            body="Try a different result or time control."
            action={
              <button
                type="button"
                onClick={() => {
                  applyResult("all");
                  applySpeed("all");
                }}
                className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
              >
                Reset filters
              </button>
            }
          />
        ) : (
          <ul>
            {visible.map((game) => (
              <li key={game.id}>
                <GameListRow game={game} preview={previews[game.id]} accuracy={accuracies.get(game.id) ?? null} />
              </li>
            ))}
          </ul>
        )}

        {filtered.length > visible.length && (
          <div className="border-t border-slate-800/70 p-3 text-center">
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
            >
              Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
              <Icon name="chevronDown" size={13} />
            </button>
          </div>
        )}
      </Panel>

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Accuracy is only shown for games Stockfish has analyzed. Opening the review lets you analyze the game and add
        its mistakes to your weakness map.
      </p>
    </div>
  );
}
