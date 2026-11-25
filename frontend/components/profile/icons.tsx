/** Minimal feather-style icon set for the profile area (matches the
 *  stroke-based icons used by the Endgame trainer). */

export type IconName =
  | "dashboard"
  | "user"
  | "book"
  | "chart"
  | "comment"
  | "users"
  | "trophy"
  | "award"
  | "shield"
  | "swords"
  | "crown"
  | "target"
  | "activity"
  | "plugin"
  | "logout"
  | "menu"
  | "close"
  | "search"
  | "chevronRight"
  | "chevronLeft"
  | "chevronDown"
  | "edit"
  | "bolt"
  | "flame"
  | "clock"
  | "calendar"
  | "heart"
  | "send"
  | "lock"
  | "check"
  | "plus"
  | "external"
  | "globe"
  | "star"
  | "arrowRight"
  | "filter";

const PATHS: Record<IconName, string> = {
  dashboard: "M3 3h7v7H3z|M14 3h7v7h-7z|M14 14h7v7h-7z|M3 14h7v7H3z",
  user: "M20 21a8 8 0 0 0-16 0|M12 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20|M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  chart: "M3 3v18h18|M7 16v-5|M12 16V8|M17 16v-8",
  comment: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75",
  trophy:
    "M8 21h8|M12 17v4|M7 4h10v4a5 5 0 0 1-10 0z|M7 5H4v2a3 3 0 0 0 3 3|M17 5h3v2a3 3 0 0 1-3 3",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M8.5 13.5 7 22l5-3 5 3-1.5-8.5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  swords: "M14.5 17.5 3 6V3h3l11.5 11.5|M13 19l6-6|M16 16l4 4|M19 21l2-2",
  crown: "M3 7l4 4 5-7 5 7 4-4-2 12H5z",
  target:
    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z|M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  plugin: "M9 2v6|M15 2v6|M6 8h12v3a6 6 0 0 1-12 0z|M12 17v5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9",
  menu: "M4 6h16|M4 12h16|M4 18h16",
  close: "M18 6 6 18|M6 6l12 12",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z|M21 21l-4.3-4.3",
  chevronRight: "M9 18l6-6-6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronDown: "M6 9l6 6 6-6",
  edit: "M12 20h9|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7z",
  flame:
    "M12 22c4 0 7-2.7 7-6.5 0-2.5-1.5-4.5-3-6.5-.8 1.5-2 2.5-3 2.5 0-3-1-5.5-3-7.5 0 4-5 5-5 11C5 19.3 8 22 12 22z",
  clock: "M12 7v5l3 2|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  calendar:
    "M8 2v4|M16 2v4|M3 10h18|M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z",
  send: "M22 2 11 13|M22 2l-7 20-4-9-9-4z",
  lock: "M5 11h14v10H5z|M8 11V7a4 4 0 0 1 8 0v4",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14|M5 12h14",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6|M15 3h6v6|M10 14 21 3",
  globe: "M2 12h20|M12 2a15 15 0 0 1 0 20|M12 2a15 15 0 0 0 0 20|M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  star: "M12 2l3 6.5 7 1-5 4.8 1.2 7L12 18l-6.2 3.3L7 14.3 2 9.5l7-1z",
  arrowRight: "M5 12h14|M13 6l6 6-6 6",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5z",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
  title?: string;
}

export function Icon({ name, size = 16, className = "", strokeWidth = 1.9, filled = false, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PATHS[name].split("|").map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
