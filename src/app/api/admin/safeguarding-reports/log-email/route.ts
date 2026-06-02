// POST /api/admin/safeguarding-reports/log-email — FOUNDER/LEAD ONLY.
//
// Manually log a safeguarding report that arrived by email/phone/in person
// into the same queue, so nothing lives only in an inbox. This is the
// HONEST version of "capture emailed reports": the lead transcribes it in
// ~30 seconds. There is NO automated inbound-email ingestion (no mail
// webhook) — that is deliberately out of scope.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSafeguardingLead } from "@/lib/safeguarding-access";
import { createSafeguardingReport } from "@/lib/safeguarding-reports";
import { REPORT_TYPES } from "@/lib/safeguarding-report-types";
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  report_type: z.enum(REPORT_TYPES),
  description: z.string().trim().min(1).max(5000),
  reporter_name: z.string().trim().max(120).optional().or(z.literal("")),
  reporter_email: z.string().trim().max(254).optional().or(z.literal("")),
  reporter_relationship: z.string().trim().max(120).optional().or(z.literal("")),
  child_reference: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const lead = await requireSafeguardingLead();
  if (!lead) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const { id } = await createSafeguardingReport({
      source: "email_logged_manually",
      report_type: parsed.data.report_type,
      description: parsed.data.description,
      reporter_name: parsed.data.reporter_name || null,
      reporter_email: parsed.data.reporter_email || null,
      reporter_relationship: parsed.data.reporter_relationship || null,
      child_reference: parsed.data.child_reference || null,
    });
    await recordAuditEvent({
      actorUserId: lead.userId,
      actorRole: "admin",
      action: "admin_logged_safeguarding_email",
      collection: "safeguarding_report",
      recordId: String(id),
      // type only — never the report body
      metadata: { report_type: parsed.data.report_type, source: "email_logged_manually" },
      request: req,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error(
      "[/api/admin/safeguarding-reports/log-email] failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
