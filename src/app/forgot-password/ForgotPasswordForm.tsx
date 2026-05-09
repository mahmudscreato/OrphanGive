"use client";

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
      <div className="rounded-[18px] bg-tangerine-mist/40 border border-tangerine-soft px-5 py-5">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-2">
          Check your inbox
        </div>
        <p className="text-[15px] text-ink leading-[1.65] m-0">
          If <strong>{email}</strong> is registered, you&rsquo;ll receive
          a password reset link within a few minutes. Check your inbox
          and spam folder.
        </p>
        <p className="mt-4 text-[13.5px] text-slate-soft leading-[1.6] m-0">
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
          className="mt-5 inline-flex items-center text-[13.5px] text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5 hover:opacity-80"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13.5px] text-slate">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        disabled={pending || !email.trim()}
        className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-cream px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link
        href="/signin"
        className="self-start text-[13px] text-slate-soft hover:text-tangerine-deep transition-colors"
      >
        ← Back to sign in
      </Link>
    </form>
  );
}
