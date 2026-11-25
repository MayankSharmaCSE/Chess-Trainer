/**
 * DEMO DATA — clearly separated from real API data.
 *
 * ChessLens has no backend for social features, clubs, posts or profile
 * metadata (country/bio) yet. Everything below is rendered with a visible
 * "Demo" badge and is never sent to the API. It is intentionally kept in
 * this single module so it can be deleted in one place once endpoints exist.
 */

export type Tone = "emerald" | "sky" | "amber" | "violet" | "rose" | "teal";

export const DEMO_PROFILE = {
  country: "Nigeria",
  countryCode: "NG",
  title: "Club Player",
  bio: "Tactics first, endgames eventually — collecting one blunder-free game at a time.",
};

export interface DemoFriend {
  id: string;
  username: string;
  rating: number;
  online: boolean;
  lastSeen: string;
  memberSince: string;
}

export const DEMO_FRIENDS: DemoFriend[] = [
  { id: "f1", username: "tacticaltuna", rating: 1487, online: true, lastSeen: "now", memberSince: "2023" },
  { id: "f2", username: "rookroller", rating: 1722, online: true, lastSeen: "now", memberSince: "2021" },
  { id: "f3", username: "silentbishop", rating: 1315, online: false, lastSeen: "2 hours ago", memberSince: "2024" },
  { id: "f4", username: "pawnslinger", rating: 968, online: true, lastSeen: "now", memberSince: "2024" },
  { id: "f5", username: "knightrider_88", rating: 1604, online: false, lastSeen: "yesterday", memberSince: "2022" },
  { id: "f6", username: "queensgambit_ada", rating: 1850, online: false, lastSeen: "3 days ago", memberSince: "2020" },
  { id: "f7", username: "endgame_ella", rating: 1240, online: true, lastSeen: "now", memberSince: "2023" },
  { id: "f8", username: "blitzbarry", rating: 1102, online: false, lastSeen: "last week", memberSince: "2022" },
];

export const DEMO_REQUESTS: DemoFriend[] = [
  { id: "r1", username: "checkmate_carla", rating: 1398, online: true, lastSeen: "now", memberSince: "2023" },
  { id: "r2", username: "forkmaster_femi", rating: 1521, online: false, lastSeen: "5 hours ago", memberSince: "2022" },
  { id: "r3", username: "d4_devon", rating: 890, online: true, lastSeen: "now", memberSince: "2025" },
];

export type ClubRole = "Member" | "Admin" | "Moderator";

export interface DemoClub {
  id: string;
  name: string;
  monogram: string;
  members: number;
  role: ClubRole;
  joined: string;
  tagline: string;
  tone: Tone;
}

export const DEMO_CLUBS: DemoClub[] = [
  {
    id: "c1",
    name: "Lagos Chess Club",
    monogram: "LC",
    members: 12480,
    role: "Member",
    joined: "Mar 2024",
    tagline: "Weekly rapid arenas and open blitz nights.",
    tone: "emerald",
  },
  {
    id: "c2",
    name: "Tactics Anonymous",
    monogram: "TA",
    members: 8240,
    role: "Admin",
    joined: "Jan 2024",
    tagline: "Puzzle spam, theme trains and fork drills.",
    tone: "violet",
  },
  {
    id: "c3",
    name: "Endgame Study Group",
    monogram: "ES",
    members: 3910,
    role: "Member",
    joined: "Aug 2024",
    tagline: "Lucena, Philidor and the grinding life.",
    tone: "amber",
  },
  {
    id: "c4",
    name: "Daily Chess Marathon",
    monogram: "DC",
    members: 21300,
    role: "Member",
    joined: "Nov 2024",
    tagline: "Correspondence games that never end politely.",
    tone: "sky",
  },
];

export interface DemoComment {
  id: string;
  author: string;
  time: string;
  text: string;
}

export interface DemoAttachment {
  kind: "achievement" | "game";
  label: string;
  gameId?: number;
}

export interface DemoPost {
  id: string;
  author: string;
  time: string;
  text: string;
  likes: number;
  comments: DemoComment[];
  self?: boolean;
  attachment?: DemoAttachment;
}

export const DEMO_POSTS: DemoPost[] = [
  {
    id: "p1",
    author: "rookroller",
    time: "2h ago",
    text: "Studied the Lucena position for an hour and then won a rook endgame a pawn down. This app's endgame drills are quietly evil.",
    likes: 14,
    comments: [
      { id: "c1", author: "endgame_ella", time: "1h ago", text: "The bridge technique finally clicked for me too." },
      { id: "c2", author: "knightrider_88", time: "45m ago", text: "Meanwhile I'm still losing king and pawn endings." },
    ],
    attachment: { kind: "achievement", label: "Endgame Initiate" },
  },
  {
    id: "p2",
    author: "tacticaltuna",
    time: "Yesterday",
    text: "Nine blunders in one game. The weakness map was not subtle about it — middlegame tactics are now officially my training block for the week.",
    likes: 23,
    comments: [
      { id: "c3", author: "silentbishop", time: "Yesterday", text: "Middlegame is where the fun and the pain live." },
    ],
  },
  {
    id: "p3",
    author: "queensgambit_ada",
    time: "3d ago",
    text: "Reminder that accuracy is not rating. I played a 92% game and drew because my opponent played 94%. Onwards.",
    likes: 41,
    comments: [],
  },
  {
    id: "p4",
    author: "blitzbarry",
    time: "5d ago",
    text: "Anyone else use the bot arena as a warm-up before rated blitz? The 1600 bot is a surprisingly honest opponent.",
    likes: 9,
    comments: [
      { id: "c4", author: "pawnslinger", time: "5d ago", text: "It punishes every loose pawn. Great for focus." },
    ],
  },
];
