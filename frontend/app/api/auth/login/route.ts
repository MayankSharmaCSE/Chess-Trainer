import { NextResponse } from "next/server";
import { backendUrl, cookieOptions, SESSION_COOKIE } from "../_lib";

export async function POST(request: Request) {
  let body: { identifier?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const identifier = (body.identifier ?? "").trim();
  const password = body.password ?? "";
  if (!identifier) {
    return NextResponse.json({ error: "Enter your username or email." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
  } catch {
    return NextResponse.json(
      { error: "Backend is not running. Start it on :8000 and retry." },
      { status: 503 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstream.status === 401 ? "Invalid credentials. Try again." : (data?.detail ?? "Login failed. Please retry.") },
      { status: upstream.status }
    );
  }

  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, data.access_token, cookieOptions());
  return res;
}
