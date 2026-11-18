"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, platformLabel, type ConnectedAccount, ApiError } from "@/lib/bff";

export default function ConnectClient() {
  const [platform, setPlatform] = useState<"chesscom" | "lichess">("chesscom");
  const [username, setUsername] = useState("");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  async function load() {
    try {
      setAccounts(await api<ConnectedAccount[]>("accounts"));
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Failed to load accounts.");
    }
  }

  useEffect(() => {
    api<ConnectedAccount[]>("accounts")
      .then(setAccounts)
      .catch((e) => setStatus(e instanceof ApiError ? e.message : "Failed to load accounts."));
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (name.length < 2) {
      setStatus("Enter your platform username (at least 2 characters).");
      return;
    }
    setConnecting(true);
    setStatus(null);
    try {
      await api("accounts/connect", { method: "POST", body: { platform, username: name } });
      setUsername("");
      setStatus(`Connected ${name} on ${platformLabel(platform)}. Now sync your games.`);
      await load();
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Connection failed. Retry.");
    } finally {
      setConnecting(false);
    }
  }

  async function sync(id: number) {
    setSyncingId(id);
    setStatus(null);
    try {
      const r = await api<{ imported: number; skipped: number; total: number }>(
        `accounts/${id}/sync?max_games=50`,
        { method: "POST" }
      );
      setStatus(`Sync complete: ${r.imported} new, ${r.skipped} already saved (${r.total} total).`);
      await load();
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Sync failed. Retry.");
    } finally {
      setSyncingId(null);
    }
  }

  async function disconnect(id: number) {
    try {
      await api(`accounts/${id}`, { method: "DELETE" });
      setStatus("Account disconnected. Imported games are kept.");
      await load();
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Disconnect failed. Retry.");
    }
  }

  return (
    <div className="grid gap-6">
      <form
        onSubmit={connect}
        className="rounded-[18px] border border-[#D5DCE4] bg-white p-5 sm:p-6"
      >
        <h2 className="font-semibold">Connect a platform account</h2>
        <p className="mt-1 text-sm text-[#56657A]">
          Only your public username is needed — never your Chess.com or Lichess password.
        </p>
        <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Platform">
          {(["chesscom", "lichess"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={platform === p}
              onClick={() => setPlatform(p)}
              className={`rounded-[10px] border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] ${
                platform === p
                  ? "border-[#13233A] bg-[#13233A] text-white"
                  : "border-[#D5DCE4] text-[#13233A] hover:border-[#13233A]"
              }`}
            >
              {platformLabel(p)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="platform-username" className="sr-only">
            {platformLabel(platform)} username
          </label>
          <input
            id="platform-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={`${platformLabel(platform)} username`}
            autoComplete="username"
            className="w-full rounded-[10px] border border-[#D5DCE4] bg-white px-3.5 py-2.5 text-[15px] placeholder:text-[#8593A6] hover:border-[#8593A6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
          />
          <button
            type="submit"
            disabled={connecting}
            className="shrink-0 rounded-[10px] bg-[#13233A] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:opacity-60"
          >
            {connecting ? "Checking..." : "Connect"}
          </button>
        </div>
      </form>

      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm font-medium text-[#3B4B62]">
        {status}
      </p>

      {accounts.length === 0 ? (
        <div className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
          <p className="font-semibold">No accounts connected</p>
          <p className="mt-1 text-sm text-[#56657A]">
            Connect your Chess.com or Lichess username above to start syncing games.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-[12px] border border-[#D5DCE4] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {a.username} <span className="font-normal text-[#56657A]">· {platformLabel(a.platform)}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-[#56657A]">
                    {a.game_count} games saved
                    {a.last_synced_at ? ` · last synced ${new Date(a.last_synced_at).toLocaleString()}` : " · never synced"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={syncingId !== null}
                    onClick={() => sync(a.id)}
                    className="rounded-[10px] bg-[#13233A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:opacity-60"
                  >
                    {syncingId === a.id ? "Syncing games..." : "Sync now"}
                  </button>
                  <Link
                    href="/games"
                    className="rounded-[10px] border border-[#D5DCE4] px-4 py-2 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
                  >
                    View games
                  </Link>
                  <button
                    type="button"
                    onClick={() => disconnect(a.id)}
                    className="rounded-[10px] px-3 py-2 text-sm font-semibold text-[#56657A] hover:text-[#9E2A21] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
