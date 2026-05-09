import { NextResponse, type NextRequest } from "next/server";
import { authedDonor } from "@/lib/api-auth";
import { cartItemFromSponsorship } from "@/lib/cart-data";
import { getSponsorshipForDonor } from "@/lib/sponsorship-data";

export const runtime = "nodejs";

// GET /api/cart/resume?sponsorshipId=<uuid>
//
// Read-only inspection endpoint for the resume-pending flow. Given a
// pending_payment sponsorship id that belongs to the signed-in donor,
// returns the CartItem shape that originally produced it, plus the
// stale Stripe references the next checkout will need to reconcile.
//
//   200  { item, sponsorshipId, stripe_payment_intent_id?, stripe_subscription_id? }
//   400  missing/invalid sponsorshipId
//   401  not signed in
//   404  not owned by signed-in donor (or doesn't exist)
//   410  status is no longer 'pending_payment' (e.g. it activated
//        or got cancelled while the donor was clicking)
//
// The /checkout page calls this directly via server-side logic when
// the URL carries `?resume=`; this route exists for any client code
// that wants to inspect a resume target before navigating.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await authedDonor({ requireApproved: false });
  if ("response" in auth) return auth.response;
  const { donor } = auth;

  const sponsorshipId = req.nextUrl.searchParams.get("sponsorshipId");
  if (!sponsorshipId || !UUID_RE.test(sponsorshipId)) {
    return NextResponse.json(
      { error: "sponsorshipId (uuid) required." },
      { status: 400 },
    );
  }

  const sponsorship = await getSponsorshipForDonor(sponsorshipId, donor.id);
  if (!sponsorship) {
    // Either doesn't exist OR belongs to a different donor — return
    // the same code in both cases so we don't leak existence.
    return NextResponse.json(
      { error: "Sponsorship not found." },
      { status: 404 },
    );
  }

  if (sponsorship.status !== "pending_payment") {
    // Activated, cancelled, completed, etc. — nothing to resume.
    // 410 Gone is the right semantic: the resource was once
    // resumable, isn't any more.
    return NextResponse.json(
      {
        error:
          "This sponsorship is no longer awaiting payment.",
        status: sponsorship.status,
      },
      { status: 410 },
    );
  }

  const item = cartItemFromSponsorship(sponsorship);
  return NextResponse.json({
    sponsorshipId: sponsorship.id,
    item,
    // Surfaced so callers can see which Stripe objects the next
    // checkout/init's cancelPendings will reconcile. Informational
    // only — cancelPendings finds these on its own via
    // getRecentPendingForDonor.
    stripe_payment_intent_id: sponsorship.stripe_payment_intent_id,
    stripe_subscription_id: sponsorship.stripe_subscription_id,
  });
}
