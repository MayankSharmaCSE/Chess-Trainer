"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, resultLabel, type WeaknessReport, type AnalyzedGame, ApiError } from "@/lib/bff";

const COLS = ["blunder", "mistake", "inaccuracy"] as const;
type Col = (typeof COLS)[number];

const COL_LABEL: Record<Col, string> = {
  blunder: "BLUNDER",
  mistake: "MISTAKE",
  inaccuracy: "INACCURACY",
};

function cellStyle(value: number, max: number): string {
  if (value <= 0) return "bg-[#F2F4F6] text-[#8593A6]";
  const t = max > 0 ? value / max : 0;
  if (t >= 0.66) return "bg-[#FBE4E2] text-[#9E2A21]";
  if (t >= 0.33) return "bg-[#FCEBD9] text-[#8A4A0E]";
  return "bg-[#F6F0D2] text-[#6B5A0A]";
}

function HeatmapGrid({ report }: { report: WeaknessReport }) {
  const max = Math.max(1, ...report.phases.flatMap((p) => [p.blunder, p.mistake, p.inaccuracy]));
  return (
    <div>
      <div className="grid grid-cols-[minmax(7rem,1fr)_repeat(3,minmax(0,1fr))] gap-1.5" role="img"
        aria-label={`Weakness heatmap over ${report.games_analyzed} analyzed games: ${report.phases.map((p) => `${p.phase} ${p.total} flags`).join(", ")}.`}>
        <span className="sr-only">Phase by mistake type</span>
        <span aria-hidden="true" />
        {COLS.map((c) => (
          <span key={c} aria-hidden="true" className="px-2 py-1 text-center text-[11px] font-bold tracking-wide text-[#56657A]">
            {COL_LABEL[c]}
          </span>
        ))}
        {report.phases.map((p) => (
          <Fragment key={p.phase}>
            <span className="flex items-center px-2 py-2 text-sm font-semibold">{p.phase}</span>
            {COLS.map((c) => (
              <span key={c} aria-hidden="true"
                className={`rounded-[8px] px-2 py-2 text-center font-mono text-sm font-bold ${cellStyle(p[c], max)}`}>
                {p[c]}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
      <table className="sr-only">
        <caption>Mistake counts by game phase</caption>
        <tbody>
          {report.phases.map((p) => (
            <tr key={p.phase}>
              <th scope="row">{p.phase}</th>
              <td>Blunders {p.blunder}</td>
              <td>Mistakes {p.mistake}</td>
              <td>Inaccuracies {p.inaccuracy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LAST_N_OPTIONS = [5, 10, 20] as const;

function WeaknessControls({
  analyzedGames,
  totalSynced,
  lastN,
  onLastN,
  selected,
  onSelected,
}: {
  analyzedGames: AnalyzedGame[];
  totalSynced: number | null;
  lastN: number | null;
  onLastN: (n: number | null) => void;
  selected: number[];
  onSelected: (ids: number[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const manualActive = selected.length > 0;
  const analyzedCount = analyzedGames.length;

  const toggleGame = (id: number) =>
    onSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="grid gap-3 rounded-[12px] border border-[#D5DCE4] bg-[#F7F9FB] p-4">
      {(totalSynced === null || analyzedCount < totalSynced || analyzedCount < 2) && (
        <p className="text-xs text-[#56657A]">
          {totalSynced !== null && analyzedCount < totalSynced ? (
            <>
              <span className="font-semibold text-[#13233A]">{analyzedCount}</span> of {totalSynced}{" "}
              synced games are analyzed — the map and its filters draw from analyzed games only.{" "}
            </>
          ) : (
            <>The map and its filters draw from analyzed games only. </>
          )}
          {analyzedCount < 2 ? (
            <>Analyze at least 2 games to compare a selection.</>
          ) : (
            <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">
              Analyze more in the game library.
            </Link>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#56657A]">
          Last games
          <select
            value={manualActive ? "" : lastN ?? ""}
            disabled={manualActive}
            onChange={(e) => onLastN(e.target.value ? Number(e.target.value) : null)}
            className="rounded-[8px] border border-[#D5DCE4] bg-white px-2.5 py-1.5 text-sm font-medium text-[#13233A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">All</option>
            {LAST_N_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="rounded-[8px] border border-[#D5DCE4] bg-white px-3 py-1.5 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
        >
          {pickerOpen ? "Hide games" : "Choose specific games"}
        </button>
        {manualActive && (
          <button
            type="button"
            onClick={() => {
              onSelected([]);
              setPickerOpen(false);
            }}
            className="text-sm font-semibold text-[#56657A] underline underline-offset-2 hover:text-[#13233A]"
          >
            Clear selection ({selected.length})
          </button>
        )}
      </div>

      {manualActive && (
        <p className="text-xs text-[#56657A]">
          Manual selection overrides the “Last games” filter.
        </p>
      )}

      {pickerOpen && (
        <ul className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
          {analyzedGames.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-[8px] border border-[#D5DCE4] bg-white px-3 py-2 text-sm hover:border-[#13233A]">
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  onChange={() => toggleGame(g.id)}
                  className="h-4 w-4 accent-[#13233A]"
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">vs {g.opponent ?? "Unknown opponent"}</span>
                  <span className="text-[#56657A]">
                    {" · "}
                    {g.played_at ? new Date(g.played_at).toLocaleDateString() : "Unknown date"}
                    {g.opening_name ? ` · ${g.opening_name}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-[#56657A]">
                  {resultLabel(g.user_result)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WeaknessHeatmap({ compact = false }: { compact?: boolean }) {
  const [report, setReport] = useState<WeaknessReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastN, setLastN] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [analyzedGames, setAnalyzedGames] = useState<AnalyzedGame[]>([]);
  const [totalSynced, setTotalSynced] = useState<number | null>(null);

  // Manual selection wins over "last N"; matches the backend precedence.
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (selected.length > 0) p.set("game_ids", selected.join(","));
    else if (lastN) p.set("last", String(lastN));
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [selected, lastN]);

  // The picker only exists on the full weakness page, not the compact widget.
  useEffect(() => {
    if (compact) return;
    let active = true;
    api<AnalyzedGame[]>("weaknesses/games")
      .then((g) => { if (active) setAnalyzedGames(g); })
      .catch(() => { if (active) setAnalyzedGames([]); });
    api<{ total: number }>("games?limit=1")
      .then((d) => { if (active) setTotalSynced(d.total); })
      .catch(() => { /* the hint is optional */ });
    return () => { active = false; };
  }, [compact]);

  useEffect(() => {
    let active = true;
    api<WeaknessReport>(`weaknesses${query}`)
      .then((r) => {
        if (!active) return;
        setReport(r);
        setState("ready");
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof ApiError ? e.message : "Failed to load weaknesses.");
        setState("error");
      });
    return () => { active = false; };
  }, [query]);

  // Scope changes are user events: flip to loading here (not inside an effect)
  // so the refetch shows progress without a synchronous setState-in-effect.
  const handleLastN = (n: number | null) => {
    setState("loading");
    setLastN(n);
  };
  const handleSelected = (ids: number[]) => {
    setState("loading");
    setSelected(ids);
  };

  const controls =
    !compact && analyzedGames.length > 0 ? (
      <WeaknessControls
        analyzedGames={analyzedGames}
        totalSynced={totalSynced}
        lastN={lastN}
        onLastN={handleLastN}
        selected={selected}
        onSelected={handleSelected}
      />
    ) : null;

  if (state === "error") {
    return (
      <div className="grid gap-5">
        {controls}
        <p role="alert" className="text-sm font-medium text-[#9E2A21]">
          {error}{" "}
          <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="grid gap-5">
        {controls}
        <p className="text-[#56657A]" aria-live="polite">Detecting recurring weaknesses...</p>
      </div>
    );
  }

  if (!report || report.games_analyzed === 0) {
    return (
      <div>
        <p className="font-semibold">No analyzed games yet</p>
        <p className="mt-1 text-sm text-[#56657A]">
          <Link href="/connect" className="font-semibold text-[#13233A] underline underline-offset-2">Connect an account</Link>{" "}
          and sync games, then run Stockfish analysis from the{" "}
          <Link href="/games" className="font-semibold text-[#13233A] underline underline-offset-2">game library</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {controls}
      <p className="text-sm text-[#56657A]" aria-live="polite">
        {report.games_analyzed} game{report.games_analyzed === 1 ? "" : "s"} analyzed ·{" "}
        {report.user_moves_analyzed} of your moves checked · {report.blunders} blunders,{" "}
        {report.mistakes} mistakes, {report.inaccuracies} inaccuracies.
        {report.insufficient_data && (
          <> Not enough data to identify recurring weaknesses yet — analyze at least 3 games.</>
        )}
      </p>

      <HeatmapGrid report={report} />

      {report.top_openings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold tracking-wide text-[#56657A]">TOP OPENINGS BY MISTAKES</h3>
          <ul className="mt-2 grid gap-2">
            {report.top_openings.slice(0, compact ? 3 : 5).map((o) => (
              <li key={o.opening} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[10px] border border-[#D5DCE4] px-3.5 py-2.5">
                <span className="min-w-0 truncate font-semibold">{o.opening}</span>
                <span className="font-mono text-sm text-[#56657A]">
                  {o.flags} flag{o.flags === 1 ? "" : "s"} · {o.games} game{o.games === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && report.sample_games.length > 0 && (
        <div>
          <h3 className="text-sm font-bold tracking-wide text-[#56657A]">EVIDENCE GAMES</h3>
          <ul className="mt-2 grid gap-2">
            {report.sample_games.map((g) => (
              <li key={g.id}>
                <Link href={`/games/${g.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#D5DCE4] px-3.5 py-2.5 hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]">
                  <span className="min-w-0">
                    <span className="font-semibold">vs {g.opponent ?? "Unknown opponent"}</span>{" "}
                    <span className="text-sm text-[#56657A]">
                      · {g.played_at ? new Date(g.played_at).toLocaleDateString() : "Unknown date"} · {resultLabel(g.user_result)}
                    </span>
                  </span>
                  <span className="rounded-full bg-[#FBE4E2] px-2.5 py-1 font-mono text-[11px] font-bold text-[#9E2A21] ring-1 ring-[#C8372D]/40">
                    {g.flags} FLAG{g.flags === 1 ? "" : "S"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {compact && (
        <p>
          <Link href="/weaknesses" className="text-sm font-semibold text-[#13233A] underline underline-offset-2">
            Open full weakness map →
          </Link>
        </p>
      )}
    </div>
  );
}

