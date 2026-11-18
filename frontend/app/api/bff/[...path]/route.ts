import { NextResponse, type NextRequest } from "next/server";
import { backendUrl, SESSION_COOKIE } from "../../auth/_lib";

/** Generic Backend-for-Frontend proxy: /api/bff/<path...> -> <backend>/api/<path...>.
 * Attaches the session cookie as a Bearer token. Auth cookie handling
 * (set/clear) stays in app/api/auth/* routes.
 */
async function forward(request: NextRequest, path: string[]) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const url = `${backendUrl()}/api/${path.join("/")}${request.nextUrl.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) init.body = text;
  }
  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch {
    return NextResponse.json(
      { error: "Backend is not running. Start it on :8000 and retry." },
      { status: 503 }
    );
  }
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return forward(request, (await ctx.params).path);
}
