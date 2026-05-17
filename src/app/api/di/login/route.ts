// Session 42 — DI Dashboard /api/di/login.
//
// POST { email, password } → on success, sets di_access_token +
// di_refresh_token cookies and returns { ok: true }. Calls Directus
// /auth/login server-side (so the credentials never touch
// client-side JS) via the di-auth.ts helper, then verifies the
// authenticated user's role is `Data Inputter`.
//
// Status codes:
//   200 — login OK, cookies set
//   400 — malformed body
//   401 — Directus rejected the credentials
//   403 — credentials valid but user is NOT a Data Inputter
//   500 — Directus unreachable / unexpected response

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { loginDi, setDiCookies } from "@/lib/di-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const result = await loginDi(email, password);

  if (!result.ok) {
    if (result.error === "invalid_credentials") {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }
    if (result.error === "not_di") {
      return NextResponse.json(
        { error: "This account is not a Data Inputter account. Contact admin." },
        { status: 403 },
      );
    }
    console.error(
      "[/api/di/login] server_error:",
      "message" in result ? result.message : "(no message)",
    );
    return NextResponse.json(
      { error: "Something went wrong logging you in. Try again in a moment." },
      { status: 500 },
    );
  }

  const store = await cookies();
  setDiCookies(store, result.accessToken, result.refreshToken);

  return NextResponse.json({
    ok: true,
    user: {
      id: result.user.userId,
      first_name: result.user.firstName,
      last_name: result.user.lastName,
      email: result.user.email,
    },
  });
}
