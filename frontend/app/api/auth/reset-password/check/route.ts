import { NextResponse } from "next/server";
import { postBackend } from "../../_lib";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const res = await postBackend("/api/auth/reset-password/check", { token: body.token ?? "" });
  // Unreachable backend or malformed token: let the form try and report the real error.
  if (!res) return NextResponse.json({ valid: null }, { status: 503 });
  return NextResponse.json({ valid: res.status === 200 ? Boolean(res.data.valid) : false });
}
