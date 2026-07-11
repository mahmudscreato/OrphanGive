// Spine 1.2 — Admin sends a report back to the DI for correction.
//
// Status → 'correction_requested'. The DI's submissions surface
// (existing) shows the row + the reason; DI can resubmit (form
// re-POSTs; the route handler accepts an updated row, advancing
// back to 'submitted_by_di').
//
// Request body: { reason: string } (5-500 chars after trim).
//
// Distinct from a terminal rejection — Spine 1.2 doesn't ship one.
// The 'rejected' state on child_update remains reserved for admin's
// direct-in-Directus override and isn't reachable from this surface.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  InvalidReportInputError,
  InvalidReportStatusTransitionError,
  ReportNotFoundError,
  requestReportCorrection,
} from "@/lib/admin-reports";
import { notify, resolveDiRecipient } from "@/lib/di-notifications";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024; // 4KB — well above the 500-char cap

export async function POST(
  req: NextRequest,
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

  let body: { reason?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "invalid_input", message: "body too large" },
        { status: 413 },
      );
    }
    body = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { error: "invalid_input", message: "invalid JSON body" },
      { status: 400 },
    );
  }

  const reason = body?.reason;
  if (typeof reason !== "string") {
    return NextResponse.json(
      { error: "invalid_input", field: "reason", message: "string required" },
      { status: 400 },
    );
  }

  try {
    const result = await requestReportCorrection(
      id,
      adminSession.userId,
      reason,
    );

    // fix/parked-p1-batch (audit finding 9) — the DI MUST act on this
    // (revise + resubmit), so it's the highest-priority report notify.
    // Recipient = author (created_by) with the child.assigned_di
    // fallback. Best-effort; never breaks the transition. The admin's
    // correction reason is carried verbatim so the DI knows what to fix.
    const recipient = await resolveDiRecipient(result.uploaderId, result.childId);
    if (recipient) {
      await notify({
        recipientUserId: recipient,
        type: "admin_requested_report_correction",
        title: "Report needs changes",
        body: `Admin asked for a correction on your report: ${result.reason}`,
        relatedCollection: "child_update",
        relatedId: result.id,
      });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ReportNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof InvalidReportInputError) {
      return NextResponse.json(
        { error: "invalid_input", field: err.field, message: err.message },
        { status: 400 },
      );
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
      "[/api/admin/reports/request-correction] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
