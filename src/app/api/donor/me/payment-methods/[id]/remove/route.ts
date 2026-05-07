import { NextResponse, type NextRequest } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe-client";
import {
  assertPaymentMethodOwnedBy,
  listDonorPaymentMethods,
} from "@/lib/payment-methods";

export const runtime = "nodejs";

// POST /api/donor/me/payment-methods/[id]/remove
// Detaches a PaymentMethod from the signed-in donor's customer.
// Refuses to remove the default PM when there are other PMs available
// (the donor must promote another to default first). When it IS the
// only PM, detach is allowed — the customer simply has no saved cards.
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

  // Compute "is this the default, and are there others?" up front so we
  // can refuse cleanly before any mutation.
  let isDefault = false;
  let otherCount = 0;
  try {
    const [customer, pms] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: "card" }),
    ]);
    const defaultPmId =
      "deleted" in customer && customer.deleted === true
        ? null
        : typeof customer.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : (customer.invoice_settings?.default_payment_method?.id ?? null);
    isDefault = defaultPmId === pmId;
    otherCount = pms.data.filter((p) => p.id !== pmId).length;
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

  if (isDefault && otherCount > 0) {
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
