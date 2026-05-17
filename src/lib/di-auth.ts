// Session 42 — DI Dashboard server-side auth helpers.
//
// DI users authenticate against Directus directly (NOT Better Auth,
// which is the donor flow). Cookies are namespaced separately
// (`di_access_token` / `di_refresh_token`) so that a single browser
// can technically hold both donor and DI sessions without collision —
// donor reads `directus_access_token`, DI reads `di_access_token`.
//
// The role check is by name (`Data Inputter`), not by hardcoded
// UUID. The role's UUID could rotate if the role is recreated; the
// name is stable per the C1 bootstrap convention.
//
// All four exports are server-only (use cookies / fetch). Callers:
//   loginDi             → src/app/api/di/login/route.ts
//   logoutDi            → src/app/api/di/logout/route.ts
//   getDirectusSession  → src/app/api/di/me/route.ts + di layout
//   requireDiUser       → src/app/di/(authed)/layout.tsx +
//                         any future /api/di/* protected route

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const DI_ROLE_NAME = "Data Inputter";

export const DI_ACCESS_COOKIE = "di_access_token";
export const DI_REFRESH_COOKIE = "di_refresh_token";

// Match the donor flow's lifetime conventions:
//   access token: 15 min (matches VPS Directus ACCESS_TOKEN_TTL)
//   refresh token: 7 days
// (See src/lib/directus-server.ts for the donor-side equivalent.)
const ACCESS_COOKIE_MAX_AGE = 60 * 15;
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getDirectusUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!url) throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
  return url;
}

export type DiSession = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  assignedDivisions: string[] | null;
  accessToken: string;
};

// ─── Login ──────────────────────────────────────────────────────────
//
// Calls Directus's `/auth/login` endpoint with the user's credentials.
// On success, returns the access + refresh tokens AND the user record.
// On failure (bad creds OR not a DI), returns a discriminated-union
// error so the route handler can map to the right HTTP status.

export type LoginResult =
  | { ok: true; accessToken: string; refreshToken: string; user: DiSession }
  | { ok: false; error: "invalid_credentials" | "not_di" | "server_error"; message?: string };

export async function loginDi(email: string, password: string): Promise<LoginResult> {
  const url = getDirectusUrl();
  let loginBody: { data?: { access_token?: string; refresh_token?: string } } = {};
  try {
    const loginRes = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mode: "json" }),
    });
    if (!loginRes.ok) {
      // 401 from Directus → bad creds. 5xx → server error.
      if (loginRes.status === 401 || loginRes.status === 403) {
        return { ok: false, error: "invalid_credentials" };
      }
      const text = await loginRes.text();
      return { ok: false, error: "server_error", message: `${loginRes.status} ${text.slice(0, 200)}` };
    }
    loginBody = await loginRes.json();
  } catch (err) {
    return { ok: false, error: "server_error", message: err instanceof Error ? err.message : "fetch failed" };
  }

  const accessToken = loginBody.data?.access_token;
  const refreshToken = loginBody.data?.refresh_token;
  if (!accessToken || !refreshToken) {
    return { ok: false, error: "server_error", message: "no token returned" };
  }

  // Now fetch the user metadata WITH role.name expanded so we can
  // verify they're a DI before completing the login.
  const meRes = await fetch(
    `${url}/users/me?fields=id,first_name,last_name,email,role.name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!meRes.ok) {
    return { ok: false, error: "server_error", message: `me lookup failed: ${meRes.status}` };
  }
  const meBody = (await meRes.json()) as {
    data?: {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string;
      assigned_divisions?: string[] | null;
      role?: { name?: string } | null;
    };
  };
  const me = meBody.data;
  if (!me?.id || !me.email) {
    return { ok: false, error: "server_error", message: "incomplete user payload" };
  }

  if (me.role?.name !== DI_ROLE_NAME) {
    // Authenticated successfully but wrong role — log out the
    // session we just created so we don't leave a token dangling.
    void logoutDi(refreshToken).catch(() => {});
    return { ok: false, error: "not_di" };
  }

  return {
    ok: true,
    accessToken,
    refreshToken,
    user: {
      userId: me.id,
      firstName: me.first_name ?? null,
      lastName: me.last_name ?? null,
      email: me.email,
      assignedDivisions: Array.isArray(me.assigned_divisions) ? me.assigned_divisions : null,
      accessToken,
    },
  };
}

// ─── Logout ─────────────────────────────────────────────────────────

export async function logoutDi(refreshToken: string): Promise<void> {
  const url = getDirectusUrl();
  // Directus's /auth/logout invalidates the refresh token server-side.
  // We fire it best-effort — if it fails, the cookies still get cleared
  // by the route handler; the dangling refresh token expires naturally
  // after REFRESH_COOKIE_MAX_AGE.
  try {
    await fetch(`${url}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, mode: "json" }),
    });
  } catch {
    // ignore
  }
}

// ─── Session read ───────────────────────────────────────────────────
//
// Reads the `di_access_token` cookie and validates it against
// Directus's /users/me. Returns null on missing/invalid cookie OR if
// the user's role is not Data Inputter (e.g. role got reassigned
// after the cookie was set).

export async function getDirectusSession(): Promise<DiSession | null> {
  const store = await cookies();
  const accessToken = store.get(DI_ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const url = getDirectusUrl();
  let res: Response;
  try {
    res = await fetch(
      `${url}/users/me?fields=id,first_name,last_name,email,role.name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string;
      assigned_divisions?: string[] | null;
      role?: { name?: string } | null;
    };
  };
  const me = body.data;
  if (!me?.id || !me.email) return null;
  if (me.role?.name !== DI_ROLE_NAME) return null;

  return {
    userId: me.id,
    firstName: me.first_name ?? null,
    lastName: me.last_name ?? null,
    email: me.email,
    assignedDivisions: Array.isArray(me.assigned_divisions) ? me.assigned_divisions : null,
    accessToken,
  };
}

// ─── Server-side auth gate ──────────────────────────────────────────
//
// For use in /di/(authed)/layout.tsx and any future /api/di/*
// route that requires a DI. Redirects to /di/login when no session
// (server components only — won't work in API routes; use
// getDirectusSession() + manual NextResponse there).

export async function requireDiUser(): Promise<DiSession> {
  const session = await getDirectusSession();
  if (!session) {
    redirect("/di/login");
  }
  return session;
}

// ─── Cookie helpers ─────────────────────────────────────────────────

type CookieJar = Awaited<ReturnType<typeof cookies>>;

export function setDiCookies(
  store: CookieJar,
  accessToken: string,
  refreshToken: string,
): void {
  const isProd = process.env.NODE_ENV === "production";
  const baseOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
  store.set({
    name: DI_ACCESS_COOKIE,
    value: accessToken,
    maxAge: ACCESS_COOKIE_MAX_AGE,
    ...baseOpts,
  });
  store.set({
    name: DI_REFRESH_COOKIE,
    value: refreshToken,
    maxAge: REFRESH_COOKIE_MAX_AGE,
    ...baseOpts,
  });
}

export function clearDiCookies(store: CookieJar): void {
  store.set({ name: DI_ACCESS_COOKIE, value: "", path: "/", maxAge: 0 });
  store.set({ name: DI_REFRESH_COOKIE, value: "", path: "/", maxAge: 0 });
}
