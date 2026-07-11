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
import { notify, resolveDiRecipient } from "@/lib/di-notifications";

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

    // fix/parked-p1-batch (audit finding 9) — notify the DI author their
    // report was approved. Recipient = report author (created_by), with
    // the child.assigned_di fallback for legacy rows whose created_by is
    // null (same pattern as the document/intake fixes). Best-effort:
    // notify() swallows its own errors and skips a null recipient, so
    // this can never break the approve transition.
    const recipient = await resolveDiRecipient(result.uploaderId, result.childId);
    if (recipient) {
      await notify({
        recipientUserId: recipient,
        type: "admin_approved_report",
        title: "Report approved",
        body: "Admin approved your report. It's ready to be published to the donor.",
        relatedCollection: "child_update",
        relatedId: result.id,
      });
    }

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
