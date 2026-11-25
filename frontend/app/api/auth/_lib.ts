export const SESSION_COOKIE = "chesslens_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, matches backend JWT_EXPIRE_DAYS

/** Shown when the backend can't be reached. In production that's usually a
 * free-tier instance waking from sleep, not a dev server that isn't started. */
export const BACKEND_DOWN_MESSAGE =
  process.env.NODE_ENV === "production"
    ? "The server is waking up or briefly unavailable. Please retry in a minute."
    : "Backend is not running. Start it on :8000 and retry.";

export function backendUrl() {
  return process.env.BACKEND_URL ?? "http://localhost:8000";
}

export function cookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/** POST JSON to a public (no session) backend auth endpoint. */
export async function postBackend(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const upstream = await fetch(`${backendUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: upstream.status, data };
  } catch {
    return null; // backend unreachable
  }
}

/** FastAPI `detail` can be a string or a list of validation errors. */
export function detailText(data: Record<string, unknown>, fallback: string): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) return String((d[0] as { msg: unknown }).msg);
  return fallback;
}
