import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchPaymentById,
  fetchSponsorshipsByIds,
  formatTo,
} from "@/lib/email-data";
import { getStripe } from "@/lib/stripe-client";
import { MonthlyReceiptEmail } from "@/emails/MonthlyReceiptEmail";
import { labelForCause } from "@/lib/cause";
import { labelForVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: { paymentId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = typeof body.paymentId === "string" ? body.paymentId : null;
  if (!id) {
    return NextResponse.json(
      { error: "paymentId is required" },
      { status: 400 },
    );
  }

  const payment = await fetchPaymentById(id);
  if (!payment) {
    return NextResponse.json({ error: "payment not found" }, { status: 404 });
  }

  const [sponsorship] = await fetchSponsorshipsByIds([payment.sponsorship]);
  if (!sponsorship) {
    return NextResponse.json(
      { error: "linked sponsorship not found" },
      { status: 404 },
    );
  }
  const [donor, child] = await Promise.all([
    fetchDonorById(sponsorship.donor),
    fetchChildById(sponsorship.child),
  ]);
  if (!donor || !donor.email) {
    return NextResponse.json(
      { error: "donor not found or has no email" },
      { status: 404 },
    );
  }
  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const childName = child?.display_name ?? "your sponsored child";

  // Best-effort: pull receipt URL + brand + last4 from the Stripe charge.
  let stripeReceiptUrl: string | null = null;
  let last4: string | null = null;
  let brand: string | null = payment.payment_method_type ?? null;
  try {
    const chargeId = payment.stripe_charge_id;
    if (chargeId) {
      const charge = (await getStripe().charges.retrieve(
        chargeId,
      )) as Stripe.Charge;
      stripeReceiptUrl = charge.receipt_url ?? null;
      const card = charge.payment_method_details?.card;
      last4 = card?.last4 ?? null;
      brand = card?.brand ?? brand;
    } else if (payment.stripe_payment_intent_id) {
      const pi = (await getStripe().paymentIntents.retrieve(
        payment.stripe_payment_intent_id,
        { expand: ["latest_charge"] },
      )) as Stripe.PaymentIntent;
      const charge =
        typeof pi.latest_charge === "string"
          ? null
          : (pi.latest_charge as Stripe.Charge | null);
      if (charge) {
        stripeReceiptUrl = charge.receipt_url ?? null;
        const card = charge.payment_method_details?.card;
        last4 = card?.last4 ?? null;
        brand = card?.brand ?? brand;
      }
    }
  } catch (err) {
    console.warn(
      "[email] monthly-receipt: stripe lookup failed",
      err instanceof Error ? err.message : err,
    );
  }

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: subjectFor(payment.paid_at, childName),
    template: MonthlyReceiptEmail({
      firstName,
      childName,
      causeLabel: labelForCause(sponsorship.cause),
      visibilityLabel: labelForVisibility(sponsorship.visibility),
      amountUsd: payment.amount_usd,
      paidAt: payment.paid_at,
      paymentMethodLast4: last4,
      paymentMethodBrand: brand,
      stripeReceiptUrl,
      nextBillingDate: sponsorship.next_billing_date,
      dashboardUrl: siteUrl("/dashboard"),
    }),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    success: true,
    messageId: result.messageId,
  });
}

function subjectFor(paidAtIso: string, childName: string): string {
  const d = new Date(paidAtIso);
  if (Number.isNaN(d.getTime())) {
    return `Receipt for your sponsorship of ${childName}`;
  }
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${childName}'s sponsorship for ${month} — your receipt`;
}
