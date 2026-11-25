"use client";

import { Icon } from "./icons";
import { DemoBadge, Panel, TONE_TILE } from "./ui";
import { DEMO_CLUBS, DEMO_PROFILE } from "@/lib/profile-mock";
import { shortNumber } from "@/lib/profile";

const ROLE_TONE: Record<string, string> = {
  Admin: "border-violet-500/35 bg-violet-500/15 text-violet-300",
  Moderator: "border-sky-500/35 bg-sky-500/15 text-sky-300",
  Member: "border-slate-700 bg-slate-800/60 text-slate-300",
};

export default function ClubsTab() {
  const totalMembers = DEMO_CLUBS.reduce((sum, club) => sum + club.members, 0);
  const adminOf = DEMO_CLUBS.filter((club) => club.role === "Admin").length;

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            Clubs <DemoBadge />
          </span>
        }
        subtitle="ChessLens clubs are not backed by an API yet — these are example memberships."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Clubs joined</p>
            <p className="mt-0.5 font-mono text-2xl font-extrabold text-white">{DEMO_CLUBS.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Combined members</p>
            <p className="mt-0.5 font-mono text-2xl font-extrabold text-white">{shortNumber(totalMembers)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admin roles</p>
            <p className="mt-0.5 font-mono text-2xl font-extrabold text-violet-300">{adminOf}</p>
          </div>
          <p className="ml-auto max-w-xs text-[11px] leading-relaxed text-slate-500">
            Player: <span className="font-semibold text-slate-300">{DEMO_PROFILE.title}</span> · {DEMO_PROFILE.country}
          </p>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        {DEMO_CLUBS.map((club) => (
          <article key={club.id} className="flex flex-col rounded-2xl border border-slate-800 bg-[#111A2E] p-4 transition hover:border-slate-700">
            <div className="flex items-start gap-3">
              <span
                className={`grid h-12 w-12 flex-none place-items-center rounded-xl border font-display text-sm font-extrabold tracking-wide ${TONE_TILE[club.tone]}`}
                aria-hidden="true"
              >
                {club.monogram}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-sm font-bold text-white">{club.name}</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Icon name="users" size={11} />
                  {club.members.toLocaleString("en-US")} members
                </p>
              </div>
              <span className={`flex-none rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ROLE_TONE[club.role] ?? ROLE_TONE.Member}`}>
                {club.role}
              </span>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{club.tagline}</p>

            <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Icon name="check" size={10} className="text-emerald-400" />
                Membership active
              </span>
              <span>Joined {club.joined}</span>
            </div>
          </article>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Club discovery, joining and member lists will be wired to the backend once clubs exist as a real ChessLens
        feature.
      </p>
    </div>
  );
}
