// Forgot-password kickoff (Session 15a). Hands off to Directus's
// native `POST /auth/password/request` endpoint, which (a) verifies
// whether the email is registered, (b) generates a single-use
// reset token, (c) sends a reset-link email from Directus's
// configured mailer.
//
// Anti-enumeration: this route ALWAYS returns 200 + an empty body
// regardless of whether the email is registered. Directus itself
// is more chatty in error responses but we swallow them here so
// the client never learns whether an email exists.
//
// Rate limiting: Directus's password/request enforces its own
// rate limit (default: 60s between requests for the same email).
// We don't add a separate layer.
//
// reset_url: must be allow-listed via Directus's
// `PASSWORD_RESET_URL_ALLOW_LIST` config. Set to the production
// site (https://orphangive.org/reset-password) plus localhost
// for dev. Mahmud manages this in Directus admin or env config.

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    // Even on bad JSON, return 200 so timing/response is uniform
    // — no signal to scanners about input validity.
    return NextResponse.json({ ok: true });
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  if (!directusUrl) {
    console.warn(
      "[forgot-password] NEXT_PUBLIC_DIRECTUS_URL not set; cannot dispatch",
    );
    return NextResponse.json({ ok: true });
  }
  const resetUrl = `${siteUrl}/reset-password`;

  try {
    const r = await fetch(`${directusUrl}/auth/password/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reset_url: resetUrl }),
    });
    if (!r.ok) {
      // Log the upstream failure (rate-limit, unknown email, allow-list
      // rejection) but don't surface to the client — uniform 200.
      const txt = await r.text().catch(() => "");
      console.warn(
        `[forgot-password] Directus password/request returned ${r.status}: ${txt.slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.warn(
      "[forgot-password] Directus password/request threw (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
  return NextResponse.json({ ok: true });
}
