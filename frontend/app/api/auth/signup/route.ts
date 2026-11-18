import { NextResponse } from "next/server";
import { backendUrl, cookieOptions, SESSION_COOKIE } from "../_lib";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { username?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "3–30 characters: letters, numbers, _ or -." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
  } catch {
    return NextResponse.json(
      { error: "Backend is not running. Start it on :8000 and retry." },
      { status: 503 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const status = upstream.status === 409 ? 409 : upstream.status === 422 ? 400 : upstream.status;
    return NextResponse.json(
      { error: data?.detail ?? "Signup failed. Please retry." },
      { status }
    );
  }

  const res = NextResponse.json({ user: data.user }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, data.access_token, cookieOptions());
  return res;
}
