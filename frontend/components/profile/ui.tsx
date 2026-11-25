import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icons";

/* --------------------------------- avatar -------------------------------- */

const AVATAR_TONES = [
  "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
  "border-sky-500/30 bg-sky-500/15 text-sky-200",
  "border-violet-500/30 bg-violet-500/15 text-violet-200",
  "border-amber-500/30 bg-amber-500/15 text-amber-200",
  "border-rose-500/30 bg-rose-500/15 text-rose-200",
  "border-teal-500/30 bg-teal-500/15 text-teal-200",
];

const AVATAR_SIZES = {
  xs: "h-7 w-7 text-[9px] rounded-md",
  sm: "h-9 w-9 text-[11px] rounded-lg",
  md: "h-11 w-11 text-sm rounded-xl",
  lg: "h-20 w-20 text-2xl rounded-2xl",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function Avatar({
  name,
  size = "md",
  online = false,
  className = "",
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  online?: boolean;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <span className={`relative inline-flex flex-none items-center justify-center border font-display font-extrabold tracking-wide ${AVATAR_SIZES[size]} ${tone} ${className}`}>
      <span aria-hidden="true">{initialsOf(name)}</span>
      {online && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[#111A2E] bg-emerald-400 ${
            size === "lg" ? "h-4 w-4" : size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"
          }`}
          title="Online"
        >
          <span className="sr-only">Online</span>
        </span>
      )}
    </span>
  );
}

/* --------------------------------- badges -------------------------------- */

export function DemoBadge({ label = "Demo", className = "" }: { label?: string; className?: string }) {
  return (
    <span
      title="Demo data — this feature has no backend support yet"
      className={`inline-flex flex-none items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ${className}`}
    >
      {label}
    </span>
  );
}

export function OnlineDot({ online }: { online: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-slate-600"}`} aria-hidden="true" />;
}

const RESULT_TONES: Record<string, string> = {
  win: "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
  loss: "border-rose-500/35 bg-rose-500/15 text-rose-300",
  draw: "border-slate-600/60 bg-slate-700/40 text-slate-300",
};

export function ResultChip({ result, className = "" }: { result: string | null; className?: string }) {
  const tone = RESULT_TONES[result ?? ""] ?? RESULT_TONES.draw;
  const label = result === "win" ? "Win" : result === "loss" ? "Loss" : result === "draw" ? "Draw" : "—";
  return (
    <span className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${tone} ${className}`}>
      {label}
    </span>
  );
}

/* ---------------------------------- panel -------------------------------- */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  const hasHeader = title !== undefined || action !== undefined;
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-800 bg-[#111A2E] ${className}`}>
      {hasHeader && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title !== undefined && <h2 className="font-display text-sm font-bold text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`${padded ? "p-4 sm:p-5" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* -------------------------------- feedback ------------------------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-lg bg-slate-800/70 ${className}`} />;
}

export function EmptyState({
  icon = "globe",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-500">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-sm font-bold text-slate-200">{title}</p>
      {body && <p className="max-w-xs text-xs leading-relaxed text-slate-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const tone =
    variant === "primary"
      ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
      : "border border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-700 hover:text-white";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${tone} ${className}`}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------- flags -------------------------------- */

export const TONE_TILE: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  sky: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  violet: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  rose: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  teal: "border-teal-500/30 bg-teal-500/15 text-teal-300",
};

/* ---------------------------------- flag --------------------------------- */

/** Tiny SVG flag for the demo profile country (flag emoji do not render on Windows). */
export function CountryFlag({ code, className = "" }: { code: string; className?: string }) {
  if (code === "NG") {
    return (
      <svg viewBox="0 0 30 20" className={`inline-block h-3.5 w-5 flex-none overflow-hidden rounded-[2px] ring-1 ring-slate-700 ${className}`} aria-label="Nigeria" role="img">
        <rect width="10" height="20" fill="#008751" />
        <rect x="10" width="10" height="20" fill="#ffffff" />
        <rect x="20" width="10" height="20" fill="#008751" />
      </svg>
    );
  }
  return (
    <span className={`inline-flex h-3.5 w-5 flex-none items-center justify-center overflow-hidden rounded-[2px] border border-slate-700 bg-slate-800 text-[8px] font-bold text-slate-400 ${className}`} aria-label={code}>
      {code}
    </span>
  );
}
