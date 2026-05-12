// Session 21 — Sentry Node-runtime init (Server Components,
// Route Handlers, server actions).
//
// TODO Mahmud: add SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN to
// /opt/orphangive/app.env when ready to activate. Until then
// Sentry will be a no-op — `init()` exits early if the DSN is
// missing.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
