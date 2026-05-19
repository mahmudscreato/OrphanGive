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
//   - donor email (best-effort): re-uses the existing
//     SponsorshipCancelledEmail isn't right for a refund — we don't
//     have a dedicated RefundEmail template yet. Documented in the
//     ship report as a follow-up. For now we email a short plain
//     subject via the same `sendEmail` helper without a template,
//     so the donor at least knows a refund hit their card.
//
// Does NOT cancel the sponsorship — admin can cancel + refund as
// separate steps. This keeps the policy decision (was this a one-
// off correction, or are we ending the support?) in admin's hands.

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { createItem } from "@directus/sdk";
import { getStripe } from "@/lib/stripe-client";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import {
  authedAdminSponsorship,
  fetchDonorForEmail,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
import { directusServer } from "@/lib/directus";

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

  // Audit (best-effort).
  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: admin.userId,
        actor_role: "admin",
        action: "admin_refunded_sponsorship_charge",
        collection: "sponsorship",
        record_id: sponsorship.id,
        metadata: {
          donor: sponsorship.donor,
          childId: unwrapChildId(sponsorship),
          chargeId,
          refundId: refund.id,
          amountUsd,
          amountCents,
          reason: reason || null,
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin/sponsorships/refund] audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  // Donor email (best-effort). We don't have a dedicated refund
  // template; sending a short plain-text body via the same email
  // helper keeps the donor informed without us blocking on
  // template work. Follow-up: add a SponsorshipRefundEmail React-
  // Email template that includes the receipt URL Stripe returns.
  try {
    const donor = await fetchDonorForEmail(sponsorship.donor);
    const childId = unwrapChildId(sponsorship);
    const child = childId ? await fetchChildById(childId) : null;
    if (donor) {
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      // Inline minimal "template" — React-Email expects a
      // ReactElement; an empty <p> with text content works for V1.
      // Future: swap for SponsorshipRefundEmail when written.
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject: `A refund has been issued for your sponsorship of ${child?.display_name ?? "your sponsored child"}`,
        template: refundEmailTemplate({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          amountUsd,
          dashboardUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
          adminNote: reason ?? null,
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

// Tiny placeholder template — until we add a dedicated React-Email
// component this returns a minimal JSX tree that the email pipeline
// can render. Kept inline so the route file is self-contained.
function refundEmailTemplate(args: {
  firstName: string;
  childName: string;
  amountUsd: number;
  dashboardUrl: string;
  adminNote: string | null;
}) {
  // We intentionally avoid pulling a React-Email component because
  // sendEmail accepts ANY React element; this minimal tree renders
  // fine through @react-email/render's html() path.
  return (
    <div style={{ fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
      <p>Hi {args.firstName},</p>
      <p>
        We&apos;ve issued a refund of{" "}
        <strong>${args.amountUsd.toFixed(2)} USD</strong> to your card for
        your sponsorship of {args.childName}.
      </p>
      {args.adminNote ? (
        <p>
          Note from our team: <em>{args.adminNote}</em>
        </p>
      ) : null}
      <p>
        Refunds typically appear on your statement within 5–10 business
        days. If you have any questions, reply to this email and
        we&apos;ll get back to you quickly.
      </p>
      <p>
        You can view this sponsorship&apos;s history any time:{" "}
        <a href={args.dashboardUrl}>{args.dashboardUrl}</a>
      </p>
      <p>— OrphanGive</p>
    </div>
  );
}
