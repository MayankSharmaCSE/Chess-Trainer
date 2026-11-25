"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useProfileData } from "./ProfileProvider";
import { Icon } from "./icons";
import { Avatar, DemoBadge, EmptyState, Panel } from "./ui";
import { DEMO_POSTS, type DemoAttachment, type DemoPost } from "@/lib/profile-mock";
import {
  buildAchievements,
  endgameCompletedCount,
  formatShortDate,
  isAchievementUnlocked,
} from "@/lib/profile";
import { resultLabel } from "@/lib/bff";

type FeedPost = DemoPost & { liked?: boolean };

const MAX_LENGTH = 500;

/* ------------------------------- post card ------------------------------- */

function AttachmentCard({ attachment }: { attachment: DemoAttachment }) {
  const isGame = attachment.kind === "game";
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-slate-700 bg-slate-800 text-emerald-300">
        <Icon name={isGame ? "swords" : "trophy"} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          {isGame ? "Shared game" : "Achievement"}
        </p>
        <p className="truncate text-xs font-semibold text-slate-200">{attachment.label}</p>
      </div>
      {attachment.gameId != null && (
        <Link
          href={`/games/${attachment.gameId}`}
          className="inline-flex flex-none items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
        >
          Review
          <Icon name="arrowRight" size={11} />
        </Link>
      )}
    </div>
  );
}

