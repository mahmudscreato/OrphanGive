// Session 58.2-overnight Task 2 — campaign donation thank-you email.
//
// Internal endpoint called by the Stripe webhook when a one-time
// donation with child=null (campaign) succeeds. We don't reuse the
// sponsorship-welcome route because that template fetches the child
// and personalizes around it; campaign donations have no child.
//
// Inputs: { sponsorshipId }
// Reads the sponsorship row directly via the SDK (the existing
// fetchSponsorshipsByIds helper doesn't include the 58.2 columns we
// need), resolves the cause name from the linked donation_package
// (when present), and ships the email through the standard
// sendEmail helper.

import { NextResponse, type NextRequest } from "next/server";
import { readItem } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchDonorById,
  formatTo,
  isUuid,
} from "@/lib/email-data";
import { getPackageById } from "@/lib/donation-packages";
import { CampaignDonationThankYouEmail } from "@/emails/CampaignDonationThankYouEmail";

export const runtime = "nodejs";

interface CampaignSponsorshipRow {
  id: string;
  donor: string;
  child: string | null;
  cause_tag: string | null;
  donation_package: string | null;
  donor_currency_code: string | null;
  donor_currency_amount: number | string | null;
  amount_usd: number | string | null;
  date_created: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: { sponsorshipId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sponsorshipId =
    typeof body.sponsorshipId === "string" ? body.sponsorshipId : null;
  if (!sponsorshipId || !isUuid(sponsorshipId)) {
    return NextResponse.json(
      { error: "sponsorshipId (uuid) required" },
      { status: 400 },
    );
  }

  // Direct SDK read so we get the 58.2 columns. Returns null if
  // sponsorship doesn't exist OR Directus permissions reject —
  // both treated as "not found" with a 404.
  let row: CampaignSponsorshipRow | null = null;
  try {
    row = (await directusServer().request(
      readItem("sponsorship" as never, sponsorshipId, {
        fields: [
          "id",
          "donor",
          "child",
          "cause_tag",
          "donation_package",
          "donor_currency_code",
          "donor_currency_amount",
          "amount_usd",
          "date_created",
          "started_at",
          "ended_at",
        ],
      } as never),
    )) as unknown as CampaignSponsorshipRow;
  } catch {
    row = null;
  }
  if (!row) {
    return NextResponse.json({ error: "sponsorship not found" }, { status: 404 });
  }

  // Defensive: this route is for CAMPAIGN donations only. If the row
  // has a child, the caller should have used /sponsorship-welcome
  // instead. Refuse rather than send the wrong email.
  if (row.child) {
    return NextResponse.json(
      {
        error: "child-scoped sponsorship; use /sponsorship-welcome instead",
      },
      { status: 400 },
    );
  }

  const donor = await fetchDonorById(row.donor);
  if (!donor || !donor.email) {
    return NextResponse.json(
      { error: "donor not found or has no email" },
      { status: 404 },
    );
  }

  // Resolve cause name. Three sources, in order:
  //   1. donation_package.name_en (package-backed)
  //   2. cause_tag (custom amount with a cause hint)
  //   3. Generic fallback
  let causeName: string;
  if (row.donation_package) {
    const pkg = await getPackageById(row.donation_package, {
      includeInactive: true,
    });
    causeName = pkg?.name_en ?? row.cause_tag ?? "Your generous gift";
  } else if (row.cause_tag) {
    causeName = row.cause_tag;
  } else {
    causeName = "Your generous gift";
  }

  // Donor-currency amount string. We prefer the snapshotted donor
  // currency columns (Session 58.2) and fall back to amount_usd-as-
  // USD only when those are missing (legacy rows shouldn't reach
  // this route since they have child!=null, but defensive).
  const donorAmountNum =
    row.donor_currency_amount != null
      ? typeof row.donor_currency_amount === "number"
        ? row.donor_currency_amount
        : Number.parseFloat(String(row.donor_currency_amount))
      : null;
  const amount =
    donorAmountNum != null && row.donor_currency_code
      ? `${donorAmountNum.toLocaleString()} ${row.donor_currency_code}`
      : `$${Number(row.amount_usd ?? 0).toLocaleString()} USD`;

  // paidAt: prefer started_at (set by webhook on succeeded events);
  // fall back to date_created (always present).
  const paidAtStr = row.started_at ?? row.date_created ?? new Date().toISOString();
  const paidAt = new Date(paidAtStr);

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const subject = `Thank you, ${firstName} — your gift is on its way`;

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject,
    template: CampaignDonationThankYouEmail({
      donorFirstName: firstName,
      amount,
      causeName,
      causeTag: row.cause_tag,
      paidAt,
      dashboardUrl: siteUrl("/dashboard"),
    }),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    sponsorshipId,
  });
}
