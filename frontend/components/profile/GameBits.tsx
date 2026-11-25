import Link from "next/link";
import Board from "@/components/landing/Board";
import type { GameSummary } from "@/lib/bff";
import { platformLabel } from "@/lib/bff";
import { formatDate, formatTimeControl, opponentRating, type GamePreview } from "@/lib/profile";
import { Icon } from "./icons";
import { ResultChip, Skeleton } from "./ui";

export function PreviewBoard({ preview, label, size = "md" }: { preview: GamePreview | null | undefined; label: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-[52px] w-[52px] sm:h-[58px] sm:w-[58px]" : "h-[62px] w-[62px] sm:h-[76px] sm:w-[76px]";
  if (!preview) {
    return <Skeleton className={`${box} flex-none rounded-md`} />;
  }
  return (
    <div className={`${box} flex-none overflow-hidden rounded-md ring-1 ring-slate-700`}>
      <Board
        fen={preview.fen}
        lastMove={preview.lastMove}
        interactive={false}
        showCoordinates={false}
        pieceSize={size === "sm" ? "text-[8px] sm:text-[9px]" : "text-[10px] sm:text-[12px]"}
        label={label}
      />
    </div>
  );
}

function accuracyTone(accuracy: number): string {
  if (accuracy >= 80) return "text-emerald-300";
  if (accuracy >= 60) return "text-amber-300";
  return "text-rose-300";
}

function userColorLabel(color: string | null): string {
  return color === "white" ? "White" : color === "black" ? "Black" : "—";
}

/** Compact row used on the Overview tab. */
export function CompactGameRow({ game }: { game: GameSummary }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="flex items-center gap-3 border-t border-slate-800/70 px-4 py-2.5 transition first:border-t-0 hover:bg-slate-800/40 focus-visible:bg-slate-800/50 focus-visible:outline-none"
    >
      <ResultChip result={game.user_result} className="min-w-[2.75rem]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-100">
          vs {game.opponent ?? "Unknown opponent"}
          <span className="ml-1.5 font-mono text-[11px] font-normal text-slate-500">{opponentRating(game) ?? ""}</span>
        </p>
        <p className="truncate text-[10px] text-slate-500">
          {formatDate(game.played_at)} · {formatTimeControl(game.time_control)} · {userColorLabel(game.user_color)}
        </p>
      </div>
      <span className="hidden shrink-0 rounded border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 sm:inline">
        {platformLabel(game.platform)}
      </span>
      <Icon name="chevronRight" size={14} className="flex-none text-slate-600" />
    </Link>
  );
}

/** Full row used on the Games tab: board preview, meta, accuracy. */
export function GameListRow({
  game,
  preview,
  accuracy,
}: {
  game: GameSummary;
  preview: GamePreview | null | undefined;
  accuracy: number | null;
}) {
  const accuracyText = accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`;
  return (
    <Link
      href={`/games/${game.id}`}
      className="flex flex-wrap items-center gap-3 border-t border-slate-800/70 px-3 py-3 transition hover:bg-slate-800/40 focus-visible:bg-slate-800/50 focus-visible:outline-none sm:flex-nowrap sm:px-4"
    >
      <PreviewBoard preview={preview} label={`Final position vs ${game.opponent ?? "unknown opponent"}`} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ResultChip result={game.user_result} className="min-w-[2.75rem]" />
          <p className="min-w-0 truncate text-sm font-semibold text-slate-100">vs {game.opponent ?? "Unknown opponent"}</p>
          <span className="font-mono text-[11px] text-slate-500">{opponentRating(game) ?? "—"}</span>
          <span className="rounded border border-slate-800 bg-slate-900/60 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
            {platformLabel(game.platform)}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {formatDate(game.played_at)} · {formatTimeControl(game.time_control)} · {userColorLabel(game.user_color)}
          {game.rated === false ? " · Unrated" : ""}
        </p>
        {game.opening_name && <p className="mt-0.5 truncate text-[11px] text-slate-600">{game.opening_name}</p>}
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-4 sm:w-auto sm:justify-end">
        <div className="text-right">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Accuracy</p>
          <p className={`font-mono text-xs font-bold ${accuracy == null ? "text-slate-600" : accuracyTone(accuracy * 100)}`}>{accuracyText}</p>
        </div>
        <Icon name="chevronRight" size={15} className="text-slate-600" />
      </div>
    </Link>
  );
}
