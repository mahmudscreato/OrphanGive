import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildById,
  fetchDonorById,
  fetchSponsorshipsByIds,
  formatTo,
} from "@/lib/email-data";
import { SponsorshipExtendedEmail } from "@/emails/SponsorshipExtendedEmail";
import { labelForCause } from "@/lib/cause";
import { labelForVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: {
    sponsorshipId?: unknown;
    additionalMonths?: unknown;
    newDurationMonths?: unknown;
    monthsRemaining?: unknown;
    newEndDateIso?: unknown;
    paidNow?: unknown;
    paymentAmountUsd?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = typeof body.sponsorshipId === "string" ? body.sponsorshipId : null;
  const additionalMonths =
    typeof body.additionalMonths === "number" ? body.additionalMonths : null;
  const newDurationMonths =
    typeof body.newDurationMonths === "number" ? body.newDurationMonths : null;
  const monthsRemaining =
    typeof body.monthsRemaining === "number" ? body.monthsRemaining : null;
  const newEndDateIso =
    typeof body.newEndDateIso === "string" ? body.newEndDateIso : null;
  const paidNow = body.paidNow === true;
  const paymentAmountUsd =
    typeof body.paymentAmountUsd === "number" ? body.paymentAmountUsd : 0;
  if (
    !id ||
    additionalMonths == null ||
    newDurationMonths == null ||
    monthsRemaining == null
  ) {
    return NextResponse.json(
      {
        error:
          "sponsorshipId, additionalMonths, newDurationMonths, monthsRemaining required",
      },
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
    subject: `Your sponsorship of ${childName} has been extended`,
    template: SponsorshipExtendedEmail({
      firstName,
      childName,
      additionalMonths,
      newDurationMonths,
      monthsRemaining,
      newEndDateIso,
      paidNow,
      paymentAmountUsd,
      sponsorshipUrl: siteUrl(`/dashboard/sponsorship/${id}`),
      causeLabel: labelForCause(sponsorship.cause),
      visibilityLabel: labelForVisibility(sponsorship.visibility),
    }),
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, messageId: result.messageId });
}
