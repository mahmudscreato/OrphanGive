import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchSponsorshipsByIds,
  formatTo,
} from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";
import { SponsorshipRefundEmail } from "@/emails/SponsorshipRefundEmail";

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
        ? `A refund of $${refundedAmountUsd.toFixed(0)} is on its way for your sponsorship of ${childName}`
        : `A refund is on its way for your sponsorship of ${childName}`
      : `Your sponsorship of ${childName} has ended — thank you`;

  // #2b (refund-template convergence) — a REFUND shares this route but
  // renders the dedicated SponsorshipRefundEmail (amount card + refund
  // copy), the SAME template the admin refund route uses inline. Before,
  // the webhook refund path fell back to the generic SponsorshipCancelledEmail
  // here, so the two refund paths sent two different templates. Non-refund
  // cancellations keep SponsorshipCancelledEmail. Email-only change — no
  // refund logic touched.
  const template =
    reason === "refunded"
      ? SponsorshipRefundEmail({
          firstName,
          childName,
          amount: refundedAmountUsd ?? 0,
          currency: "USD",
          adminReason: null,
          dashboardUrl: siteUrl(`/dashboard/sponsorship/${id}`),
        })
      : SponsorshipCancelledEmail({
          firstName,
          childName,
          browseUrl: siteUrl("/children"),
        });

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject,
    template,
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
