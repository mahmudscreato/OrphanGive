import { NextResponse, type NextRequest } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe-client";
import { listDonorPaymentMethods } from "@/lib/payment-methods";

export const runtime = "nodejs";

// POST /api/donor/me/payment-methods/add
// Body: { paymentMethodId: string }
//
// Attaches a Stripe PaymentMethod (created client-side via stripe.js) to
// the signed-in donor's customer and promotes it to default if the
// customer doesn't already have one. Cross-donor isolation: customer id
// is always read from the donor's own row.
export async function POST(req: NextRequest) {
  const auth = await authedDonor();
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  let body: { paymentMethodId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const pmId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
  if (!pmId.startsWith("pm_")) {
    return NextResponse.json(
      { error: "Invalid paymentMethodId." },
      { status: 400 },
    );
  }

  const customerId = donor.og_stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No payment account on file yet. Make a donation first to add saved payment methods.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  try {
    await stripe.paymentMethods.attach(pmId, { customer: customerId });
  } catch (err) {
    console.error("[/api/donor/me/payment-methods/add] attach failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not attach payment method.",
      },
      { status: 502 },
    );
  }

  // If the customer has no default PM, promote this one. We re-read the
  // customer (fresh, after attach) to make this decision.
  try {
    const customer = await stripe.customers.retrieve(customerId);
    const hasDefault =
      !("deleted" in customer && customer.deleted === true) &&
      Boolean(customer.invoice_settings?.default_payment_method);
    if (!hasDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pmId },
      });
    }
  } catch (err) {
    // Non-fatal — the PM is attached; default-promotion just didn't run.
    // The donor can set it manually from the UI.
    console.warn(
      "[/api/donor/me/payment-methods/add] default promote skipped:",
      err,
    );
  }

  // Return the refreshed list so the UI doesn't have to round-trip again.
  try {
    const pms = await listDonorPaymentMethods(customerId);
    return NextResponse.json({ success: true, paymentMethods: pms });
  } catch {
    // If the list fails post-attach we still succeeded — let the client
    // refetch on its own.
    return NextResponse.json({ success: true });
  }
}