function PostCard({
  post,
  selfName,
  onToggleLike,
  onComment,
}: {
  post: FeedPost;
  selfName: string;
  onToggleLike: (id: string) => void;
  onComment: (id: string, text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const author = post.self ? selfName : post.author;
  const likeCount = post.likes + (post.liked ? 1 : 0);

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onComment(post.id, value);
    setDraft("");
  }

  return (
    <article className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <Avatar name={author} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-display text-sm font-bold text-white">
            {author}
            {post.self && (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-emerald-300">
                You
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">{post.time}</p>
        </div>
      </header>

      {post.text && <p className="mt-3 text-xs leading-relaxed text-slate-300">{post.text}</p>}

      {post.attachment && <AttachmentCard attachment={post.attachment} />}

      <div className="mt-3 flex items-center gap-2 border-t border-slate-800/70 pt-2.5">
        <button
          type="button"
          onClick={() => onToggleLike(post.id)}
          aria-pressed={Boolean(post.liked)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
            post.liked
              ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
              : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
          }`}
        >
          <Icon name="heart" size={13} filled={Boolean(post.liked)} />
          {likeCount}
          <span className="sr-only">likes</span>
        </button>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-slate-400">
          <Icon name="comment" size={13} />
          {post.comments.length}
          <span className="sr-only">comments</span>
        </span>
      </div>

      {post.comments.length > 0 && (
        <ul className="mt-2 space-y-2.5 border-t border-slate-800/70 pt-3">
          {post.comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-2">
              <Avatar name={comment.author} size="xs" />
              <div className="min-w-0 flex-1 rounded-lg bg-slate-900/60 px-2.5 py-1.5">
                <p className="flex items-baseline gap-1.5">
                  <span className="truncate text-[11px] font-semibold text-slate-200">{comment.author}</span>
                  <span className="flex-none text-[9px] text-slate-600">{comment.time}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submitComment} className="mt-2.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment…"
          maxLength={200}
          aria-label="Write a comment"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#0D1424] px-2.5 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-emerald-500 text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          aria-label="Send comment"
        >
          <Icon name="send" size={12} />
        </button>
      </form>
    </article>
  );
}

/* ---------------------------------- tab ---------------------------------- */

export default function PostsTab() {
  const { user, games, progress, training, taxonomy } = useProfileData();
  const [posts, setPosts] = useState<FeedPost[]>(DEMO_POSTS);
  const [text, setText] = useState("");
  const [attachmentValue, setAttachmentValue] = useState("");

  const shareableAchievements = useMemo(() => {
    const all = buildAchievements({
      games,
      progress,
      training,
      endgameCompleted: endgameCompletedCount(taxonomy),
    });
    return all.filter(isAchievementUnlocked);
  }, [games, progress, training, taxonomy]);

  const shareableGames = games.slice(0, 5);

  const commentTotal = posts.reduce((sum, post) => sum + post.comments.length, 0);
  const likeTotal = posts.reduce((sum, post) => sum + post.likes + (post.liked ? 1 : 0), 0);

  function resolveAttachment(): DemoAttachment | undefined {
    if (!attachmentValue) return undefined;
    const [kind, key] = attachmentValue.split(":");
    if (kind === "award") {
      const achievement = shareableAchievements.find((item) => item.id === key);
      return achievement ? { kind: "achievement", label: achievement.title } : undefined;
    }
    if (kind === "game") {
      const game = shareableGames.find((item) => String(item.id) === key);
      if (!game) return undefined;
      return {
        kind: "game",
        label: `vs ${game.opponent ?? "Unknown"} · ${resultLabel(game.user_result)}`,
        gameId: game.id,
      };
    }
    return undefined;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    const attachment = resolveAttachment();
    if (!body && !attachment) return;
    setPosts((prev) => [
      {
        id: `local-${Date.now()}`,
        author: user.username,
        time: "Just now",
        text: body,
        likes: 0,
        comments: [],
        self: true,
        attachment,
      },
      ...prev,
    ]);
    setText("");
    setAttachmentValue("");
  }

  function toggleLike(id: string) {
    setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, liked: !post.liked } : post)));
  }

  function addComment(id: string, body: string) {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? {
              ...post,
              comments: [
                ...post.comments,
                { id: `c-${Date.now()}`, author: user.username, time: "Just now", text: body },
              ],
            }
          : post,
      ),
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              Share something <DemoBadge />
            </span>
          }
          subtitle="Posts live in this browser session only — nothing is sent to the ChessLens backend."
        >
          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              maxLength={MAX_LENGTH}
              placeholder="Share an achievement, a game or a training insight…"
              aria-label="Post text"
              className="w-full resize-none rounded-xl border border-slate-700 bg-[#0D1424] px-3 py-2.5 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-slate-500">
                Attach
                <select
                  value={attachmentValue}
                  onChange={(event) => setAttachmentValue(event.target.value)}
                  className="max-w-[240px] rounded-lg border border-slate-700 bg-[#0D1424] px-2 py-1.5 text-[11px] text-slate-200 focus:border-emerald-500/60 focus:outline-none"
                >
                  <option value="">Nothing</option>
                  {shareableAchievements.length > 0 && (
                    <optgroup label="Unlocked achievements">
                      {shareableAchievements.map((achievement) => (
                        <option key={achievement.id} value={`award:${achievement.id}`}>
                          {achievement.glyph} {achievement.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {shareableGames.length > 0 && (
                    <optgroup label="Recent games">
                      {shareableGames.map((game) => (
                        <option key={game.id} value={`game:${game.id}`}>
                          vs {game.opponent ?? "Unknown"} · {formatShortDate(game.played_at)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <div className="ml-auto flex items-center gap-3">
                <span className={`font-mono text-[10px] ${text.length > MAX_LENGTH - 50 ? "text-amber-300" : "text-slate-600"}`}>
                  {text.length}/{MAX_LENGTH}
                </span>
                <button
                  type="submit"
                  disabled={!text.trim() && !attachmentValue}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  <Icon name="plus" size={13} />
                  Post
                </button>
              </div>
            </div>
          </form>
        </Panel>

        {posts.length === 0 ? (
          <Panel title="Activity feed">
            <EmptyState icon="comment" title="No posts yet" body="Share your first training win above." />
          </Panel>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              selfName={user.username}
              onToggleLike={toggleLike}
              onComment={addComment}
            />
          ))
        )}
      </div>

      <aside className="space-y-4">
        <Panel title="Feed summary" subtitle="This session">
          <dl className="space-y-2 text-xs">
            {[
              { label: "Posts", value: posts.length },
              { label: "Likes", value: likeTotal },
              { label: "Comments", value: commentTotal },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <dt className="text-slate-400">{row.label}</dt>
                <dd className="font-mono font-bold text-slate-200">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              Demo feed <DemoBadge />
            </span>
          }
          subtitle="What works and what still needs a backend."
        >
          <ul className="space-y-2 text-[11px] leading-relaxed text-slate-400">
            <li className="flex gap-2">
              <Icon name="check" size={12} className="mt-0.5 flex-none text-emerald-400" />
              Composing, liking and commenting all work locally.
            </li>
            <li className="flex gap-2">
              <Icon name="lock" size={12} className="mt-0.5 flex-none text-slate-600" />
              Posts are not saved and disappear on reload.
            </li>
            <li className="flex gap-2">
              <Icon name="users" size={12} className="mt-0.5 flex-none text-slate-600" />
              Friend feeds, notifications and moderation need a social backend.
            </li>
          </ul>
          <p className="mt-3 border-t border-slate-800/70 pt-2.5 text-[10px] text-slate-600">
            The sample posts are demo content, labelled throughout so the real ChessLens data on other tabs stays
            trustworthy.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
