import { createDirectus, rest, staticToken } from "@directus/sdk";

// Env vars are LAZY-READ inside accessor functions, not at module
// load. Reading at module load with throw breaks Next.js's build-
// time page-collection step (the build process imports every
// module — if any module throws on missing env, build fails before
// the dotted .env file is even consulted). The accessor pattern
// below defers the throw to first call at runtime, where env vars
// are guaranteed to be present.

function getDirectusUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
  }
  return url;
}

// Public, anonymous client.
//
// Returns a fresh client per call but the underlying transport is
// idempotent so the cost is negligible. Callers in auth.ts (login,
// signUp, signOut, refresh, verify) wrap each call in a Directus
// SDK request, so per-call instantiation is the right granularity.
//
// Safe to import from anywhere (server or client). Hits Directus
// with no Authorization header and is therefore subject to whatever
// the Public role is permitted to see — by design, that's the
// donor's own authenticated requests (when the access cookie is
// forwarded by other helpers) and nothing else.
export function directus() {
  return createDirectus(getDirectusUrl()).with(rest());
}

// Server-only client.
//
// Authenticates with a static service token so that Server Components,
// route handlers, and server actions can read collections that the
// Public role correctly has no access to (e.g. `child`, `sponsorship`).
// Never call this from a Client Component — the token is not
// NEXT_PUBLIC_ and is not bundled to the browser.
//
// Cached after first successful instantiation so subsequent calls
// reuse the same transport. The cache lives in module scope; each
// Node process gets its own instance.
let cachedServerClient: ReturnType<typeof buildServerClient> | null = null;

function buildServerClient() {
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!token) {
    throw new Error(
      "DIRECTUS_SERVER_TOKEN is not defined — required for server-side Directus calls",
    );
  }
  return createDirectus(getDirectusUrl()).with(rest()).with(staticToken(token));
}

export function directusServer() {
  if (cachedServerClient === null) {
    cachedServerClient = buildServerClient();
  }
  return cachedServerClient;
}
