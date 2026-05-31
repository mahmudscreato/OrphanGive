import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipPausedEmail } from "@/emails/SponsorshipPausedEmail";
// Phase 0 — donor lifecycle audit. See cancel/route.ts header for why.
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  if (sponsorship.payment_mode !== "monthly") {
    return NextResponse.json(
      { error: "Only monthly sponsorships can be paused." },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "active") {
    return NextResponse.json(
      {
        error: `Cannot pause a sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }
  if (!sponsorship.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Sponsorship has no Stripe subscription." },
      { status: 400 },
    );
  }

  // Stripe pause
  try {
    await getStripe().subscriptions.update(sponsorship.stripe_subscription_id, {
      pause_collection: { behavior: "mark_uncollectible" },
    });
  } catch (err) {
    console.error("[sponsorship/pause] stripe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe pause failed." },
      { status: 502 },
    );
  }

  // Local row update
  try {
    await updateSponsorship(sponsorship.id, {
      status: "paused",
      paused_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[sponsorship/pause] directus update failed:", err);
    return NextResponse.json(
      { error: "Internal update failed." },
      { status: 500 },
    );
  }

  await recordAuditEvent({
    actorUserId: donor.id,
    actorRole: "donor",
    action: "donor_paused_sponsorship",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: donor.id,
      childId:
        typeof sponsorship.child === "string"
          ? sponsorship.child
          : sponsorship.child.id,
    },
    request: req,
  });

  // Best-effort email — don't fail the action if email fails.
  try {
    // `sponsorship.child` is the expanded object form when fetched via
    // getSponsorshipForDonor (FULL_FIELDS includes child.id), so unwrap
    // the id explicitly. Casting to string here used to produce
    // "[object Object]" which fetchChildById rejected as a non-UUID,
    // collapsing the email's child name to "your sponsored child".
    const childId =
      typeof sponsorship.child === "string"
        ? sponsorship.child
        : sponsorship.child.id;
    const child = await fetchChildById(childId);
    const firstName =
      donor.first_name?.trim() || donor.email.split("@")[0]!;
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} is paused for now`,
      template: SponsorshipPausedEmail({
        firstName,
        childName: child?.display_name ?? "your sponsored child",
        resumeUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/pause] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ success: true });
}
