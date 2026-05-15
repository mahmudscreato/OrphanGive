// Session 47 — Mark all notifications as read.
//
// POST /api/di/notifications/read-all
//
// Status mapping:
//   200 ok                  — { ok: true, updated: <number> }
//   401 unauthorized
//   500 server_error        — read-side query failed

import { NextResponse } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { markAllNotificationsRead } from "@/lib/di-notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const updated = await markAllNotificationsRead(session.userId);
  if (updated === null) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated });
}
