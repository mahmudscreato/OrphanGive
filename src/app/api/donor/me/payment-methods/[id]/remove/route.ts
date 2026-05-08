import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { authedDonor } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe-client";
import {
  assertPaymentMethodOwnedBy,
  listDonorPaymentMethods,
} from "@/lib/payment-methods";

export const runtime = "nodejs";

// POST /api/donor/me/payment-methods/[id]/remove
// Detaches a PaymentMethod from the signed-in donor's customer.
//
// Guard: refuse to detach if (this PM is default) AND (other
// PMs exist). The donor must promote a replacement first.
// Allowed cases: removing a non-default PM, OR removing the
// ONLY PM (default by definition, but no alternative exists).
//
// Source of truth for "default":
//   customer.invoice_settings.default_payment_method
// (NOT pm.metadata; PMs themselves carry no "is default" flag).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authedDonor();
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  const { id: pmId } = await params;
  if (!pmId.startsWith("pm_")) {
    return NextResponse.json(
      { error: "Invalid payment method id." },
      { status: 400 },
    );
  }

  const customerId = donor.og_stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No payment account on file." },
      { status: 400 },
    );
  }

  // Cross-customer guard.
  try {
    await assertPaymentMethodOwnedBy(pmId, customerId);
  } catch {
    // Don't reveal whether the PM exists — return a generic 404.
    return NextResponse.json(
      { error: "Payment method not found." },
      { status: 404 },
    );
  }

  const stripe = getStripe();

  let assessment: RemovalAssessment;
  try {
    assessment = await assessRemoval(stripe, customerId, pmId);
  } catch (err) {
    console.error(
      "[/api/donor/me/payment-methods/[id]/remove] state check failed:",
      err,
    );
    return NextResponse.json(
      { error: "Could not load payment methods." },
      { status: 502 },
    );
  }

  // Apply the guard. Single source of truth: assessment.isDefault was
  // derived from customer.invoice_settings.default_payment_method above.
  if (assessment.isDefault && assessment.otherCount > 0) {
    console.warn(
      `[/api/donor/me/payment-methods/[id]/remove] BLOCKED removal of default pm ${pmId} ` +
        `for customer ${customerId} (defaultPmId=${assessment.defaultPmId}, ` +
        `otherCount=${assessment.otherCount}); donor must promote replacement first.`,
    );
    return NextResponse.json(
      {
        error:
          "Set another payment method as default before removing this one.",
      },
      { status: 400 },
    );
  }

  try {
    await stripe.paymentMethods.detach(pmId);
  } catch (err) {
    console.error(
      "[/api/donor/me/payment-methods/[id]/remove] detach failed:",
      err,
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not remove payment method.",
      },
      { status: 502 },
    );
  }

  try {
    const pms = await listDonorPaymentMethods(customerId);
    return NextResponse.json({ success: true, paymentMethods: pms });
  } catch {
    return NextResponse.json({ success: true });
  }
}

// ─── Removal assessment ──────────────────────────────────────────────────────

type RemovalAssessment = {
  isDefault: boolean;
  otherCount: number;
  defaultPmId: string | null;
};

// Computes whether `pmId` is the customer's default and how many OTHER
// card PMs the customer has. Reads directly from
// `customer.invoice_settings.default_payment_method` (the only Stripe-
// supported source of truth for "default") and compares ids by string.
async function assessRemoval(
  stripe: Stripe,
  customerId: string,
  pmId: string,
): Promise<RemovalAssessment> {
  const [customer, pms] = await Promise.all([
    stripe.customers.retrieve(customerId),
    stripe.paymentMethods.list({ customer: customerId, type: "card" }),
  ]);

  // A DeletedCustomer has no invoice_settings; treat as "no default".
  if ("deleted" in customer && customer.deleted === true) {
    return { isDefault: false, otherCount: 0, defaultPmId: null };
  }

  // Without `expand`, Stripe returns default_payment_method as a string
  // (the pm id) or null. If the caller used expand, it's a PaymentMethod
  // object instead — we extract `.id` so we always end up with a string
  // or null.
  const dpm = customer.invoice_settings?.default_payment_method;
  const defaultPmId: string | null =
    typeof dpm === "string" ? dpm : (dpm?.id ?? null);

  return {
    isDefault: defaultPmId !== null && defaultPmId === pmId,
    otherCount: pms.data.filter((p) => p.id !== pmId).length,
    defaultPmId,
  };
}
