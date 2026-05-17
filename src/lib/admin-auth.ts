// Session 46-fix-2 — server-side admin auth helpers.
//
// Admin users authenticate against Directus directly (mirrors
// src/lib/di-auth.ts but for the Admin / Administrator roles). Cookies
// are namespaced separately (`admin_access_token` / `admin_refresh_token`)
// so a single browser can hold donor + DI + admin sessions in parallel
// without collision.
//
// Role check is BY NAME (`Admin` or `Administrator`), not by hardcoded
// UUID — the brief listed UUIDs that don't match production. Names are
// stable per the C1 bootstrap convention.
//
// V1 admin surface is intentionally tiny:
//   - POST /api/admin/login                  ← obtain admin_access_token cookie
//   - POST /api/admin/logout                 ← clear cookie
//   - POST /api/admin/proposals/[id]/approve ← approve a child_proposal
//   - POST /api/admin/proposals/[id]/reject  ← reject a child_proposal
//
// No login UI yet — Mahmud uses curl per migrations/session-46/APPLY.md.

import { cookies } from "next/headers";

const ADMIN_ROLE_NAMES = new Set(["Admin", "Administrator"]);

export const ADMIN_ACCESS_COOKIE = "admin_access_token";
export const ADMIN_REFRESH_COOKIE = "admin_refresh_token";

// Match the donor / DI flow's lifetime conventions.
const ACCESS_COOKIE_MAX_AGE = 60 * 15; // 15 min
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getDirectusUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!url) throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
  return url;
}

export type AdminSession = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  roleName: string;
  accessToken: string;
};

// ─── Login ──────────────────────────────────────────────────────────

export type AdminLoginResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      user: AdminSession;
    }
  | {
      ok: false;
      error: "invalid_credentials" | "not_admin" | "server_error";
      message?: string;
    };

export async function loginAdmin(
  email: string,
  password: string,
): Promise<AdminLoginResult> {
  const url = getDirectusUrl();
  let loginBody: { data?: { access_token?: string; refresh_token?: string } } = {};
  try {
    const loginRes = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mode: "json" }),
    });
    if (!loginRes.ok) {
      if (loginRes.status === 401 || loginRes.status === 403) {
        return { ok: false, error: "invalid_credentials" };
      }
      const text = await loginRes.text();
      return {
        ok: false,
        error: "server_error",
        message: `${loginRes.status} ${text.slice(0, 200)}`,
      };
    }
    loginBody = await loginRes.json();
  } catch (err) {
    return {
      ok: false,
      error: "server_error",
      message: err instanceof Error ? err.message : "fetch failed",
    };
  }

  const accessToken = loginBody.data?.access_token;
  const refreshToken = loginBody.data?.refresh_token;
  if (!accessToken || !refreshToken) {
    return { ok: false, error: "server_error", message: "no token returned" };
  }

  const meRes = await fetch(
    `${url}/users/me?fields=id,first_name,last_name,email,role.name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!meRes.ok) {
    return {
      ok: false,
      error: "server_error",
      message: `me lookup failed: ${meRes.status}`,
    };
  }
  const meBody = (await meRes.json()) as {
    data?: {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string;
      role?: { name?: string } | null;
    };
  };
  const me = meBody.data;
  if (!me?.id || !me.email) {
    return {
      ok: false,
      error: "server_error",
      message: "incomplete user payload",
    };
  }

  const roleName = me.role?.name ?? "";
  if (!ADMIN_ROLE_NAMES.has(roleName)) {
    void logoutAdmin(refreshToken).catch(() => {});
    return { ok: false, error: "not_admin" };
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
      roleName,
      accessToken,
    },
  };
}

// ─── Logout ─────────────────────────────────────────────────────────

export async function logoutAdmin(refreshToken: string): Promise<void> {
  const url = getDirectusUrl();
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

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const accessToken = store.get(ADMIN_ACCESS_COOKIE)?.value;
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
      role?: { name?: string } | null;
    };
  };
  const me = body.data;
  if (!me?.id || !me.email) return null;
  const roleName = me.role?.name ?? "";
  if (!ADMIN_ROLE_NAMES.has(roleName)) return null;

  return {
    userId: me.id,
    firstName: me.first_name ?? null,
    lastName: me.last_name ?? null,
    email: me.email,
    roleName,
    accessToken,
  };
}

/**
 * Returns the admin session or null. Mirror of requireDiUser pattern,
 * but API-only — the brief explicitly defers admin UI to Sessions 47+,
 * so there's no `redirect()` helper here. API routes that need an
 * admin user check this and return a 401 manually.
 */
export async function requireAdminUser(): Promise<AdminSession | null> {
  return getAdminSession();
}

// ─── Cookie helpers ─────────────────────────────────────────────────

type CookieJar = Awaited<ReturnType<typeof cookies>>;

export function setAdminCookies(
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
    name: ADMIN_ACCESS_COOKIE,
    value: accessToken,
    maxAge: ACCESS_COOKIE_MAX_AGE,
    ...baseOpts,
  });
  store.set({
    name: ADMIN_REFRESH_COOKIE,
    value: refreshToken,
    maxAge: REFRESH_COOKIE_MAX_AGE,
    ...baseOpts,
  });
}

export function clearAdminCookies(store: CookieJar): void {
  store.set({
    name: ADMIN_ACCESS_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  store.set({
    name: ADMIN_REFRESH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
}
