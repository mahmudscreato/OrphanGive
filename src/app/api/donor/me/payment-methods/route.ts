import { NextResponse } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { listDonorPaymentMethods } from "@/lib/payment-methods";

export const runtime = "nodejs";

// GET /api/donor/me/payment-methods
// Returns the donor's saved cards. Empty array if they don't have a
// Stripe customer yet (rare — only first-time donors who haven't
// completed checkout). Cross-donor isolation is enforced by reading the
// customer id off the signed-in donor's row, never from the request.
export async function GET() {
  const auth = await authedDonor();
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  try {
    const pms = await listDonorPaymentMethods(donor.og_stripe_customer_id);
    return NextResponse.json({ paymentMethods: pms });
  } catch (err) {
    console.error("[/api/donor/me/payment-methods GET] Stripe failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not load payment methods.",
      },
      { status: 502 },
    );
  }
}
