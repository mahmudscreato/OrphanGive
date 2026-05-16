// Session 51 — Admin login form (client island).
//
// Mirror of DiLoginForm. Posts to /api/admin/login (existing
// Session 46-fix-2 endpoint), maps the three error codes to friendly
// copy, redirects to /admin on success.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-2";

function friendlyError(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "not_admin":
      return "This account isn't an admin. Contact support if you think this is wrong.";
    case "bad_request":
      return "Please enter a valid email and password.";
    default:
      return "Could not sign in. Try again.";
  }
}

export function AdminLoginForm() {
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
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data: { ok?: boolean; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !data.ok) {
          setError(friendlyError(data.error));
          return;
        }
        router.push("/admin");
        // The (authed) layout re-runs on the next render with the
        // freshly-set cookies — this refresh ensures the server
        // component sees them.
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
