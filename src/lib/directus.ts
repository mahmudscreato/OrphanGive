import { createDirectus, rest, staticToken } from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;

if (!url) {
  throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
}

// Public, anonymous client.
// Safe to import from anywhere (server or client). Hits Directus with
// no Authorization header and is therefore subject to whatever the
// Public role is permitted to see — by design, that's the donor's own
// authenticated requests (when the access cookie is forwarded by other
// helpers) and nothing else.
export const directus = createDirectus(url).with(rest());

// Server-only client.
// Authenticates with a static service token so that Server Components,
// route handlers, and server actions can read collections that the
// Public role correctly has no access to (e.g. `child`, `sponsorship`).
// Never call this from a Client Component — the token is not
// NEXT_PUBLIC_ and is not bundled to the browser.
const serverToken = process.env.DIRECTUS_SERVER_TOKEN;

// Fail fast on the server if the token is missing, so we never silently
// fall back to anonymous queries. The `typeof window` guard makes the
// module still importable in client bundles (where `serverToken` is
// always undefined because it isn't NEXT_PUBLIC_) — calling
// `directusServer()` from a Client Component will still throw, just at
// call time instead of module time.
if (typeof window === "undefined" && !serverToken) {
  throw new Error(
    "DIRECTUS_SERVER_TOKEN is not defined — required for server-side Directus calls",
  );
}

let cachedServerClient: ReturnType<typeof buildServerClient> | null = null;

function buildServerClient() {
  if (!serverToken) {
    throw new Error(
      "directusServer() must only be called on the server. " +
        "DIRECTUS_SERVER_TOKEN is not available in this environment.",
    );
  }
  return createDirectus(url!).with(rest()).with(staticToken(serverToken));
}

export function directusServer() {
  if (cachedServerClient === null) {
    cachedServerClient = buildServerClient();
  }
  return cachedServerClient;
}
