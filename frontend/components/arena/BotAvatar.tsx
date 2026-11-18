"use client";

import React from "react";

interface BotAvatarProps {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const BOT_THEMES: Record<
  string,
  {
    bgGradient: string;
    borderColor: string;
    glowColor: string;
    icon: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  beginner: {
    bgGradient: "from-emerald-950/80 via-emerald-900/50 to-slate-900",
    borderColor: "border-emerald-500/40",
    glowColor: "rgba(16, 185, 129, 0.25)",
    icon: "♟",
    badgeBg: "bg-emerald-500/15 border-emerald-500/30",
    badgeText: "text-emerald-400",
  },
  casual: {
    bgGradient: "from-sky-950/80 via-sky-900/50 to-slate-900",
    borderColor: "border-sky-500/40",
    glowColor: "rgba(14, 165, 233, 0.25)",
    icon: "♟",
    badgeBg: "bg-sky-500/15 border-sky-500/30",
    badgeText: "text-sky-400",
  },
  learner: {
    bgGradient: "from-teal-950/80 via-teal-900/50 to-slate-900",
    borderColor: "border-teal-500/40",
    glowColor: "rgba(20, 184, 166, 0.25)",
    icon: "♞",
    badgeBg: "bg-teal-500/15 border-teal-500/30",
    badgeText: "text-teal-400",
  },
  club: {
    bgGradient: "from-indigo-950/80 via-indigo-900/50 to-slate-900",
    borderColor: "border-indigo-500/40",
    glowColor: "rgba(99, 102, 241, 0.25)",
    icon: "♝",
    badgeBg: "bg-indigo-500/15 border-indigo-500/30",
    badgeText: "text-indigo-400",
  },
  challenger: {
    bgGradient: "from-purple-950/80 via-purple-900/50 to-slate-900",
    borderColor: "border-purple-500/40",
    glowColor: "rgba(168, 85, 247, 0.25)",
    icon: "♞",
    badgeBg: "bg-purple-500/15 border-purple-500/30",
    badgeText: "text-purple-400",
  },
  advanced: {
    bgGradient: "from-amber-950/80 via-amber-900/50 to-slate-900",
    borderColor: "border-amber-500/40",
    glowColor: "rgba(245, 158, 11, 0.25)",
    icon: "♜",
    badgeBg: "bg-amber-500/15 border-amber-500/30",
    badgeText: "text-amber-400",
  },
  expert: {
    bgGradient: "from-rose-950/80 via-rose-900/50 to-slate-900",
    borderColor: "border-rose-500/40",
    glowColor: "rgba(244, 63, 94, 0.25)",
    icon: "♜",
    badgeBg: "bg-rose-500/15 border-rose-500/30",
    badgeText: "text-rose-400",
  },
  master: {
    bgGradient: "from-fuchsia-950/80 via-fuchsia-900/50 to-slate-900",
    borderColor: "border-fuchsia-500/40",
    glowColor: "rgba(217, 70, 239, 0.25)",
    icon: "♛",
    badgeBg: "bg-fuchsia-500/15 border-fuchsia-500/30",
    badgeText: "text-fuchsia-400",
  },
  grandmaster: {
    bgGradient: "from-yellow-950/90 via-amber-900/60 to-slate-950",
    borderColor: "border-yellow-400/50",
    glowColor: "rgba(250, 204, 21, 0.35)",
    icon: "♚",
    badgeBg: "bg-yellow-400/15 border-yellow-400/40",
    badgeText: "text-yellow-300",
  },
};

const DEFAULT_THEME = {
  bgGradient: "from-slate-800 to-slate-900",
  borderColor: "border-slate-700",
  glowColor: "rgba(100, 116, 139, 0.2)",
  icon: "♚",
  badgeBg: "bg-slate-800 border-slate-700",
  badgeText: "text-slate-300",
};

const SIZES = {
  sm: "w-9 h-9 text-lg",
  md: "w-12 h-12 text-2xl",
  lg: "w-16 h-16 text-3xl",
  xl: "w-20 h-20 text-4xl",
};

export default function BotAvatar({ id, name, size = "md", className = "" }: BotAvatarProps) {
  const theme = BOT_THEMES[id.toLowerCase()] || DEFAULT_THEME;
  const sizeClasses = SIZES[size];

  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br ${theme.bgGradient} border ${theme.borderColor} ${sizeClasses} shadow-md select-none transition-transform duration-200 ${className}`}
      style={{ boxShadow: `0 0 16px ${theme.glowColor}` }}
      aria-label={`${name} avatar`}
    >
      <span className="font-chesspieces select-none leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
        {theme.icon}
      </span>
      <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-slate-900" />
      </span>
    </div>
  );
}

export function getDifficultyBadgeStyle(difficulty: string): { bg: string; text: string; border: string } {
  const norm = difficulty.toLowerCase();
  if (norm.includes("very easy")) {
    return { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" };
  }
  if (norm.includes("easy")) {
    return { bg: "bg-sky-500/15", text: "text-sky-400", border: "border-sky-500/30" };
  }
  if (norm.includes("intermediate")) {
    return { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" };
  }
  if (norm.includes("very hard")) {
    return { bg: "bg-rose-500/15", text: "text-rose-400", border: "border-rose-500/30" };
  }
  if (norm.includes("hard")) {
    return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" };
  }
  if (norm.includes("expert")) {
    return { bg: "bg-yellow-400/15", text: "text-yellow-300", border: "border-yellow-400/40" };
  }
  return { bg: "bg-slate-700/50", text: "text-slate-300", border: "border-slate-600" };
}
