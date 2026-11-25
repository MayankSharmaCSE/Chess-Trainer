import { NextResponse, type NextRequest } from "next/server";
import { BACKEND_DOWN_MESSAGE, backendUrl, SESSION_COOKIE } from "../_lib";

export async function GET(request: NextRequest) {
  const bearer = request.cookies.get(SESSION_COOKIE)?.value;

  if (!bearer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const base = backendUrl();
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: BACKEND_DOWN_MESSAGE },
      { status: 503 }
    );
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ user: data });
}
