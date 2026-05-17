// Session 47 — Mark single notification as read.
//
// POST /api/di/notifications/[id]/read
//
// Status mapping:
//   200 ok                — { ok: true }
//   401 unauthorized
//   404 not_found         — collapses doesn't-exist with not-owned

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import { markNotificationRead } from "@/lib/di-notifications";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ok = await markNotificationRead(id, session.userId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
