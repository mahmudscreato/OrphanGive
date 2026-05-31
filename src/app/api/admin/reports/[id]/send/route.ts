// Spine Lot 2 — admin publishes an approved report to the donor.
//
// POST /api/admin/reports/[id]/send
// (no body)
//
// Effects, in order:
//   1. Flip child_update.status 'approved' → 'published' + stamp
//      published_at = NOW. Audit row admin_sent_report_to_donor.
//      Idempotency: re-clicking on a 'published' row returns 400
//      via InvalidReportStatusTransitionError.
//   2. Best-effort donor email via the existing Resend helper
//      (src/lib/email.ts:sendEmail). Email is Tier-1/2-safe — just
//      child first name + donor first name + dashboard link. NO
//      report body, NO donor_text, NO Tier-3.
//
// The status flip is the primary effect. Email is best-effort —
// missing RESEND_API_KEY or transient Resend errors don't fail the
// route. The donor already has the new content visible on their
// dashboard the moment status='published'; email is the nudge.

import { NextResponse, type NextRequest } from "next/server";
import { readItems, readUsers } from "@directus/sdk";
import { requireAdminUser } from "@/lib/admin-auth";
import { directusServer } from "@/lib/directus";
import {
  InvalidReportInputError,
  InvalidReportStatusTransitionError,
  ReportNotFoundError,
  sendReportToDonor,
} from "@/lib/admin-reports";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { ReportPublishedEmail } from "@/emails/ReportPublishedEmail";

// Donor fetch — uses readUsers (the SDK's helper for the core
// directus_users collection). The shared fetchDonorForEmail helper
// in admin-sponsorship-actions.ts incorrectly uses readItems which
// the v21 SDK rejects with "Cannot use readItems for core
// collections"; we work around that locally rather than refactoring
// the shared helper from this branch.
async function fetchDonorMinimal(donorId: string): Promise<{
  id: string;
  email: string;
  first_name: string | null;
} | null> {
  if (!donorId) return null;
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _eq: donorId } },
        fields: ["id", "first_name", "email"],
        limit: 1,
      } as never),
    )) as unknown as
      | Array<{ id: string; email: string | null; first_name: string | null }>
      | undefined;
    const u = Array.isArray(users) ? users[0] : undefined;
    if (!u || !u.email) return null;
    return { id: u.id, email: u.email, first_name: u.first_name };
  } catch (err) {
    console.warn(
      "[/api/admin/reports/send] fetchDonorMinimal failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull donor + sponsorship + child for the email. All Tier-1 fields
 *  only (donor email, donor first_name, child display_name). */
async function loadEmailContext(opts: {
  sponsorshipId: string | null;
  childId: string | null;
}): Promise<{
  donorEmail: string;
  donorFirstName: string;
  childName: string;
  sponsorshipUrl: string;
} | null> {
  if (!opts.sponsorshipId || !opts.childId) return null;
  let donorId: string | null = null;
  try {
    // Minimal sponsorship lookup — just need the donor id.
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: { id: { _eq: opts.sponsorshipId } },
        fields: ["id", "donor"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string; donor: string | null }> | undefined;
    donorId = rows?.[0]?.donor ?? null;
  } catch {
    return null;
  }
  if (!donorId) return null;

  const [donor, child] = await Promise.all([
    fetchDonorMinimal(donorId),
    fetchChildById(opts.childId),
  ]);
  if (!donor || !donor.email) return null;
  const firstName =
    donor.first_name?.trim() || donor.email.split("@")[0] || "there";
  const childName = child?.display_name?.trim() || "your sponsored child";
  return {
    donorEmail: donor.email,
    donorFirstName: firstName,
    childName,
    sponsorshipUrl: siteUrl(`/dashboard/sponsorship/${opts.sponsorshipId}`),
  };
}

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

  // ─── 1. Flip status (atomic + audited) ───
  let result: Awaited<ReturnType<typeof sendReportToDonor>>;
  try {
    result = await sendReportToDonor(id, adminSession.userId);
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
      "[/api/admin/reports/send] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // ─── 2. Donor email — best effort ───
  // Suppress when sponsorship/child aren't both linked (legacy rows
  // without sponsorship FK would have no donor anyway). Email
  // failure never reverses the status flip — the donor already has
  // the report visible on their dashboard.
  let emailSent = false;
  let emailError: string | null = null;
  if (result.sponsorshipId && result.childId) {
    try {
      const ctx = await loadEmailContext({
        sponsorshipId: result.sponsorshipId,
        childId: result.childId,
      });
      if (ctx) {
        const subject =
          result.reportType === "deployment"
            ? `Your gift reached ${ctx.childName} — see the moment`
            : `${ctx.childName} has a new update for you`;
        const send = await sendEmail({
          to: formatTo(ctx.donorEmail, ctx.donorFirstName),
          subject,
          template: ReportPublishedEmail({
            firstName: ctx.donorFirstName,
            childName: ctx.childName,
            reportType: result.reportType,
            sponsorshipUrl: ctx.sponsorshipUrl,
          }),
        });
        if (send.success) {
          emailSent = true;
        } else {
          emailError = send.error;
          console.warn(
            "[/api/admin/reports/send] email send failed (non-fatal):",
            send.error,
          );
        }
      } else {
        emailError = "missing_donor_or_child";
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : "email_threw";
      console.warn(
        "[/api/admin/reports/send] email threw (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }
  } else {
    emailError = "legacy_report_no_sponsorship";
  }

  return NextResponse.json({
    ok: true,
    reportId: result.id,
    status: result.status,
    publishedAt: result.publishedAt,
    emailSent,
    ...(emailError ? { emailError } : {}),
  });
}
