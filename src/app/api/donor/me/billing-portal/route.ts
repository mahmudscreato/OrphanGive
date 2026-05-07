import { NextResponse } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { getStripe } from "@/lib/stripe-client";

export const runtime = "nodejs";

// GET /api/donor/me/billing-portal
// Creates a Stripe Customer Portal session for the signed-in donor and
// returns the URL the client should redirect to. Requires the donor to
// have an existing Stripe customer.
//
// Pre-launch: configure the Customer Portal in the Stripe Dashboard
// with ONLY invoice history enabled. Disable PM management (we own
// that UI) and subscription cancellation (donors must cancel through
// our flow for the proper data lifecycle).
export async function GET() {
  const auth = await authedDonor();
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  const customerId = donor.og_stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No payment history yet. Make a donation to access your billing portal.",
      },
      { status: 400 },
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const returnUrl = `${siteUrl.replace(/\/$/, "")}/dashboard/billing`;

  const stripe = getStripe();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/donor/me/billing-portal] failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not open the billing portal.",
      },
      { status: 502 },
    );
  }
}
