"use client";

// Route-level error boundary (Session 15b2). Next.js mounts this
// when a Server or Client Component throws during render of any
// `/` route. The SiteNav + SiteFooter from the root layout remain
// visible — only the broken route's children swap to this fallback.
//
// For the WHOLE-app-on-fire case (root layout itself throws),
// see src/app/global-error.tsx which is rendered without the root
// layout wrapping it.
//
// Sentry integration (Session 21): @sentry/nextjs is installed
// and `Sentry.captureException` is a safe no-op until the DSN
// env vars are set. Calling it unconditionally keeps the
// boundary identical pre- and post-DSN — when Mahmud wires the
// DSN, errors flow without any code change here.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    // Always log so developers see something in the browser
    // console even before Sentry is active. The `digest` is Next's
    // hash of the error stack — useful when correlating against
    // production-only React Server Component errors.
    // eslint-disable-next-line no-console
    console.error("[route-error]", error.digest ?? error.message, error);

    // The SDK auto-instruments error boundaries when initialised,
    // so this is belt-and-braces. Wrapped in try/catch so a
    // misconfigured reporter can never break the boundary itself.
    try {
      Sentry.captureException(error);
    } catch {
      /* never let the reporter break the boundary */
    }
  }, [error]);

  return (
    <section className="min-h-[60vh] flex items-center justify-center px-6 py-16 bg-cream">
      <div className="max-w-[520px] text-center">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-3">
          Something went wrong
        </div>
        <h1 className="font-display text-[36px] text-ink leading-[1.1] tracking-[-0.02em] m-0 max-md:text-[28px]">
          We hit an unexpected error
        </h1>
        <p className="mt-5 text-[16px] text-slate leading-[1.65]">
          The team has been notified. You can try the page again, or
          drop us a note at{" "}
          <a
            href="mailto:support@orphangive.org"
            className="text-tangerine-deeper underline-offset-4 hover:underline"
          >
            support@orphangive.org
          </a>
          .
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-[11px] tracking-[0.08em] text-slate-soft">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center font-body font-medium text-[14px] text-slate hover:text-tangerine-deeper transition-colors border-b-[1.5px] border-ink/[0.2] hover:border-tangerine pb-0.5"
          >
            Back to home
          </a>
        </div>
      </div>
    </section>
  );
}
