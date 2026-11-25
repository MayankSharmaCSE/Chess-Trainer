"use client";

import { useProfileData } from "./ProfileProvider";
import { ProgressTrack } from "./Charts";
import { Icon } from "./icons";
import { Panel } from "./ui";
import {
  achievementProgress,
  buildAchievements,
  endgameCompletedCount,
  isAchievementUnlocked,
  pct,
  type AchievementTier,
} from "@/lib/profile";

const TIERS: Record<AchievementTier, { label: string; chip: string; tile: string; bar: string }> = {
  bronze: {
    label: "Bronze",
    chip: "border-amber-700/40 bg-amber-800/15 text-amber-400",
    tile: "border-amber-700/40 bg-amber-800/15 text-amber-300",
    bar: "bg-amber-400",
  },
  silver: {
    label: "Silver",
    chip: "border-slate-500/40 bg-slate-600/20 text-slate-300",
    tile: "border-slate-500/40 bg-slate-600/20 text-slate-200",
    bar: "bg-slate-300",
  },
  gold: {
    label: "Gold",
    chip: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    tile: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    bar: "bg-amber-300",
  },
  platinum: {
    label: "Platinum",
    chip: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    tile: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    bar: "bg-sky-300",
  },
};

export default function AwardsTab() {
  const { games, progress, training, taxonomy } = useProfileData();
  const achievements = buildAchievements({
    games,
    progress,
    training,
    endgameCompleted: endgameCompletedCount(taxonomy),
  });
  const unlocked = achievements.filter(isAchievementUnlocked);
  const completion = pct(unlocked.length, achievements.length);

  return (
    <div className="space-y-4">
      <Panel
        title="Achievements"
        subtitle="Earned from your real activity — synced games, Stockfish reviews, training drills and endgame study."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-3xl font-extrabold leading-none text-white">
              {unlocked.length}
              <span className="text-lg text-slate-500"> / {achievements.length}</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500">awards unlocked</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
              <span>Collection progress</span>
              <span className="font-mono">{Math.round(completion)}%</span>
            </div>
            <ProgressTrack value={completion} className="mt-1.5" />
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {achievements.map((achievement) => {
          const unlockedNow = isAchievementUnlocked(achievement);
          const progressValue = achievementProgress(achievement);
          const tier = TIERS[achievement.tier];
          return (
            <article
              key={achievement.id}
              className={`relative flex flex-col overflow-hidden rounded-2xl border p-4 transition ${
                unlockedNow
                  ? "border-slate-700 bg-[#111A2E] hover:border-slate-600"
                  : "border-slate-800/80 bg-[#0E1524]"
              }`}
            >
              {unlockedNow && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-3 -top-5 select-none font-chesspieces text-[84px] leading-none text-slate-800/20"
                >
                  {achievement.glyph}
                </span>
              )}
              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={`grid h-12 w-12 place-items-center rounded-xl border font-chesspieces text-2xl ${tier.tile} ${
                    unlockedNow ? "" : "opacity-40 grayscale"
                  }`}
                  aria-hidden="true"
                >
                  {achievement.glyph}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${tier.chip}`}>
                  {tier.label}
                </span>
              </div>

              <h3 className={`relative mt-3 font-display text-sm font-bold ${unlockedNow ? "text-white" : "text-slate-400"}`}>
                {achievement.title}
              </h3>
              <p className="relative mt-1 flex-1 text-[11px] leading-relaxed text-slate-500">{achievement.description}</p>

              <div className="relative mt-3">
                <div className="flex items-center justify-between text-[10px]">
                  <span className={`inline-flex items-center gap-1 font-semibold ${unlockedNow ? "text-emerald-300" : "text-slate-500"}`}>
                    <Icon name={unlockedNow ? "check" : "lock"} size={10} />
                    {unlockedNow ? "Unlocked" : "Locked"}
                  </span>
                  <span className="font-mono text-slate-500">
                    {Math.min(achievement.current, achievement.target)} / {achievement.target}
                    {achievement.unit === "%" ? "%" : ""}
                  </span>
                </div>
                <ProgressTrack
                  value={progressValue}
                  className="mt-1.5"
                  tone={unlockedNow ? tier.bar : "bg-slate-600"}
                />
              </div>
            </article>
          );
        })}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Award progress is computed live from the data on this page. Social awards arrive with the friends and clubs
        backend.
      </p>
    </div>
  );
}
