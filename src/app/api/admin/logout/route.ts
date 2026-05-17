// Session 46-fix-2 — admin logout endpoint.
//
// Best-effort Directus logout (revokes the refresh token server-side)
// + clears local cookies. Mirror of /api/di/logout.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_REFRESH_COOKIE,
  clearAdminCookies,
  logoutAdmin,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(ADMIN_REFRESH_COOKIE)?.value;
  if (refreshToken) {
    void logoutAdmin(refreshToken).catch(() => {});
  }
  clearAdminCookies(store);
  return NextResponse.json({ ok: true });
}
