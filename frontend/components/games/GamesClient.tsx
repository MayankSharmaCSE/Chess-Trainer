"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, platformLabel, resultLabel, type GameSummary, ApiError } from "@/lib/bff";

const RESULT_STYLE: Record<string, string> = {
  win: "bg-[#E3F2E9] text-[#1F7A4D] ring-[#1F7A4D]/40",
  loss: "bg-[#FBE4E2] text-[#9E2A21] ring-[#C8372D]/40",
  draw: "bg-[#EEF1F4] text-[#56657A] ring-[#8593A6]/40",
};

export default function GamesClient() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ games: GameSummary[]; total: number }>("games?limit=50")
      .then((d) => {
        setGames(d.games);
        setTotal(d.total);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load games.");
        setState("error");
      });
  }, []);

  if (state === "loading") {
    return <p className="text-[#56657A]" aria-live="polite">Loading your games...</p>;
  }

  if (state === "error") {
    return (
      <p role="alert" className="text-sm font-medium text-[#9E2A21]">
        {error}{" "}
        <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  }

  if (games.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
        <p className="font-semibold">No games found</p>
        <p className="mt-1 text-sm text-[#56657A]">
          <Link href="/connect" className="font-semibold text-[#13233A] underline underline-offset-2">
            Connect an account
          </Link>{" "}
          and sync your games first.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-[#56657A]">
        Showing {games.length} of {total} synchronized games.
      </p>
      <ul className="grid gap-3">
        {games.map((g) => (
          <li key={g.id}>
            <Link
              href={`/games/${g.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#D5DCE4] bg-white p-4 hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  vs {g.opponent ?? "Unknown opponent"}
                  <span className="ml-2 font-normal text-[#56657A]">
                    ({g.user_color === "white" ? "White" : g.user_color === "black" ? "Black" : "?"})
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[#56657A]">
                  {g.played_at ? new Date(g.played_at).toLocaleDateString() : "Unknown date"}
                  {" · "}{platformLabel(g.platform)}
                  {g.time_control ? ` · ${g.time_control}` : ""}
                  {g.opening_name ? ` · ${g.opening_name}` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ring-1 ${RESULT_STYLE[g.user_result ?? ""] ?? RESULT_STYLE.draw}`}
              >
                {resultLabel(g.user_result)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
