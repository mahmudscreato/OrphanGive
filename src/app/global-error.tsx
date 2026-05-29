"use client";

// Root-level error boundary (Session 15b2). Next.js mounts this
// ONLY when the root layout itself throws — error.tsx (route-level)
// can't catch a broken root layout because it's rendered INSIDE
// the layout. global-error.tsx renders without the layout wrapping
// it, which means we must emit our own <html> + <body> tags here.
//
// Triggered cases:
//   - Root layout's metadata or font loading throws
//   - The provider tree wrapping the app crashes (e.g. ToastProvider,
//     auth context, etc.)
//   - A server module that the layout imports fails at module load
//
// In any of those cases the user sees a complete-app failure, so
// keep this fallback bare-bones: no font helpers, no shared
// components, no Tailwind utility classes that depend on the root
// stylesheet being injected (which it isn't here). Inline styles
// only, system fonts only.

// Sentry integration (Session 21): same pattern as error.tsx.
// `captureException` is a no-op when the DSN env var is unset, so
// we call it unconditionally.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", error.digest ?? error.message, error);
    try {
      Sentry.captureException(error);
    } catch {
      /* never let the reporter break the boundary */
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          backgroundColor: "#FFFAF2",
          color: "#2A2A2C",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <div
            style={{
              fontFamily:
                '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#D17424",
              marginBottom: 12,
            }}
          >
            OrphanGive is briefly unavailable
          </div>
          <h1
            style={{
              fontFamily:
                'Georgia, "Times New Roman", "Times", serif',
              fontSize: 36,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: 0,
              fontWeight: 500,
            }}
          >
            Something went wrong on our end
          </h1>
          <p
            style={{
              marginTop: 20,
              fontSize: 16,
              lineHeight: 1.65,
              color: "#4D4D52",
            }}
          >
            Try reloading the page in a moment. If it persists, send a
            note to{" "}
            <a
              href="mailto:support@orphangive.org"
              style={{ color: "#D17424", textDecoration: "underline" }}
            >
              support@orphangive.org
            </a>{" "}
            and we&rsquo;ll look into it.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: 12,
                fontFamily:
                  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "#8B8B8E",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 16,
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                appearance: "none",
                border: 0,
                borderRadius: 9999,
                background: "#F39322",
                color: "#FFFAF2",
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                fontSize: 14,
                color: "#4D4D52",
                textDecoration: "none",
                borderBottom: "1.5px solid rgba(42,42,44,0.2)",
                paddingBottom: 2,
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
