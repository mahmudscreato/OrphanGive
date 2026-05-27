// Spine 1.2 — DI resubmits a previously-sent-back report.
//
// Body shape: { title, content, visibility, photoUuid? }
// (No childId / sponsorshipId / type — those are locked at first
//  submit. The mutator re-fetches the row to scope-guard the DI.)
//
// Status mapping:
//   200 ok                  — { reportId, status: 'submitted_by_di', ... }
//   400 invalid_input
//   401 unauthorized
//   404 not_found / out_of_scope
//   500 server_error

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDirectusSession } from "@/lib/di-auth";
import {
  InvalidInputError,
  OutOfScopeError,
  resubmitReport,
} from "@/lib/di-reports";
import { recordAuditEvent } from "@/lib/di-audit";
import { notifyAdminOfPendingSubmission } from "@/lib/di-notify";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    title: z.string().min(1).max(200),
    content: z.string().min(50).max(2000),
    visibility: z.enum(["sponsor_only", "all_donors"]),
    photoUuid: z.string().min(8).optional(),
  })
  .strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: reportId } = await params;
  if (!reportId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "bad_request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await resubmitReport(session.userId, reportId, parsed.data);
    await recordAuditEvent({
      actorUserId: session.userId,
      action: "di_resubmitted_report",
      collection: "child_update",
      recordId: result.reportId,
      // IDs + enums only — never the report content. Length only
      // signals "non-trivial edit" without disclosing copy.
      metadata: {
        childId: result.childId,
        ...(result.sponsorshipId
          ? { sponsorshipId: result.sponsorshipId }
          : {}),
        title_length: parsed.data.title.trim().length,
        content_length: parsed.data.content.trim().length,
        visibility: parsed.data.visibility,
      },
      request: req,
    });
    // Re-enter the admin queue — same notify path as the first submit.
    await notifyAdminOfPendingSubmission({
      collection: "child_update",
      recordId: result.reportId,
      submittedByUserId: session.userId,
      childId: result.childId,
      summary: `Resubmitted report: "${parsed.data.title.slice(0, 60)}"`,
    });
    return NextResponse.json({
      reportId: result.reportId,
      status: "submitted_by_di",
    });
  } catch (err) {
    if (err instanceof OutOfScopeError) {
      return NextResponse.json(
        { error: "out_of_scope", message: err.message },
        { status: 404 },
      );
    }
    if (err instanceof InvalidInputError) {
      return NextResponse.json(
        {
          error: "invalid_input",
          field: err.field,
          message: err.message,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/di/reports/[id]/resubmit POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
