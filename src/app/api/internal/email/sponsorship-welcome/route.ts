import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, siteUrl, verifyInternalAuth } from "@/lib/email";
import {
  fetchChildrenByIds,
  fetchDonorById,
  fetchSponsorshipsByIds,
  formatTo,
  isUuid,
  recentSentAtWithin,
  setDonorEmailSentAt,
} from "@/lib/email-data";
import {
  SponsorshipWelcomeEmail,
  type SponsorshipWelcomeItem,
} from "@/emails/SponsorshipWelcomeEmail";
import { labelForCause } from "@/lib/cause";
import { labelForVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const unauthed = verifyInternalAuth(req);
  if (unauthed) return unauthed;

  let body: { sponsorshipIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.sponsorshipIds) || body.sponsorshipIds.length === 0) {
    return NextResponse.json(
      { error: "sponsorshipIds (non-empty array) required" },
      { status: 400 },
    );
  }
  const ids = body.sponsorshipIds.filter(isUuid);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "no valid sponsorship ids" },
      { status: 400 },
    );
  }

  const sponsorships = await fetchSponsorshipsByIds(ids);
  if (sponsorships.length === 0) {
    return NextResponse.json(
      { error: "sponsorships not found" },
      { status: 404 },
    );
  }
  // Assert single donor across the batch.
  const donorIds = new Set(sponsorships.map((s) => s.donor));
  if (donorIds.size !== 1) {
    return NextResponse.json(
      {
        error: "sponsorships span multiple donors",
        donorIds: [...donorIds],
      },
      { status: 400 },
    );
  }
  const donorId = [...donorIds][0]!;
  const donor = await fetchDonorById(donorId);
  if (!donor || !donor.email) {
    return NextResponse.json(
      { error: "donor not found or has no email" },
      { status: 404 },
    );
  }

  // Dedup: if we sent this donor a welcome email within the last 6h,
  // don't send another. Covers Stripe-webhook retry storms and Flow
  // double-fires after a successful checkout.
  const recent = recentSentAtWithin(
    donor.welcome_email_sent_at,
    DEDUP_WINDOW_MS,
  );
  if (recent) {
    return NextResponse.json({
      skipped: true,
      reason: "already_sent_recently",
      sentAt: recent,
    });
  }

  const childMap = await fetchChildrenByIds(sponsorships.map((s) => s.child));
  const items: SponsorshipWelcomeItem[] = sponsorships.map((s) => {
    const c = childMap.get(s.child);
    return {
      childName: c?.display_name ?? "your sponsored child",
      childDistrict: c?.district ?? null,
      childAge: c?.age ?? null,
      childGenderPronoun: c?.pronoun ?? "they",
      paymentMode: s.payment_mode,
      amountUsd: s.amount_usd,
      nextBillingDate: s.payment_mode === "monthly" ? s.next_billing_date : null,
      causeLabel: labelForCause(s.cause),
      visibilityLabel: labelForVisibility(s.visibility),
    };
  });

  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const subject =
    items.length === 1
      ? `Thank you, ${firstName} — your sponsorship begins today`
      : `Thank you, ${firstName} — your sponsorships begin today`;

  const result = await sendEmail({
    to: formatTo(donor.email, firstName),
    subject,
    template: SponsorshipWelcomeEmail({
      firstName,
      sponsorships: items,
      dashboardUrl: siteUrl("/dashboard"),
    }),
  });

  if (!result.success) {
    // Do NOT mark sent — let the next call retry.
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Best-effort timestamp write; logged on failure but doesn't fail the call.
  await setDonorEmailSentAt(donor.id, "welcome_email_sent_at");

  return NextResponse.json({
    success: true,
    messageId: result.messageId,
    sponsorshipCount: items.length,
  });
}
