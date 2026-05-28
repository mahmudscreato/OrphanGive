// Spine 1.2 — Admin overwrites donor-facing copy (donor_text).
//
// Preserves content (DI's original narrative is forensic). Sets
// donor_text_edited_at + donor_text_edited_by for the audit trail.
// Status is NOT changed by edits — admin still has to approve.
//
// Request body: { donorText: string } (50-4000 chars after trim).

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  editReportDonorText,
  InvalidReportInputError,
  InvalidReportStatusTransitionError,
  ReportNotFoundError,
} from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024; // 16KB — well above the 4000-char cap

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

  let body: { donorText?: unknown };
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

  const donorText = body?.donorText;
  if (typeof donorText !== "string") {
    return NextResponse.json(
      { error: "invalid_input", field: "donorText", message: "string required" },
      { status: 400 },
    );
  }

  try {
    const result = await editReportDonorText(
      id,
      adminSession.userId,
      donorText,
    );
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
      "[/api/admin/reports/edit-donor-text] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
