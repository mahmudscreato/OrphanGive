// Session 42 — DI Dashboard login form (client island).
//
// Lifted out of page.tsx so the wrapping page can stay a server
// component (cheaper SEO + faster TTFB on the login screen). The
// form itself needs client-side state for the loading spinner +
// error display.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-2";

export function DiLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/di/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Could not sign in. Try again.");
          return;
        }
        router.push("/di");
        // router.refresh() so the (authed) layout re-fetches with the
        // fresh cookies set by the API route.
        router.refresh();
      } catch {
        setError("Network error. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          className={inputClass}
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <div
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-3 text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
