import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchSponsorshipsByIds,
  formatTo,
} from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: {
    sponsorshipId?: unknown;
    reason?: unknown;
    refundedAmountUsd?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = typeof body.sponsorshipId === "string" ? body.sponsorshipId : null;
  if (!id) {
    return NextResponse.json(
      { error: "sponsorshipId is required" },
      { status: 400 },
    );
  }
  // Session 15b1.1 — refund context shares this template but
  // wants a refund-specific subject. Caller (charge.refunded
  // handler in webhook) sends reason='refunded' + the dollar
  // amount; everything else falls back to the generic cancel copy.
  const reason = typeof body.reason === "string" ? body.reason : null;
  const refundedAmountUsd =
    typeof body.refundedAmountUsd === "number"
      ? body.refundedAmountUsd
      : null;

  const [sponsorship] = await fetchSponsorshipsByIds([id]);
  if (!sponsorship) {
    return NextResponse.json(
      { error: "sponsorship not found" },
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

  const subject =
    reason === "refunded"
      ? refundedAmountUsd !== null
        ? `Refund of $${refundedAmountUsd.toFixed(0)} processed for your sponsorship of ${childName}`
        : `Refund processed for your sponsorship of ${childName}`
      : `Your sponsorship of ${childName} has ended`;

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject,
    template: SponsorshipCancelledEmail({
      firstName,
      childName,
      browseUrl: siteUrl("/children"),
    }),
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
