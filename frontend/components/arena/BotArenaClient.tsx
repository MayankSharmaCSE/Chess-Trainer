"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Bot, ApiError } from "@/lib/bff";
import BotAvatar, { getDifficultyBadgeStyle } from "./BotAvatar";

const DIFFICULTY_TABS = ["All", "Easy", "Intermediate", "Hard", "Expert"] as const;

export default function BotArenaClient() {
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Setup options
  const [selectedColor, setSelectedColor] = useState<"white" | "random" | "black">("white");
  const [timeControl, setTimeControl] = useState<string>("10+0");
  const [activeTab, setActiveTab] = useState<(typeof DIFFICULTY_TABS)[number]>("All");
  const [startingBotId, setStartingBotId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<Bot[]>("bots")
      .then((data) => {
        if (active) {
          setBots(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load AI bots.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleStartGame(botId: string) {
    setStartingBotId(botId);
    setError(null);

    try {
      const game = await api<{ id: number }>("bots/game/create", {
        method: "POST",
        body: {
          bot_id: botId,
          player_color: selectedColor,
          time_control: timeControl,
        },
      });
      router.push(`/bots/game/${game.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create game. Make sure the backend server is running."
      );
      setStartingBotId(null);
    }
  }

  // Filter bots by difficulty tab
  const filteredBots = bots.filter((bot) => {
    if (activeTab === "All") return true;
    if (activeTab === "Easy") return bot.difficulty.includes("Easy");
    if (activeTab === "Intermediate") return bot.difficulty.includes("Intermediate");
    if (activeTab === "Hard") return bot.difficulty.includes("Hard");
    if (activeTab === "Expert") return bot.difficulty.includes("Expert");
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/dashboard" className="transition hover:text-slate-200">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-200">AI Bot Arena</span>
      </div>

      {/* Header Banner */}
      <div className="mt-4 flex flex-col justify-between gap-6 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-[#131F32] to-[#0A101D] p-6 sm:p-8 lg:flex-row lg:items-center shadow-2xl">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Stockfish 16 Engine Powered
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            AI Chess Bot Arena
          </h1>
          <p className="mt-2 text-base text-slate-300">
            Test your skills against calibrated AI personalities from Beginner (400) to Grandmaster (2000).
            Play in real-time, hone your strategy, and analyze your performance with Stockfish.
          </p>
        </div>

        {/* Global Match Settings Controls */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5 shadow-lg">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Your Color
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedColor("white")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-bold transition ${
                  selectedColor === "white"
                    ? "border-sky-500 bg-sky-500/20 text-white shadow-[0_0_12px_rgba(14,165,233,0.3)]"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-white border border-slate-400" />
                White
              </button>
              <button
                type="button"
                onClick={() => setSelectedColor("random")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-bold transition ${
                  selectedColor === "random"
                    ? "border-purple-500 bg-purple-500/20 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-gradient-to-r from-white to-slate-900 border border-slate-400" />
                Random
              </button>
              <button
                type="button"
                onClick={() => setSelectedColor("black")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-bold transition ${
                  selectedColor === "black"
                    ? "border-slate-400 bg-slate-800 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <span className="h-3 w-3 rounded-full bg-slate-900 border border-slate-500" />
                Black
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Clock Speed
            </label>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[
                { label: "10m", value: "10+0" },
                { label: "5m", value: "5+0" },
                { label: "3m", value: "3+0" },
                { label: "∞", value: "unlimited" },
              ].map((tc) => (
                <button
                  key={tc.value}
                  type="button"
                  onClick={() => setTimeControl(tc.value)}
                  className={`rounded-lg border py-1.5 px-2 text-xs font-semibold transition ${
                    timeControl === tc.value
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                      : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-300">
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Difficulty Filter Tabs */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {DIFFICULTY_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                activeTab === tab
                  ? "bg-slate-800 text-white shadow-md border border-slate-700"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              {tab} Opponents
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="font-bold text-slate-200">{filteredBots.length}</span> of{" "}
          <span className="font-bold text-slate-200">{bots.length}</span> bots
        </div>
      </div>

      {/* Bot Cards Grid */}
      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-3xl border border-slate-800/80 bg-slate-900/60 p-6"
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredBots.map((bot) => {
            const badge = getDifficultyBadgeStyle(bot.difficulty);
            const isStarting = startingBotId === bot.id;

            return (
              <div
                key={bot.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800 bg-[#111A2E]/90 p-6 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-black/60"
              >
                {/* Header row: Avatar, Name, Rating, Badge */}
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <BotAvatar id={bot.id} name={bot.name} size="lg" />
                      <div>
                        <h3 className="font-display text-lg font-bold text-white group-hover:text-sky-300 transition-colors">
                          {bot.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-sm font-extrabold text-amber-300">
                            ~{bot.rating}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">Rating</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {bot.difficulty}
                    </span>
                  </div>

                  {/* Personality Description */}
                  <p className="mt-4 text-sm leading-relaxed text-slate-300 min-h-[4rem]">
                    {bot.description}
                  </p>
                </div>

                {/* Footer action button */}
                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Depth: <span className="font-semibold text-slate-300">{bot.depth}</span>
                  </div>

                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => handleStartGame(bot.id)}
                    className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 transition-all hover:bg-emerald-500 hover:shadow-emerald-900/60 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isStarting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <span>Play</span>
                        <span className="text-base leading-none">⚔</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
