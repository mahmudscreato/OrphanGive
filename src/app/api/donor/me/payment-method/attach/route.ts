import { NextResponse, type NextRequest } from "next/server";
import { readUser } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { getStripe } from "@/lib/stripe-client";

export const runtime = "nodejs";

// Attaches a Stripe PaymentMethod to the donor's existing Stripe Customer
// and sets it as the default. Used by the in-modal extension flow when
// the donor doesn't have a saved card yet (e.g. checkout pre-dated the
// setup_future_usage fix). Cross-donor isolation is automatic — we only
// ever touch the customer id stored on the signed-in donor's row.
export async function POST(req: NextRequest) {
  const donor = await getCurrentDonor();
  if (!donor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (getDonorState(donor) !== "approved") {
    return NextResponse.json(
      { error: "Account is not approved." },
      { status: 403 },
    );
  }

  let body: { paymentMethodId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const pmId =
    typeof body.paymentMethodId === "string"
      ? body.paymentMethodId.trim()
      : "";
  // Stripe payment-method ids look like `pm_…`. Reject anything that
  // doesn't match — saves a network round-trip and prevents a confusing
  // Stripe error.
  if (!pmId.startsWith("pm_")) {
    return NextResponse.json(
      { error: "Invalid paymentMethodId." },
      { status: 400 },
    );
  }

  // Read the donor's customer id directly off their user row. We
  // intentionally do NOT trust any client-supplied id.
  const userRow = (await directusServer().request(
    readUser(donor.id as never, {
      fields: ["og_stripe_customer_id"],
    } as never),
  )) as unknown as { og_stripe_customer_id?: string | null };
  const customerId = userRow?.og_stripe_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer on file. Please complete a sponsorship checkout first.",
      },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  try {
    await stripe.paymentMethods.attach(pmId, { customer: customerId });
  } catch (err) {
    console.error("[pm/attach] attach failed:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Stripe attach failed.",
      },
      { status: 502 },
    );
  }
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pmId },
    });
  } catch (err) {
    console.error("[pm/attach] customer update failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Stripe customer update failed.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
