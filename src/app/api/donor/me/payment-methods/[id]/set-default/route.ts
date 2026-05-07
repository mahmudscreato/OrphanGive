import { NextResponse, type NextRequest } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe-client";
import {
  assertPaymentMethodOwnedBy,
  listDonorPaymentMethods,
} from "@/lib/payment-methods";

export const runtime = "nodejs";

// POST /api/donor/me/payment-methods/[id]/set-default
// Promotes the named PaymentMethod to the customer's default. Requires
// the PM to belong to the signed-in donor's customer.
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

  try {
    await assertPaymentMethodOwnedBy(pmId, customerId);
  } catch {
    return NextResponse.json(
      { error: "Payment method not found." },
      { status: 404 },
    );
  }

  const stripe = getStripe();
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  } catch (err) {
    console.error(
      "[/api/donor/me/payment-methods/[id]/set-default] failed:",
      err,
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not update default payment method.",
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
