import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "chesslens_session";

// Next 16 convention: `proxy.ts` (replaces `middleware.ts`).
// Protects app routes that require a session cookie set by /api/auth/*.
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/connect/:path*", "/games/:path*", "/weaknesses/:path*", "/training/:path*"],
};
