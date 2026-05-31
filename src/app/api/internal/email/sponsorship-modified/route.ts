import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchSponsorshipsByIds,
  formatTo,
} from "@/lib/email-data";
import { SponsorshipModifiedEmail } from "@/emails/SponsorshipModifiedEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: {
    sponsorshipId?: unknown;
    oldAmountUsd?: unknown;
    newAmountUsd?: unknown;
    prorationCents?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = typeof body.sponsorshipId === "string" ? body.sponsorshipId : null;
  const oldAmount =
    typeof body.oldAmountUsd === "number" ? body.oldAmountUsd : null;
  const newAmount =
    typeof body.newAmountUsd === "number" ? body.newAmountUsd : null;
  const prorationCents =
    typeof body.prorationCents === "number" ? body.prorationCents : null;
  if (!id || oldAmount == null || newAmount == null) {
    return NextResponse.json(
      { error: "sponsorshipId, oldAmountUsd, newAmountUsd required" },
      { status: 400 },
    );
  }

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

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: `Your monthly amount for ${childName} is updated`,
    template: SponsorshipModifiedEmail({
      firstName,
      childName,
      oldAmountUsd: oldAmount,
      newAmountUsd: newAmount,
      nextBillingDate: sponsorship.next_billing_date,
      prorationCents,
      dashboardUrl: siteUrl("/dashboard"),
    }),
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
