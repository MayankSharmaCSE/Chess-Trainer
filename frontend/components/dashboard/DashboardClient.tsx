"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  email: string;
}

export default function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Not authenticated.");
        setUser(data.user);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load profile."))
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (error) {
    return (
      <p role="alert" className="text-sm font-medium text-[#9E2A21]">
        {error}{" "}
        <button type="button" onClick={() => window.location.reload()} className="underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[15px] text-[#56657A]" aria-live="polite">
        {user ? (
          <>Signed in as <span className="font-semibold text-[#13233A]">{user.username}</span> ({user.email})</>
        ) : (
          "Loading your profile..."
        )}
      </p>
      <button
        type="button"
        onClick={logout}
        className="rounded-[10px] border border-[#D5DCE4] px-4 py-2 text-sm font-semibold text-[#13233A] hover:border-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
      >
        Log out
      </button>
    </div>
  );
}
