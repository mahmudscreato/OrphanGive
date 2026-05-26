// Spine 1.2 — Admin claims a report for review.
//
// Idempotent — calling on a row already 'under_admin_review' is a
// no-op (returns the current state). Calling on a row outside the
// review-able states (submitted_by_di / pending / correction_requested)
// returns 400.
//
// Mirrors /api/admin/moments/[id]/approve's auth + error shape.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  claimReportForReview,
  InvalidReportStatusTransitionError,
  ReportNotFoundError,
} from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminSession = await requireAdminUser();
  if (!adminSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await claimReportForReview(id, adminSession.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ReportNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidReportStatusTransitionError) {
      return NextResponse.json(
        {
          error: "invalid_status",
          message: err.message,
          from: err.from,
          to: err.to,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/reports/claim] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
