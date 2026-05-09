// Reset-password completion (Session 15a). Hands off to Directus's
// native `POST /auth/password/reset` endpoint with the token issued
// in the email and the donor's new password. Directus validates
// the token (single-use, 1h expiry) and updates the user's password
// hash atomically.

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing reset token." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Use at least 8 characters." },
      { status: 400 },
    );
  }

  const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!directusUrl) {
    return NextResponse.json(
      { ok: false, error: "Directus is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const r = await fetch(`${directusUrl}/auth/password/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (!r.ok) {
      // Directus surfaces a useful error here (token expired,
      // already used, password rules failed). Pass the message
      // through so the form can show it.
      const j = (await r.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string }>;
      };
      const upstreamMessage =
        j.errors?.[0]?.message ??
        "We couldn't reset your password. The link may have expired or already been used.";
      return NextResponse.json(
        { ok: false, error: upstreamMessage },
        { status: r.status >= 500 ? 502 : 400 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn(
      "[reset-password] Directus password/reset threw:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "Network error. Please try again." },
      { status: 502 },
    );
  }
}
