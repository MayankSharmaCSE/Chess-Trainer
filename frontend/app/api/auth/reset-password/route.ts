import { NextResponse } from "next/server";
import { BACKEND_DOWN_MESSAGE, detailText, postBackend } from "../_lib";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const token = body.token ?? "";
  const password = body.password ?? "";
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const res = await postBackend("/api/auth/reset-password", { token, password });
  if (!res) return NextResponse.json({ error: BACKEND_DOWN_MESSAGE }, { status: 503 });
  if (res.status >= 400) {
    return NextResponse.json({ error: detailText(res.data, "Could not reset the password. Please retry.") }, { status: res.status });
  }
  return NextResponse.json({ ok: true, username: res.data.username });
}
