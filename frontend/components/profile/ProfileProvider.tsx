"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type ConnectedAccount,
  type GameSummary,
  type ProgressReport,
  type TrainingStats,
} from "@/lib/bff";
import type { Taxonomy } from "@/lib/endgame";

export interface ProfileUser {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface ProfileData {
  user: ProfileUser;
  accounts: ConnectedAccount[];
  games: GameSummary[];
  totalGames: number;
  progress: ProgressReport | null;
  training: TrainingStats | null;
  taxonomy: Taxonomy | null;
}

type ProfileStatus = "loading" | "ready" | "unauth" | "error";

interface ProfileContextValue {
  status: ProfileStatus;
  error: string | null;
  data: ProfileData | null;
  reload: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

type LoadOutcome =
  | { kind: "ready"; data: ProfileData }
  | { kind: "unauth" }
  | { kind: "error"; message: string };

/**
 * Loads the authenticated player's real data once for every profile tab.
 * The layout keeps this provider mounted, so switching tabs does not refetch.
 */
export default function ProfileProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileData | null>(null);

  const loadProfile = useCallback(async (): Promise<LoadOutcome> => {
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = await meRes.json().catch(() => ({}));
      if (!meRes.ok) {
        if (meRes.status === 401) return { kind: "unauth" };
        throw new Error(meData?.error ?? "Could not load your profile.");
      }
      const user = meData.user as ProfileUser | undefined;
      if (!user) throw new Error("Could not load your profile.");

      const [accounts, games, progress, training, taxonomy] = await Promise.allSettled([
        api<ConnectedAccount[]>("accounts"),
        api<{ games: GameSummary[]; total: number }>("games?limit=100"),
        api<ProgressReport>("progress"),
        api<TrainingStats>("training/stats"),
        api<Taxonomy>("endgame/taxonomy"),
      ]);

      return {
        kind: "ready",
        data: {
          user,
          accounts: accounts.status === "fulfilled" ? accounts.value : [],
          games: games.status === "fulfilled" ? games.value.games : [],
          totalGames: games.status === "fulfilled" ? games.value.total : 0,
          progress: progress.status === "fulfilled" ? progress.value : null,
          training: training.status === "fulfilled" ? training.value : null,
          taxonomy: taxonomy.status === "fulfilled" ? taxonomy.value : null,
        },
      };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "Could not load your profile.",
      };
    }
  }, []);

  const applyOutcome = useCallback((outcome: LoadOutcome) => {
    if (outcome.kind === "ready") {
      setData(outcome.data);
      setStatus("ready");
      return;
    }
    if (outcome.kind === "unauth") {
      setStatus("unauth");
      return;
    }
    setError(outcome.message);
    setStatus("error");
  }, []);

  const reload = useCallback(() => {
    setError(null);
    setStatus("loading");
    void loadProfile().then(applyOutcome);
  }, [loadProfile, applyOutcome]);

  useEffect(() => {
    let active = true;
    void loadProfile().then((outcome) => {
      if (active) applyOutcome(outcome);
    });
    return () => {
      active = false;
    };
  }, [loadProfile, applyOutcome]);

  return (
    <ProfileContext.Provider value={{ status, error, data, reload }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

/** For components rendered only after the shell's ready gate. */
export function useProfileData(): ProfileData {
  const { data } = useProfile();
  if (!data) throw new Error("Profile data is not ready yet");
  return data;
}
