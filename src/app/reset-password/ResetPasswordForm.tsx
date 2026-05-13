"use client";

// Session 24 — brand pass: pill CTA, refined inputs, basic
// strength indicator on the password field. The 8-char minimum
// + match-validation logic is unchanged; the server-side
// /api/auth/reset-password proxies to Directus which is the
// authoritative validator (rules per Directus user policy).
//
// Strength indicator is purely visual feedback — it does NOT
// block submission on weak passwords; Directus enforces the
// real rule. The cap at "good" prevents a misleading "strong"
// label that would imply Directus accepted a longer password
// when it didn't necessarily.

import Link from "next/link";
import { useState, useTransition } from "react";

type Props = { token: string };

type Strength = "empty" | "weak" | "fair" | "good";

function gradePassword(p: string): Strength {
  if (p.length === 0) return "empty";
  if (p.length < 8) return "weak";
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit = /\d/.test(p);
  const hasMix = /[^a-zA-Z0-9]/.test(p) || (hasLetter && hasDigit);
  if (hasLetter && hasDigit && p.length >= 10 && hasMix) return "good";
  if (hasLetter && hasDigit) return "fair";
  return "weak";
}

const STRENGTH_META: Record<Strength, { label: string; tone: string }> = {
  empty: { label: "", tone: "" },
  weak: { label: "Weak", tone: "bg-[#A02B2B]" },
  fair: { label: "Fair", tone: "bg-tangerine" },
  good: { label: "Good", tone: "bg-moss" },
};

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const strength = gradePassword(password);

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
      <div className="rounded-3xl bg-moss-soft/60 border border-moss/30 px-6 py-6">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-moss-deep mb-2">
          Password updated
        </div>
        <p className="text-[15px] text-ink leading-[1.65] m-0">
          Your password has been changed. You can now sign in with
          your new password.
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-ink font-body font-semibold py-3 px-6 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px"
        >
          Go to sign in
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
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
          className="rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
        />
        {strength !== "empty" ? (
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-ink/[0.06] overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${STRENGTH_META[strength].tone}`}
                style={{
                  width:
                    strength === "weak"
                      ? "33%"
                      : strength === "fair"
                        ? "66%"
                        : "100%",
                }}
              />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
              {STRENGTH_META[strength].label}
            </span>
          </div>
        ) : null}
      </label>
      <label className="flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
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
          className="rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
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
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-ink font-body font-semibold py-3 px-7 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending ? "Updating…" : (
          <>
            Update password
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </>
        )}
      </button>
      <Link
        href="/signin"
        className="self-start text-[13px] text-ink-soft hover:text-tangerine-deep transition-colors"
      >
        ← Back to sign in
      </Link>
    </form>
  );
}
