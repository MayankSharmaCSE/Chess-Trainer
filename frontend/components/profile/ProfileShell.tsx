"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { Avatar, Skeleton } from "./ui";
import ProfileProvider, { useProfile } from "./ProfileProvider";
import ProfileHeader from "./ProfileHeader";

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/profile", label: "Player profile", icon: "user" },
      { href: "/games", label: "Game library", icon: "book" },
    ],
  },
  {
    label: "Train",
    items: [
      { href: "/weaknesses", label: "Weakness map", icon: "target" },
      { href: "/training", label: "Train mistakes", icon: "activity" },
      { href: "/bots", label: "Bot Arena", icon: "swords" },
      { href: "/endgame", label: "Endgame Drills", icon: "crown" },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/connect", label: "Connect account", icon: "plugin" }],
  },
];

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/profile", label: "Overview", icon: "dashboard" },
  { href: "/profile/games", label: "Games", icon: "book" },
  { href: "/profile/stats", label: "Stats", icon: "chart" },
  { href: "/profile/posts", label: "Posts", icon: "comment" },
  { href: "/profile/friends", label: "Friends", icon: "users" },
  { href: "/profile/awards", label: "Awards", icon: "award" },
  { href: "/profile/clubs", label: "Clubs", icon: "shield" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/profile") return pathname === "/profile";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
    <span className="grid h-7 w-7 flex-none grid-cols-2 grid-rows-2 overflow-hidden rounded-[6px]" aria-hidden="true">
      <span className="bg-[#13233A]" />
      <span className="bg-[#E9ECE4]" />
      <span className="bg-[#E9ECE4]" />
      <span className="bg-[#C8372D]" />
    </span>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Application">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mt-4 first:mt-0">
          <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition ${
                      active
                        ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                        : "border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    <Icon name={item.icon} size={15} className={active ? "text-emerald-400" : "text-slate-500"} />
                    <span className="truncate">{item.label}</span>
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function AccountFooter({ onSignOut, onNavigate }: { onSignOut: () => void; onNavigate?: () => void }) {
  const { data, status } = useProfile();
  return (
    <div className="border-t border-slate-800 p-3">
      {data ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
          <Avatar name={data.user.username} size="sm" online />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-100">{data.user.username}</span>
            <span className="block truncate text-[10px] text-slate-500">{data.user.email}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            title="Log out"
            aria-label="Log out"
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-rose-300"
          >
            <Icon name="logout" size={14} />
          </button>
        </div>
      ) : status === "unauth" ? (
        <Link
          href="/login"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          <Icon name="user" size={14} /> Log in
        </Link>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
    </div>
  );
}

function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Profile sections" className="mt-5 overflow-x-auto border-b border-slate-800">
      <ul className="flex min-w-max items-center gap-1">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition ${
                  active
                    ? "border-emerald-400 text-white"
                    : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Icon name={tab.icon} size={14} className={active ? "text-emerald-400" : "text-slate-500"} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ShellSkeleton() {
  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading your profile…</span>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="mt-5 flex gap-2 border-b border-slate-800 pb-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-20" />
        ))}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 rounded-2xl" />
    </div>
  );
}

function SignInGate() {
  return (
    <div className="mx-auto max-w-md py-16">
      <div className="rounded-2xl border border-slate-800 bg-[#111A2E] p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400">
          <Icon name="lock" size={20} />
        </span>
        <h1 className="mt-4 font-display text-xl font-extrabold text-white">Sign in to see your profile</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Your ratings, games, accuracy and awards are tied to your ChessLens account and the platforms you connect.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/login" className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400">
            Log in
          </Link>
          <Link href="/signup" className="rounded-xl border border-slate-700 bg-slate-800/70 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorGate({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-center">
        <p className="font-display text-lg font-bold text-rose-200">Could not load your profile</p>
        <p className="mt-2 text-sm text-rose-300/80">
          {message ?? "The backend may be offline. Start it on port 8000 and retry."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const { status, error, data, reload } = useProfile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#0A0F1D] font-body text-slate-100 antialiased selection:bg-emerald-500/30">
      <div className="flex">
        <aside className="hidden w-[236px] flex-none border-r border-slate-800 bg-[#0D1424] lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex items-center justify-between px-5 py-5">
              <Link href="/dashboard" className="flex items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
                <BrandMark />
                <span className="font-display text-[17px] font-extrabold tracking-tight text-white" style={{ fontStretch: "112%" }}>
                  ChessLens
                </span>
              </Link>
            </div>
            <SideNav />
            <AccountFooter onSignOut={signOut} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-[#0A0F1D]/95 px-4 backdrop-blur sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 bg-[#111A2E] text-slate-300 lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
            >
              <Icon name="menu" size={17} />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
              <Link href="/dashboard" className="hidden transition hover:text-slate-300 sm:inline">
                ChessLens
              </Link>
              <span className="hidden sm:inline">/</span>
              <span className="truncate font-semibold text-slate-200">Player profile</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {data && (
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-[#111A2E] py-1 pl-1 pr-2.5 transition hover:border-slate-700"
                  title="Your profile"
                >
                  <Avatar name={data.user.username} size="sm" />
                  <span className="hidden text-xs font-semibold text-slate-200 sm:inline">{data.user.username}</span>
                </Link>
              )}
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
            {status === "loading" && <ShellSkeleton />}
            {status === "unauth" && <SignInGate />}
            {status === "error" && <ErrorGate message={error} onRetry={reload} />}
            {status === "ready" && data && (
              <>
                <ProfileHeader />
                <ProfileTabs />
                <div className="mt-5">{children}</div>
              </>
            )}
          </main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative flex h-full w-[272px] flex-col border-r border-slate-800 bg-[#0D1424] shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4">
              <Link href="/dashboard" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2">
                <BrandMark />
                <span className="font-display text-[17px] font-extrabold tracking-tight text-white">ChessLens</span>
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 text-slate-400"
                aria-label="Close navigation"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawerOpen(false)} />
            <AccountFooter onSignOut={signOut} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <ShellFrame>{children}</ShellFrame>
    </ProfileProvider>
  );
}
