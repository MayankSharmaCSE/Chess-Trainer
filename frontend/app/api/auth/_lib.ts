export const SESSION_COOKIE = "chesslens_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, matches backend JWT_EXPIRE_DAYS

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
