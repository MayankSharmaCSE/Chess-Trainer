"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { Avatar, DemoBadge, EmptyState, OnlineDot, Panel } from "./ui";
import { DEMO_FRIENDS, DEMO_REQUESTS, type DemoFriend } from "@/lib/profile-mock";

/* ------------------------------ profile modal ----------------------------- */

function FriendDialog({ friend, onClose }: { friend: DemoFriend; onClose: () => void }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${friend.username} profile`}
        className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-[#111A2E] p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
        >
          <Icon name="close" size={14} />
        </button>

        <div className="flex flex-col items-center text-center">
          <Avatar name={friend.username} size="lg" online={friend.online} />
          <h3 className="mt-3 font-display text-lg font-extrabold text-white">{friend.username}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <OnlineDot online={friend.online} />
            {friend.online ? "Online now" : `Last seen ${friend.lastSeen}`}
          </p>
          <div className="mt-3 flex items-baseline gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Rating</span>
            <span className="font-mono text-xl font-extrabold text-emerald-300">{friend.rating}</span>
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-slate-800/70 pt-3 text-[11px]">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-semibold text-slate-300">{friend.memberSince}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Profile source</dt>
            <dd className="inline-flex items-center gap-1.5 text-amber-300/90">
              Demo data <DemoBadge />
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled
            title="Challenge invitations need a matchmaking backend"
            className="flex-1 cursor-not-allowed rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-slate-400"
          >
            Challenge
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
          >
            Close
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-600">
          Friend profiles are demo data — ChessLens accounts cannot be searched or challenged yet.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- tab ---------------------------------- */

export default function FriendsTab() {
  const [friends, setFriends] = useState<DemoFriend[]>(DEMO_FRIENDS);
  const [requests, setRequests] = useState<DemoFriend[]>(DEMO_REQUESTS);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DemoFriend | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onlineCount = friends.filter((friend) => friend.online).length;

  const visibleFriends = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...friends]
      .filter((friend) => !needle || friend.username.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.online) - Number(a.online) || b.rating - a.rating);
  }, [friends, query]);

  function accept(friend: DemoFriend) {
    setFriends((prev) => (prev.some((item) => item.id === friend.id) ? prev : [...prev, friend]));
    setRequests((prev) => prev.filter((item) => item.id !== friend.id));
    setNotice(`Accepted ${friend.username} — now in your friends list.`);
  }

  function reject(friend: DemoFriend) {
    setRequests((prev) => prev.filter((item) => item.id !== friend.id));
    setNotice(`Declined the request from ${friend.username}.`);
  }

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            Friends <DemoBadge />
          </span>
        }
        subtitle="ChessLens has no social graph yet — requests and friends below are sample data."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Friends</dt>
              <dd className="mt-0.5 font-mono text-2xl font-extrabold text-white">{friends.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Online now</dt>
              <dd className="mt-0.5 font-mono text-2xl font-extrabold text-emerald-300">{onlineCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Requests</dt>
              <dd className="mt-0.5 font-mono text-2xl font-extrabold text-amber-300">{requests.length}</dd>
            </div>
          </dl>

          <label className="relative block w-full lg:max-w-xs">
            <span className="sr-only">Search friends by username</span>
            <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search players…"
              className="w-full rounded-lg border border-slate-700 bg-[#0D1424] py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </label>
        </div>
        {notice && <p className="mt-3 text-[10px] font-semibold text-emerald-300/90">{notice}</p>}
      </Panel>

      <Panel
        title="Friend requests"
        subtitle={requests.length > 0 ? `${requests.length} waiting for your answer` : "You are all caught up"}
        action={
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
            {requests.length} pending
          </span>
        }
        padded={requests.length === 0}
      >
        {requests.length === 0 ? (
          <EmptyState
            icon="users"
            title="No pending requests"
            body="New friend requests would appear here once ChessLens has a social backend."
          />
        ) : (
          <ul className="divide-y divide-slate-800/70">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={request.username} size="sm" online={request.online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-white">{request.username}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <OnlineDot online={request.online} />
                    {request.online ? "Online now" : `Last seen ${request.lastSeen}`}
                    <span className="text-slate-700">·</span>
                    <span className="font-mono text-slate-400">{request.rating}</span>
                  </p>
                </div>
                <div className="flex flex-none gap-2">
                  <button
                    type="button"
                    onClick={() => accept(request)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    <Icon name="check" size={11} />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(request)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  >
                    <Icon name="close" size={11} />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-bold text-white">
            Friends
            <span className="ml-1.5 font-mono text-[11px] font-semibold text-slate-500">
              {visibleFriends.length}
              {query.trim() ? ` of ${friends.length}` : ""}
            </span>
          </h2>
          <span className="text-[10px] text-slate-600">Online players first</span>
        </div>

        {visibleFriends.length === 0 ? (
          <Panel title="No matches">
            <EmptyState
              icon="search"
              title={`No friends match “${query.trim()}”`}
              body="Player search across ChessLens will be available once accounts can be looked up."
              action={
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
                >
                  Clear search
                </button>
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFriends.map((friend) => (
              <article
                key={friend.id}
                className="flex flex-col rounded-2xl border border-slate-800 bg-[#111A2E] p-4 transition hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={friend.username} online={friend.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-white">{friend.username}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <OnlineDot online={friend.online} />
                      <span className="truncate">{friend.online ? "Online now" : `Last seen ${friend.lastSeen}`}</span>
                    </p>
                  </div>
                  <span className="flex-none text-right">
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-600">Rating</span>
                    <span className="font-mono text-sm font-bold text-emerald-300">{friend.rating}</span>
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-800/70 pt-2.5">
                  <span className="text-[10px] text-slate-500">Member since {friend.memberSince}</span>
                  <button
                    type="button"
                    onClick={() => setSelected(friend)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-[10px] font-bold text-slate-200 transition hover:bg-slate-700 hover:text-white"
                  >
                    View profile
                    <Icon name="chevronRight" size={10} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-600">
        Accepting or rejecting requests only updates this page — there is no persistence layer for friends yet. Real
        ChessLens accounts are never mixed into this demo list.
      </p>

      {selected && <FriendDialog friend={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
