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
// Sentry integration: when @sentry/nextjs is installed (deferred
// until Mahmud provisions a DSN), it auto-instruments React error
// boundaries to capture the error. Until then, we log to the
// browser console for dev diagnostics. The explicit `useEffect`
// guard means our manual capture call doesn't fire on SSR (where
// `window.Sentry` doesn't exist).

import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function RouteError({ error, reset }: Props) {
  useEffect(() => {
    // Always log so developers can see something in the browser
    // console even before Sentry is set up. The `digest` is Next's
    // hash of the error stack — useful when correlating against
    // production-only React Server Component errors.
    // eslint-disable-next-line no-console
    console.error("[route-error]", error.digest ?? error.message, error);

    // Sentry-ready hook. After `npm install @sentry/nextjs` + DSN
    // configuration, the SDK's automatic instrumentation will
    // capture this without our manual call. We leave the manual
    // window.Sentry path as a fallback for the case where the SDK
    // is installed but auto-instrumentation didn't catch this
    // particular boundary (e.g. a typo in a config file).
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        Sentry?: { captureException?: (e: unknown) => void };
      };
      try {
        w.Sentry?.captureException?.(error);
      } catch {
        // Defensive — never let an error reporter break the error
        // boundary itself.
      }
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
            href="mailto:hello@orphangive.org"
            className="text-tangerine-deeper underline-offset-4 hover:underline"
          >
            hello@orphangive.org
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
