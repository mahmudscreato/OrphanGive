// Spine 1.2 — Admin approves a report.
//
// Status → 'approved'. Spine 1.2's terminal state — the donor send
// (1.3) + donor notification (1.4) live elsewhere. DI notification
// for "your report was approved" is NOT wired here; mirror the
// /api/admin/moments/[id]/approve pattern when 1.3 ships.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  approveReport,
  InvalidReportInputError,
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
    const result = await approveReport(id, adminSession.userId);
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
    if (err instanceof InvalidReportInputError) {
      return NextResponse.json(
        { error: "invalid_input", field: err.field, message: err.message },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/reports/approve] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
