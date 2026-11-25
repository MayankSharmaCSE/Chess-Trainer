"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** sessionStorage key holding the path the user was on before this one. */
const PREV_KEY = "chesslens_prev_path";
const CURR_KEY = "chesslens_curr_path";

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // private mode / storage blocked: fall back to the parent link
  }
}

/**
 * Mounted once in the root layout. Records in-app navigation so BackButton
 * only calls history.back() when the previous page was part of ChessLens,
 * never sending someone back to the site they came from.
 */
export function NavHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const curr = sessionStorage.getItem(CURR_KEY);
      if (curr && curr !== pathname) sessionStorage.setItem(PREV_KEY, curr);
      sessionStorage.setItem(CURR_KEY, pathname);
    } catch {
      /* storage unavailable: BackButton uses its fallback href */
    }
  }, [pathname]);
  return null;
}

type Props = {
  /** Where to go when there is no in-app page to return to (e.g. a fresh tab). */
  fallbackHref: string;
  label?: string;
  /** "light" for the cream pages (games, training, ...), "dark" for slate pages. */
  tone?: "light" | "dark";
  /** "sm" for tight toolbars (endgame board strip). */
  size?: "sm" | "md";
  className?: string;
};

export default function BackButton({ fallbackHref, label = "Back", tone = "light", size = "md", className = "" }: Props) {
  const router = useRouter();

  function goBack() {
    const prev = read(PREV_KEY);
    if (prev && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  }

  const toneClass =
    tone === "dark"
      ? "border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white focus-visible:outline-emerald-400"
      : "border-[#D5DCE4] bg-white text-[#13233A] hover:border-[#13233A] focus-visible:outline-[#13233A]";

  const sizeClass = size === "sm" ? "gap-1 px-2 py-1 text-xs" : "gap-1.5 px-3 py-1.5 text-sm";

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex flex-none items-center rounded-lg border font-semibold transition ${sizeClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClass} ${className}`}
    >
      <svg width={size === "sm" ? 12 : 14} height={size === "sm" ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
