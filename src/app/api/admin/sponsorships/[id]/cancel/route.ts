// Session 61 — Admin cancel endpoint.
//
// POST /api/admin/sponsorships/[id]/cancel
// Auth: admin session cookie
// Body: { reason: string } — required, 5-500 chars (audit log)
//
// Cancels the Stripe subscription (or PaymentIntent for pending
// one-time), marks the local row cancelled, fires the donor email,
// and promotes the queue. Audit row tagged
// admin_cancelled_sponsorship.
//
// Deliberately SIMPLER than the donor cancel route — we omit the
// "during prepaid period, schedule cancel-at-prepaid-end" branch
// because admin's authority is explicit ("cancel now"). Refunding
// any unused prepaid coverage is handled separately via the refund
// endpoint, which gives admin precise control instead of an
// implicit credit.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe-client";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { promoteQueue } from "@/lib/queue";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";
import {
  authedAdminSponsorship,
  fetchDonorForEmail,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
// Phase 0 — switched from raw createItem("audit_log") to
// recordAuditEvent so the write picks up IP / user-agent capture +
// the AUDIT_REDACTED_FIELDS pass. Action value + payload shape are
// preserved exactly so the existing listAuditEventsForSponsorship
// reader still finds these rows.
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    reason: z.string().min(5).max(500),
  })
  .strict();

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedAdminSponsorship(id);
  if (!auth.ok) return auth.response;
  const { admin, sponsorship } = auth.ctx;

  let json: unknown = undefined;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be valid JSON." },
      { status: 400 },
    );
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
  const reason = parsed.data.reason;

  const allowed = new Set(["active", "paused", "pending_payment"]);
  if (!allowed.has(sponsorship.status)) {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: `Cannot cancel a sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }

  const isPendingOneTime =
    sponsorship.payment_mode === "one_time" &&
    sponsorship.status === "pending_payment";

  // Cancel in Stripe.
  try {
    if (isPendingOneTime) {
      if (!sponsorship.stripe_payment_intent_id) {
        return NextResponse.json(
          {
            error: "no_payment_intent",
            message: "Pending sponsorship has no PaymentIntent.",
          },
          { status: 400 },
        );
      }
      await getStripe().paymentIntents.cancel(
        sponsorship.stripe_payment_intent_id,
      );
    } else if (sponsorship.stripe_subscription_id) {
      await getStripe().subscriptions.cancel(
        sponsorship.stripe_subscription_id,
        { prorate: false },
      );
    }
    // If neither id exists we still proceed to mark the local row
    // cancelled — admin's intent is "this sponsorship is over"
    // and there's no Stripe artifact to clean up.
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
    // Same idempotency tolerance as the donor route: "already" / "No
    // such" indicates Stripe already lost the object and we should
    // just mark the local row cancelled.
    if (!/already|No such/i.test(msg)) {
      console.error("[admin/sponsorships/cancel] stripe failed:", err);
      return NextResponse.json(
        { error: "stripe_failed", message: msg },
        { status: 502 },
      );
    }
    console.warn(
      "[admin/sponsorships/cancel] stripe object already gone — proceeding",
    );
  }

  const nowIso = new Date().toISOString();
  try {
    // Prepend "admin:" tag to the cancellation_reason so it's
    // immediately distinguishable in Directus admin / audit reads
    // from donor-initiated cancels (which store reason verbatim).
    await updateSponsorship(sponsorship.id, {
      status: "cancelled",
      cancelled_at: nowIso,
      ended_at: nowIso,
      cancellation_reason: `admin:${reason}`,
    });
  } catch (err) {
    console.error("[admin/sponsorships/cancel] directus update failed:", err);
    return NextResponse.json(
      { error: "server_error", message: "Internal update failed." },
      { status: 500 },
    );
  }

  // Audit (best-effort; recordAuditEvent never throws).
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_cancelled_sponsorship",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: sponsorship.donor,
      childId: unwrapChildId(sponsorship),
      reason,
    },
    request: req,
  });

  // Session 61.3 hotfix — donor email now attributes the cancel
  // to the OrphanGive team and surfaces the admin's stated reason
  // inline. Both threaded through the extended SponsorshipCancelled
  // template's byAdmin + adminReason props.
  try {
    const donor = await fetchDonorForEmail(sponsorship.donor);
    const childId = unwrapChildId(sponsorship);
    const child = childId ? await fetchChildById(childId) : null;
    if (donor) {
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has ended`,
        template: SponsorshipCancelledEmail({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          browseUrl: siteUrl("/children"),
          byAdmin: true,
          adminReason: reason,
        }),
      });
    }
  } catch (err) {
    console.warn(
      "[admin/sponsorships/cancel] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  // Queue promotion (best-effort).
  const childId = unwrapChildId(sponsorship);
  if (childId) {
    try {
      await promoteQueue(childId, { stripe: getStripe() });
    } catch (err) {
      console.warn(
        `[admin/sponsorships/cancel] promoteQueue ${childId} failed (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
