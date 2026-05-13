"use client";

// Session 24 — brand pass for the SignInForm. Visual chrome only:
// inputs use the rounded-xl + tangerine-focus pattern from the
// rest of the auth-page family; submit is now an OG-orange pill;
// the existing "Forgot password?" link next to the password label
// (which already linked to /forgot-password) is preserved.
//
// Wiring unchanged — still calls `signInAction` via useActionState
// from (auth)/actions.ts.

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type AuthFormState } from "../(auth)/actions";

const initialState: AuthFormState = {};

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signInAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13.5px] text-ink-soft">
        <div className="flex items-center justify-between">
          <span>Password</span>
          <Link
            href="/forgot-password"
            className="text-xs text-ink-soft hover:text-tangerine-deep transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-base text-ink placeholder:text-ink-soft/70 focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine/20 transition-all duration-200"
        />
      </label>
      {state.error ? (
        <p
          role="alert"
          className="text-[13px] text-[#A02B2B] -mt-1"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-orange-solid text-ink font-body font-semibold py-3 px-7 text-base transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {pending ? "Signing in…" : (
          <>
            Sign in
            <span
              aria-hidden="true"
              className="inline-block transition-transform duration-200 group-hover:translate-x-1"
            >
              →
            </span>
          </>
        )}
      </button>
    </form>
  );
}
