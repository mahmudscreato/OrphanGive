"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type Props = { token: string };

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
          cache: "no-store",
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!r.ok || !j.ok) {
          setError(
            j.error ??
              "We couldn't reset your password. The link may have expired or already been used.",
          );
          return;
        }
        setSubmitted(true);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-[18px] bg-moss-soft/60 border border-moss/30 px-5 py-5">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-moss-deep mb-2">
          Password updated
        </div>
        <p className="text-[15px] text-ink leading-[1.65] m-0">
          Your password has been changed. You can now sign in with
          your new password.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep"
        >
          Go to sign in →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13.5px] text-slate">
        <span>New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          className="rounded-[10px] border border-ink/[0.16] bg-white px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13.5px] text-slate">
        <span>Confirm password</span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={pending}
          className="rounded-[10px] border border-ink/[0.16] bg-white px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
        />
      </label>
      {error ? (
        <p
          role="alert"
          className="text-[13px] text-[#A02B2B] -mt-1"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !password || !confirm}
        className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
      <Link
        href="/signin"
        className="self-start text-[13px] text-slate-soft hover:text-tangerine-deeper transition-colors"
      >
        ← Back to sign in
      </Link>
    </form>
  );
}
