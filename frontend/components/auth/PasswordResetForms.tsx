"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const inputCls = (invalid: boolean) =>
  `w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-[15px] text-[#13233A] placeholder:text-[#8593A6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] ${
    invalid ? "border-[#C8372D]" : "border-[#D5DCE4] hover:border-[#8593A6]"
  }`;

const primaryBtn =
  "mt-2 w-full rounded-[10px] bg-[#13233A] px-5 py-3 text-[16px] font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:opacity-60";

const linkCls = "font-semibold text-[#13233A] underline underline-offset-2";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) {
      setError("Enter your email or username.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { ok, data } = await postJson("/api/auth/forgot-password", { identifier: identifier.trim() });
      if (!ok) {
        setError(String(data.error ?? "Could not send the reset email. Please retry."));
        return;
      }
      setSentMessage(String(data.message ?? "If an account matches, we've emailed a reset link."));
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  if (sentMessage) {
    return (
      <div role="status" aria-live="polite">
        <div className="rounded-[12px] border border-[#BFD8C6] bg-[#EEF7F0] p-4 text-[15px] leading-relaxed text-[#1F5130]">
          <p className="font-semibold">Check your email</p>
          <p className="mt-1">{sentMessage}</p>
        </div>
        <p className="mt-4 text-sm text-[#56657A]">
          Didn&apos;t get it after a few minutes?{" "}
          <button type="button" onClick={() => setSentMessage(null)} className={linkCls}>
            Try again
          </button>
        </p>
        <p className="mt-4 text-center text-sm text-[#56657A]">
          <Link href="/login" className={linkCls}>Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby="forgot-status">
      <label htmlFor="identifier" className="block text-sm font-semibold">Email or username</label>
      <input
        id="identifier" name="identifier" autoComplete="username" value={identifier} autoFocus
        onChange={(e) => setIdentifier(e.target.value)}
        aria-invalid={!!error}
        className={`mt-1.5 ${inputCls(!!error)}`} placeholder="you@example.com"
      />
      <p className="mt-2 text-sm text-[#56657A]">
        We&apos;ll email a link to set a new password. The email also tells you your username.
      </p>
      <p id="forgot-status" role="status" aria-live="polite" className="mt-3 min-h-[1.25rem] text-sm font-medium text-[#9E2A21]">
        {error}
      </p>
      <button type="submit" disabled={pending} className={primaryBtn}>
        {pending ? "Sending..." : "Send reset link"}
      </button>
      <p className="mt-4 text-center text-sm text-[#56657A]">
        Remembered it? <Link href="/login" className={linkCls}>Log in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">(token ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Tell the user up front if the link is dead, before they type anything.
  useEffect(() => {
    if (!token) return;
    let live = true;
    postJson("/api/auth/reset-password/check", { token })
      .then(({ data }) => {
        if (!live) return;
        // null = couldn't check (backend down): let them try; submit reports the real error.
        setLinkState(data.valid === false ? "invalid" : "valid");
      })
      .catch(() => live && setLinkState("valid"));
    return () => {
      live = false;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    else if (password.length > 72) errs.password = "Password must be at most 72 characters.";
    if (confirm !== password) errs.confirm = "Passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setStatus("Please fix the highlighted fields.");
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const { ok, data } = await postJson("/api/auth/reset-password", { token, password });
      if (!ok) {
        const msg = String(data.error ?? "Could not reset the password. Please retry.");
        if (/invalid or has expired/i.test(msg)) setLinkState("invalid");
        setStatus(msg);
        return;
      }
      router.push("/login?reset=1");
    } catch {
      setStatus("Network error. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  if (linkState === "checking") {
    return <p className="text-sm text-[#56657A]" role="status">Checking your reset link...</p>;
  }

  if (linkState === "invalid") {
    return (
      <div role="alert">
        <div className="rounded-[12px] border border-[#E8C4C0] bg-[#FBEFEE] p-4 text-[15px] leading-relaxed text-[#7A231B]">
          <p className="font-semibold">This reset link has expired or was already used</p>
          <p className="mt-1">Links work once and expire after 30 minutes. Only the newest email&apos;s link works.</p>
        </div>
        <Link href="/forgot-password" className={`${primaryBtn} mt-5 block text-center`}>
          Send a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby="reset-status">
      <label htmlFor="password" className="block text-sm font-semibold">New password</label>
      <div className="relative mt-1.5">
        <input
          id="password" name="password" type={showPw ? "text" : "password"} autoComplete="new-password" autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-err" : "password-hint"}
          className={`${inputCls(!!errors.password)} pr-20`} placeholder="At least 8 characters"
        />
        <button
          type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[8px] px-2.5 py-1 text-sm font-semibold text-[#56657A] hover:text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
        >
          {showPw ? "Hide" : "Show"}
        </button>
      </div>
      {errors.password ? (
        <p id="password-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.password}</p>
      ) : (
        <p id="password-hint" className="mt-1.5 text-sm text-[#56657A]">At least 8 characters.</p>
      )}

      <label htmlFor="confirm" className="mt-4 block text-sm font-semibold">Confirm new password</label>
      <input
        id="confirm" name="confirm" type={showPw ? "text" : "password"} autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "confirm-err" : undefined}
        className={`mt-1.5 ${inputCls(!!errors.confirm)}`} placeholder="Type it again"
      />
      {errors.confirm && <p id="confirm-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.confirm}</p>}

      <p id="reset-status" role="status" aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm font-medium text-[#9E2A21]">
        {status}
      </p>
      <button type="submit" disabled={pending} className={primaryBtn}>
        {pending ? "Saving..." : "Set new password"}
      </button>
      <p className="mt-3 text-center text-sm text-[#56657A]">
        This signs you out on every other device.
      </p>
    </form>
  );
}
