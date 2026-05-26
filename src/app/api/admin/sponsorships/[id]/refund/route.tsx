// Session 61 — Admin refund endpoint.
//
// POST /api/admin/sponsorships/[id]/refund
// Auth: admin session cookie
// Body: {
//   chargeId: string,   // Stripe ch_... id
//   amountUsd: number,  // dollars, > 0, <= remaining refundable balance
//   reason?: string     // optional free-text, max 500
// }
//
// Uses stripe.refunds.create({ charge, amount, reason: requested_by_customer })
// per Stripe API convention. We always tag reason='requested_by_customer'
// at the Stripe layer (their enum is constrained) and surface the
// admin's free-text reason in `metadata.admin_reason` so it shows in
// the Stripe dashboard side-by-side with the refund.
//
// Side effects:
//   - Stripe Refund created
//   - audit_log row: admin_refunded_sponsorship_charge
//   - donor email (best-effort): SponsorshipRefundEmail (Session
//     61.3 hotfix — replaces the inline minimal JSX placeholder
//     that shipped in Session 61 with a proper React-Email
//     template that includes the refund amount card + the standard
//     "5-10 business days" line + the admin's reason inline).
//
// Does NOT cancel the sponsorship — admin can cancel + refund as
// separate steps. This keeps the policy decision (was this a one-
// off correction, or are we ending the support?) in admin's hands.

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/lib/stripe-client";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipRefundEmail } from "@/emails/SponsorshipRefundEmail";
import {
  authedAdminSponsorship,
  fetchDonorForEmail,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
// Phase 0 — see /api/admin/sponsorships/[id]/cancel/route.ts for why.
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    chargeId: z.string().min(8).regex(/^ch_|^re_|^py_/i, {
      message: "chargeId must look like a Stripe charge id (ch_…)",
    }),
    amountUsd: z.number().positive(),
    reason: z.string().max(500).optional(),
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
  const { chargeId, amountUsd, reason } = parsed.data;

  // Stripe amounts are in minor units. Round to cents to avoid
  // floating-point drift on the wire.
  const amountCents = Math.round(amountUsd * 100);

  // Verify the charge belongs to this sponsorship's customer or
  // PaymentIntent before refunding — guards against an admin
  // pasting the wrong charge id from another sponsorship.
  let charge: Stripe.Charge | null = null;
  const stripe = getStripe();
  try {
    charge = await stripe.charges.retrieve(chargeId);
  } catch (err) {
    console.error("[admin/sponsorships/refund] charge retrieve failed:", err);
    return NextResponse.json(
      {
        error: "charge_not_found",
        message: err instanceof Error ? err.message : "Charge not found.",
      },
      { status: 400 },
    );
  }

  const chargeCustomer =
    typeof charge.customer === "string"
      ? charge.customer
      : charge.customer?.id ?? null;
  const chargePI =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;

  const customerMatches =
    sponsorship.stripe_customer_id &&
    chargeCustomer === sponsorship.stripe_customer_id;
  const piMatches =
    sponsorship.stripe_payment_intent_id &&
    chargePI === sponsorship.stripe_payment_intent_id;
  if (!customerMatches && !piMatches) {
    return NextResponse.json(
      {
        error: "charge_mismatch",
        message:
          "Charge isn't linked to this sponsorship's Stripe customer or PaymentIntent.",
      },
      { status: 400 },
    );
  }

  // Refundable balance check (Stripe enforces this too, but a clean
  // 400 from us is friendlier than parsing a Stripe error).
  const alreadyRefundedCents =
    typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
  const chargeAmountCents =
    typeof charge.amount === "number" ? charge.amount : 0;
  const remainingCents = chargeAmountCents - alreadyRefundedCents;
  if (amountCents > remainingCents) {
    return NextResponse.json(
      {
        error: "amount_too_large",
        message: `Amount exceeds refundable balance ($${(remainingCents / 100).toFixed(2)}).`,
      },
      { status: 400 },
    );
  }

  // Issue the refund.
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      charge: chargeId,
      amount: amountCents,
      reason: "requested_by_customer",
      metadata: {
        sponsorship_id: sponsorship.id,
        donor_id: sponsorship.donor,
        source: "admin_refund_ui",
        admin_user_id: admin.userId,
        admin_reason: reason?.slice(0, 500) ?? "",
      },
    });
  } catch (err) {
    console.error("[admin/sponsorships/refund] stripe refund failed:", err);
    return NextResponse.json(
      {
        error: "stripe_failed",
        message: err instanceof Error ? err.message : "Stripe refund failed.",
      },
      { status: 502 },
    );
  }

  // Audit (best-effort; recordAuditEvent never throws).
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_refunded_sponsorship_charge",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: sponsorship.donor,
      childId: unwrapChildId(sponsorship),
      chargeId,
      refundId: refund.id,
      amountUsd,
      amountCents,
      reason: reason || null,
    },
    request: req,
  });

  // Donor email (best-effort). We don't have a dedicated refund
  // template; sending a short plain-text body via the same email
  // helper keeps the donor informed without us blocking on
  // template work. Follow-up: add a SponsorshipRefundEmail React-
  // Session 61.3 hotfix — swapped the inline placeholder for the
  // proper React-Email SponsorshipRefundEmail. Currency defaults to
  // USD because the refund endpoint operates on USD-denominated
  // amounts (sponsorship.currency is the source of truth; refund
  // shares that).
  try {
    const donor = await fetchDonorForEmail(sponsorship.donor);
    const childId = unwrapChildId(sponsorship);
    const child = childId ? await fetchChildById(childId) : null;
    if (donor) {
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject: `A refund has been issued for your sponsorship of ${child?.display_name ?? "your sponsored child"}`,
        template: SponsorshipRefundEmail({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          amount: amountUsd,
          currency: sponsorship.currency ?? "USD",
          adminReason: reason ?? null,
          dashboardUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
        }),
      });
    }
  } catch (err) {
    console.warn(
      "[admin/sponsorships/refund] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    ok: true,
    refundId: refund.id,
    amountRefundedUsd: typeof refund.amount === "number" ? refund.amount / 100 : amountUsd,
    chargeId,
  });
}
