"use client";

// Session 24 — brand pass: pill-shaped OG-orange CTA, refined
// input chrome (rounded-2xl + tangerine focus ring), tighter
// success-state copy aligned with the public surfaces. No
// behavioural change to the submit logic — still POSTs to
// /api/auth/forgot-password which proxies to Directus.

import Link from "next/link";
import { useState, useTransition } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        // Always shows the success state regardless of response —
        // prevents account enumeration. The route returns 200 even
        // for unknown emails. We surface a generic error only if
        // the network call itself fails.
        const r = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
          cache: "no-store",
        });
        if (!r.ok) {
          setError("Something went wrong. Please try again in a moment.");
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
      <div className="rounded-3xl bg-orange-pale/60 border border-tangerine-soft px-6 py-6">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-2">
          Check your inbox
        </div>
        <p className="text-[15px] text-ink leading-[1.65] m-0">
          If <strong>{email}</strong> is registered, you&rsquo;ll receive
          a password reset link within a few minutes. Check your inbox
          and spam folder.
        </p>
        <p className="mt-4 text-[13.5px] text-ink-soft leading-[1.6] m-0">
          The link expires in 1 hour. If you don&rsquo;t see the email,{" "}
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
            }}
            className="text-tangerine-deep underline-offset-4 hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link
          href="/signin"
          className="mt-5 inline-flex items-center text-[13.5px] text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine pb-0.5 transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        disabled={pending || !email.trim()}
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-ink font-body font-semibold py-3 px-7 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending ? "Sending…" : (
          <>
            Send reset link
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
