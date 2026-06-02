// POST /api/admin/safeguarding-reports/[id]/update — FOUNDER/LEAD ONLY.
//
// Single triage endpoint for the safeguarding lead: set risk, change status,
// record action_taken, or assign. Gated by requireSafeguardingLead() (fail-
// closed). Every change writes an audit_log row — metadata carries ids +
// enums + lengths ONLY, never the report/action body text.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSafeguardingLead } from "@/lib/safeguarding-access";
import {
  getSafeguardingReport,
  setSafeguardingReportRisk,
  setSafeguardingReportStatus,
  setSafeguardingReportAction,
  assignSafeguardingReport,
} from "@/lib/safeguarding-reports";
import { RISK_LEVELS, REPORT_STATUSES } from "@/lib/safeguarding-report-types";
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("risk"), value: z.enum(RISK_LEVELS) }),
  z.object({ field: z.literal("status"), value: z.enum(REPORT_STATUSES) }),
  z.object({ field: z.literal("action"), value: z.string().trim().max(5000) }),
  z.object({ field: z.literal("assign") }), // assigns to the current lead
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const lead = await requireSafeguardingLead();
  if (!lead) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id) && !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Capture the prior value for the audit diff (non-sensitive enums only).
  const prior = await getSafeguardingReport(id);
  if (!prior) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const data = parsed.data;
    if (data.field === "risk") {
      await setSafeguardingReportRisk(id, data.value);
      await recordAuditEvent({
        actorUserId: lead.userId,
        actorRole: "admin",
        action: "admin_set_safeguarding_risk",
        collection: "safeguarding_report",
        recordId: id,
        metadata: { prior_risk: prior.risk_level, new_risk: data.value },
        request: req,
      });
    } else if (data.field === "status") {
      await setSafeguardingReportStatus(id, data.value);
      await recordAuditEvent({
        actorUserId: lead.userId,
        actorRole: "admin",
        action: "admin_changed_safeguarding_status",
        collection: "safeguarding_report",
        recordId: id,
        metadata: { prior_status: prior.status, new_status: data.value },
        request: req,
      });
    } else if (data.field === "action") {
      await setSafeguardingReportAction(id, data.value);
      await recordAuditEvent({
        actorUserId: lead.userId,
        actorRole: "admin",
        action: "admin_recorded_safeguarding_action",
        collection: "safeguarding_report",
        recordId: id,
        // length only — NEVER the action text
        metadata: { action_length: data.value.trim().length },
        request: req,
      });
    } else {
      // assign → the current lead
      await assignSafeguardingReport(id, lead.userId);
      await recordAuditEvent({
        actorUserId: lead.userId,
        actorRole: "admin",
        action: "admin_assigned_safeguarding_report",
        collection: "safeguarding_report",
        recordId: id,
        metadata: { assigned_to: lead.userId },
        request: req,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(
      "[/api/admin/safeguarding-reports/update] failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
