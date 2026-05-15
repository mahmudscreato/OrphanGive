// Session 47 — DI notifications list endpoint.
//
// GET /api/di/notifications?limit=&unread=&type=
// Returns the DI's own notifications, newest first. Defaults to 50.
//
// Status mapping:
//   200 ok           — { notifications, unreadCount }
//   401 unauthorized

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  countUnreadForUser,
  listNotificationsForUser,
  type NotificationType,
} from "@/lib/di-notifications";

export const dynamic = "force-dynamic";

const VALID_TYPES: ReadonlyArray<NotificationType> = [
  "admin_approved_proposal",
  "admin_rejected_proposal",
  "admin_assigned_child",
  "admin_assigned_task",
  "admin_verified_delivery",
];

function parseType(s: string | null): NotificationType | undefined {
  if (!s) return undefined;
  return (VALID_TYPES as readonly string[]).includes(s)
    ? (s as NotificationType)
    : undefined;
}

export async function GET(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  const type = parseType(req.nextUrl.searchParams.get("type"));

  // Two parallel reads: the page list + the unread count for the
  // bell badge. The bell would call this endpoint once per page
  // load, so amortising the two reads here is cheaper than two
  // separate HTTP round-trips.
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(session.userId, { limit, unreadOnly, type }),
    countUnreadForUser(session.userId),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
