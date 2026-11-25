"use client";

import Link from "next/link";
import { useProfileData } from "./ProfileProvider";
import RatingCard from "./RatingCard";
import RatingPanel from "./RatingPanel";
import { ProgressTrack } from "./Charts";
import { CompactGameRow } from "./GameBits";
import { Icon } from "./icons";
import { Avatar, DemoBadge, EmptyState, OnlineDot, Panel, TONE_TILE } from "./ui";
import { DEMO_CLUBS, DEMO_FRIENDS } from "@/lib/profile-mock";
import {
  achievementProgress,
  buildAchievements,
  classifyTimeControl,
  endgameCompletedCount,
  gameRecord,
  isAchievementUnlocked,
  pct,
  ratingPoints,
  ratingStats,
  shortNumber,
  type Achievement,
} from "@/lib/profile";

function AchievementMiniRow({ achievement }: { achievement: Achievement }) {
  const value = achievementProgress(achievement);
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`grid h-8 w-8 flex-none place-items-center rounded-lg border font-chesspieces text-base ${
          isAchievementUnlocked(achievement)
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-slate-700 bg-slate-900/60 text-slate-500"
        }`}
        aria-hidden="true"
      >
        {achievement.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-semibold text-slate-200">{achievement.title}</span>
          <span className="font-mono text-[10px] text-slate-500">
            {Math.min(achievement.current, achievement.target)}/{achievement.target}
            {achievement.unit === "%" ? "%" : ""}
          </span>
        </span>
        <ProgressTrack
          value={value}
          className="mt-1"
          tone={isAchievementUnlocked(achievement) ? "bg-emerald-400" : "bg-slate-500"}
        />
      </span>
    </li>
  );
}

export default function OverviewTab() {
  const { games, totalGames, progress, training, taxonomy } = useProfileData();
  const stats = ratingStats(games);
  const mainStats = stats.filter((stat) => stat.speed !== "daily");
  const daily = games.filter((game) => classifyTimeControl(game.time_control) === "daily");
  const dailyStat = stats.find((stat) => stat.speed === "daily");
  const record = gameRecord(games);
  const achievements = buildAchievements({
    games,
    progress,
    training,
    endgameCompleted: endgameCompletedCount(taxonomy),
  });
  const unlocked = achievements.filter(isAchievementUnlocked);
  const closest = [...achievements]
    .sort((a, b) => achievementProgress(b) - achievementProgress(a))
    .slice(0, 3);
  const onlineFriends = DEMO_FRIENDS.filter((friend) => friend.online).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="ratings-heading">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="ratings-heading" className="font-display text-sm font-bold text-white">
              Ratings
            </h2>
            <span className="text-[11px] text-slate-500">
              {record.wins}W · {record.losses}L · {record.draws}D from {games.length} synced games
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {mainStats.map((stat) => (
              <RatingCard key={stat.speed} stat={stat} points={ratingPoints(games, stat.speed)} />
            ))}
          </div>
        </section>

        <Panel title="Rating progress" subtitle="Every rated game you have synced, by time control.">
          <RatingPanel games={games} />
        </Panel>

        <Panel
          title="Recent games"
          subtitle={totalGames > games.length ? `Showing your latest ${games.length} of ${totalGames} games` : undefined}
          action={
            <Link
              href="/profile/games"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-slate-700"
            >
              All games <Icon name="arrowRight" size={12} />
            </Link>
          }
          padded={false}
        >
          {games.length === 0 ? (
            <EmptyState
              icon="book"
              title="No games synced yet"
              body="Connect Chess.com or Lichess, then sync your games to see them here."
              action={
                <Link href="/connect" className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400">
                  Connect an account
                </Link>
              }
            />
          ) : (
            <ul>
              {games.slice(0, 6).map((game) => (
                <li key={game.id}>
                  <CompactGameRow game={game} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel
          title="Daily games"
          subtitle={daily.length > 0 ? `${daily.length} correspondence game${daily.length === 1 ? "" : "s"}` : "Correspondence chess"}
          action={
            dailyStat?.current != null ? (
              <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-1 font-mono text-xs font-bold text-teal-300">
                {dailyStat.current}
              </span>
            ) : undefined
          }
          padded={daily.length === 0}
          bodyClassName={daily.length > 0 ? "" : undefined}
        >
          {daily.length === 0 ? (
            <EmptyState
              icon="globe"
              title="No daily games"
              body="Daily (correspondence) games from Chess.com show up here after a sync. In the meantime, warm up in the bot arena."
              action={
                <Link href="/bots" className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700">
                  Play a bot
                </Link>
              }
            />
          ) : (
            <ul>
              {daily.slice(0, 3).map((game) => (
                <li key={game.id}>
                  <CompactGameRow game={game} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              Friends <DemoBadge />
            </span>
          }
          subtitle={`${onlineFriends} of ${DEMO_FRIENDS.length} online`}
          action={
            <Link href="/profile/friends" className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200">
              See all
            </Link>
          }
          padded={false}
        >
          <ul className="divide-y divide-slate-800/70">
            {DEMO_FRIENDS.slice(0, 4).map((friend) => (
              <li key={friend.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={friend.username} size="sm" online={friend.online} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-slate-200">{friend.username}</span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <OnlineDot online={friend.online} />
                    {friend.online ? "Online" : `Last seen ${friend.lastSeen}`}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">{friend.rating}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              Clubs <DemoBadge />
            </span>
          }
          action={
            <Link href="/profile/clubs" className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200">
              See all
            </Link>
          }
          padded={false}
        >
          <ul className="divide-y divide-slate-800/70">
            {DEMO_CLUBS.slice(0, 2).map((club) => (
              <li key={club.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg border font-display text-[11px] font-extrabold ${TONE_TILE[club.tone]}`}>
                  {club.monogram}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-slate-200">{club.name}</span>
                  <span className="block text-[10px] text-slate-500">
                    {shortNumber(club.members)} members · {club.role}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Achievements"
          subtitle={`${unlocked.length} of ${achievements.length} unlocked`}
          action={
            <Link href="/profile/awards" className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200">
              All awards
            </Link>
          }
        >
          <ProgressTrack value={pct(unlocked.length, achievements.length)} />
          <ul className="mt-3 space-y-3">
            {closest.map((achievement) => (
              <AchievementMiniRow key={achievement.id} achievement={achievement} />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
