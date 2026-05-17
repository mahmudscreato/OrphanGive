// Session 42 — DI Dashboard /api/di/logout.
//
// POST → reads di_refresh_token cookie, fires Directus /auth/logout,
// clears both DI cookies. Always returns { ok: true } — logout is
// best-effort: cookies get cleared regardless of whether the
// Directus-side invalidation succeeds.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DI_REFRESH_COOKIE,
  clearDiCookies,
  logoutDi,
} from "@/lib/di-auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(DI_REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await logoutDi(refreshToken);
  }

  clearDiCookies(store);
  return NextResponse.json({ ok: true });
}
