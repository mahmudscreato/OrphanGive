// Session 21 — Sentry browser-side init.
//
// Loaded by `@sentry/nextjs` during client bootstrap. Sample rate
// is gentle in production (10%) and full in development so local
// errors surface immediately during dev.
//
// TODO Mahmud: add SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN to
// /opt/orphangive/app.env when ready to activate. Until then
// Sentry will be a no-op — `init()` exits early below if the DSN
// is missing, so no events are queued and no network calls are
// made.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Event sampling — 100% in dev to surface every issue, 10% in
    // production to control volume + cost. Adjust the production
    // figure once we have a baseline event volume.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Replay sampling — off by default. If/when Mahmud wants
    // session replay for debugging, flip the rate above 0.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Don't send default PII (cookies, headers, IP) — donor data is
    // sensitive. Errors that need user context can attach it
    // explicitly.
    sendDefaultPii: false,
  });
}
