import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "directus_access_token";
const REFRESH_COOKIE = "directus_refresh_token";

// Edge-runtime proxy. Inline minimal fetch logic — we do NOT import the
// donor-data lib here because it depends on next/headers (Node-only) and
// the Directus SDK (heavy). The page-level data layer does the full
// fetch; this is the cheap edge gate.

function bypass(req: NextRequest) {
  return NextResponse.next();
}

function redirectTo(req: NextRequest, path: string, opts: { clearCookies?: boolean } = {}) {
  const url = new URL(path, req.url);
  const res = NextResponse.redirect(url);
  if (opts.clearCookies) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  }
  return res;
}

type DirectusMe = {
  data?: {
    id?: string;
    email?: string;
    status?: string;
    og_admin_approval_status?: string;
  };
  errors?: unknown;
};

async function fetchSelfState(token: string): Promise<DirectusMe | null> {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  const serverToken = process.env.DIRECTUS_SERVER_TOKEN;
  if (!url) return null;

  try {
    // Step 1: validate token + get id (cheap fields only — Directus always
    // permits id self-read).
    const meRes = await fetch(`${url}/users/me?fields=id,email,status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) return null;
    const me = (await meRes.json()) as DirectusMe;
    const id = me.data?.id;
    if (!id) return null;

    // Step 2: server-token fetch of og_admin_approval_status (Donor policy
    // can't read it). Without server token we degrade to the partial me.
    if (!serverToken) {
      return me;
    }
    const fullRes = await fetch(
      `${url}/users/${id}?fields=id,email,status,og_admin_approval_status`,
      { headers: { Authorization: `Bearer ${serverToken}` } },
    );
    if (!fullRes.ok) return me;
    return (await fullRes.json()) as DirectusMe;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rejected state landing page is allowed-through unconditionally
  // (the donor needs to see the rejection message + sign out).
  if (path === "/dashboard/rejected") return bypass(request);

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const fromParam = `${path}${request.nextUrl.search}`;

  if (!token) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("from", fromParam);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // For non-dashboard protected routes (/sponsor, /account), the simple
  // cookie-presence check already decides — let the page do deeper guarding.
  if (!path.startsWith("/dashboard")) return bypass(request);

  // Dashboard: full state-aware gate.
  const me = await fetchSelfState(token);
  if (!me?.data) {
    // Token was rejected by Directus — clear and redirect.
    return redirectTo(request, "/signin?from=" + encodeURIComponent(fromParam), {
      clearCookies: true,
    });
  }
  const status = me.data.status ?? "";
  const approval = me.data.og_admin_approval_status ?? "pending";
  const email = me.data.email ?? "";

  // STATE E — suspended → sign out + redirect to signin with explanation.
  if (status === "suspended") {
    return redirectTo(request, "/signin?error=suspended", { clearCookies: true });
  }

  // STATE A — pending email verification.
  if (status === "draft" || status === "pending_email_verification") {
    const url = new URL("/signup/verify", request.url);
    if (email) url.searchParams.set("email", email);
    return NextResponse.redirect(url);
  }

  // STATE D — rejected → /dashboard/rejected.
  if (approval === "rejected") {
    return redirectTo(request, "/dashboard/rejected");
  }

  // STATE B (pending_approval) and STATE C (approved) — page renders both.
  return bypass(request);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/sponsor",
    "/sponsor/:path*",
    "/account",
    "/account/:path*",
  ],
};
