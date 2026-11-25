import { NextResponse } from "next/server";
import { BACKEND_DOWN_MESSAGE, detailText, postBackend } from "../_lib";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { identifier?: string };
  const identifier = (body.identifier ?? "").trim();
  if (!identifier) {
    return NextResponse.json({ error: "Enter your email or username." }, { status: 400 });
  }
  const res = await postBackend("/api/auth/forgot-password", { identifier });
  if (!res) return NextResponse.json({ error: BACKEND_DOWN_MESSAGE }, { status: 503 });
  if (res.status >= 400) {
    return NextResponse.json({ error: detailText(res.data, "Could not send the reset email. Please retry.") }, { status: res.status });
  }
  return NextResponse.json({ message: res.data.message });
}
