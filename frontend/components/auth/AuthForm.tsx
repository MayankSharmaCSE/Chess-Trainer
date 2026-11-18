"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "signup" | "login";

const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(mode: Mode, fields: { username: string; identifier: string; email: string; password: string }) {
  const errors: Record<string, string> = {};
  if (mode === "signup") {
    if (!USERNAME_RE.test(fields.username.trim())) {
      errors.username = "3–30 characters: letters, numbers, _ or -.";
    }
    if (!EMAIL_RE.test(fields.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (fields.password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
  } else {
    if (!fields.identifier.trim()) errors.identifier = "Enter your username or email.";
    if (!fields.password) errors.password = "Enter your password.";
  }
  return errors;
}

const inputCls = (invalid: boolean) =>
  `w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-[15px] text-[#13233A] placeholder:text-[#8593A6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A] ${
    invalid ? "border-[#C8372D]" : "border-[#D5DCE4] hover:border-[#8593A6]"
  }`;

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(mode, { username, identifier, email, password });
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setStatus("Please fix the highlighted fields.");
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const url = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body =
        mode === "signup"
          ? { username: username.trim(), email: email.trim(), password }
          : { identifier: identifier.trim(), password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(
          data?.detail || data?.error || (res.status === 503
            ? "Backend is not running. Start it on :8000 and retry."
            : res.status === 409
              ? "That username or email is already registered."
              : res.status === 401
                ? "Invalid credentials. Try again."
                : "Something went wrong. Please retry.")
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setStatus("Network error. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby="auth-status">
      {mode === "signup" ? (
        <>
          <label htmlFor="username" className="block text-sm font-semibold">Username</label>
          <input
            id="username" name="username" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!errors.username} aria-describedby={errors.username ? "username-err" : undefined}
            className={`mt-1.5 ${inputCls(!!errors.username)}`} placeholder="carlsen_fan"
          />
          {errors.username && <p id="username-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.username}</p>}

          <label htmlFor="email" className="mt-4 block text-sm font-semibold">Email</label>
          <input
            id="email" name="email" type="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined}
            className={`mt-1.5 ${inputCls(!!errors.email)}`} placeholder="you@example.com"
          />
          {errors.email && <p id="email-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.email}</p>}
        </>
      ) : (
        <>
          <label htmlFor="identifier" className="block text-sm font-semibold">Username or email</label>
          <input
            id="identifier" name="identifier" autoComplete="username" value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-invalid={!!errors.identifier} aria-describedby={errors.identifier ? "identifier-err" : undefined}
            className={`mt-1.5 ${inputCls(!!errors.identifier)}`} placeholder="carlsen_fan"
          />
          {errors.identifier && <p id="identifier-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.identifier}</p>}
        </>
      )}

      <label htmlFor="password" className="mt-4 block text-sm font-semibold">Password</label>
      <div className="relative mt-1.5">
        <input
          id="password" name="password" type={showPw ? "text" : "password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-err" : undefined}
          className={`${inputCls(!!errors.password)} pr-20`} placeholder="••••••••"
        />
        <button
          type="button" onClick={() => setShowPw((v) => !v)}
          aria-pressed={showPw}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[8px] px-2.5 py-1 text-sm font-semibold text-[#56657A] hover:text-[#13233A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#13233A]"
        >
          {showPw ? "Hide" : "Show"}
        </button>
      </div>
      {errors.password && <p id="password-err" className="mt-1.5 text-sm text-[#9E2A21]">{errors.password}</p>}

      <p id="auth-status" role="status" aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm font-medium text-[#9E2A21]">
        {status}
      </p>

      <button
        type="submit" disabled={pending}
        className="mt-2 w-full rounded-[10px] bg-[#13233A] px-5 py-3 text-[16px] font-semibold text-white hover:bg-[#223857] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13233A] disabled:opacity-60"
      >
        {pending ? (mode === "signup" ? "Creating account..." : "Signing in...") : mode === "signup" ? "Create account" : "Log in"}
      </button>

      <p className="mt-4 text-center text-sm text-[#56657A]">
        {mode === "signup" ? (
          <>Already have an account? <Link href="/login" className="font-semibold text-[#13233A] underline underline-offset-2">Log in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="font-semibold text-[#13233A] underline underline-offset-2">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
