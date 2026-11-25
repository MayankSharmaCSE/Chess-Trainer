"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { Avatar, CountryFlag, DemoBadge } from "./ui";
import { useProfileData } from "./ProfileProvider";
import { DEMO_PROFILE } from "@/lib/profile-mock";
import {
  accuracyPct,
  formatMonthYear,
  gameRecord,
  headlineRating,
  pct,
  speedLabel,
} from "@/lib/profile";
import { platformLabel } from "@/lib/bff";

function RatingBlock() {
  const { games } = useProfileData();
  const headline = headlineRating(games);
  return (
    <div className="text-left md:text-right">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{speedLabel(headline.speed)} rating</p>
      <p className="mt-0.5 font-mono text-3xl font-extrabold leading-none text-white">
        {headline.rating ?? <span className="text-lg text-slate-500">Unrated</span>}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">From your synced games</p>
    </div>
  );
}

function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { user } = useProfileData();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-sm" onClick={onClose} aria-label="Close edit profile dialog" />
      <div role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#111A2E] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="edit-profile-title" className="font-display text-lg font-extrabold text-white">Edit profile</h2>
            <p className="mt-1 text-xs text-slate-400">Account details and connected platforms.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-slate-700 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <Icon name="close" size={15} />
          </button>
        </div>

        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          Profile editing is not available yet. Your username and email come from your ChessLens account; ratings come
          from the platforms you connect. This dialog is read-only.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Username</span>
            <input
              readOnly
              value={user.username}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</span>
            <input
              readOnly
              value={user.email}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </label>
          <label className="block">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Country <DemoBadge />
            </span>
            <input
              readOnly
              value={DEMO_PROFILE.country}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/connect"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
          >
            <Icon name="plugin" size={14} /> Manage connected accounts
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileHeader() {
  const { user, accounts, games, totalGames, progress } = useProfileData();
  const [editOpen, setEditOpen] = useState(false);
  const record = gameRecord(games);
  const accuracy = accuracyPct(progress);
  const analyzed = progress?.games_analyzed ?? 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#111A2E]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-14 select-none font-chesspieces text-[170px] leading-none text-slate-800/30"
      >
        ♞
      </span>

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <Avatar name={user.username} size="lg" online />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="max-w-full truncate font-display text-[clamp(1.4rem,3vw,1.9rem)] font-extrabold tracking-tight text-white">
                {user.username}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                <CountryFlag code={DEMO_PROFILE.countryCode} />
                {DEMO_PROFILE.country}
                <DemoBadge />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                Online
              </span>
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" size={12} className="text-slate-500" />
                Member since {formatMonthYear(user.created_at)}
              </span>
              <span className="text-slate-700" aria-hidden="true">·</span>
              {accounts.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {accounts.map((account) => (
                    <span
                      key={account.id}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"
                    >
                      {platformLabel(account.platform)} · {account.username}
                    </span>
                  ))}
                </span>
              ) : (
                <Link href="/connect" className="font-semibold text-emerald-300 underline-offset-2 hover:underline">
                  Connect Chess.com or Lichess
                </Link>
              )}
            </p>

            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
              {DEMO_PROFILE.bio} <DemoBadge className="ml-1 align-middle" />
            </p>
          </div>

          <div className="flex items-end justify-between gap-4 md:flex-col md:items-end">
            <RatingBlock />
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <Icon name="edit" size={14} />
              Edit profile
            </button>
          </div>
        </div>
      </div>

      <dl className="relative grid grid-cols-2 divide-x divide-y divide-slate-800 border-t border-slate-800 sm:grid-cols-4 sm:divide-y-0">
        {[
          { label: "Games synced", value: totalGames.toLocaleString("en-US") },
          { label: "Win rate", value: record.total > 0 ? `${Math.round(pct(record.wins, record.total))}%` : "—" },
          { label: "Avg accuracy", value: accuracy != null ? `${accuracy}%` : "—" },
          { label: "Games analyzed", value: analyzed.toLocaleString("en-US") },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold text-slate-100">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {editOpen && <EditProfileDialog onClose={() => setEditOpen(false)} />}
    </section>
  );
}
