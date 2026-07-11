import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import { updateSponsorship } from "@/lib/sponsorship-data";
// Phase 0 — donor lifecycle audit. See cancel/route.ts header for why.
import { recordAuditEvent } from "@/lib/di-audit";
// fix/parked-p1-batch (audit finding 10) — resume was the only donor
// lifecycle action that sent no email (pause/modify/cancel all do).
// Mirror the pause route's best-effort email with the existing
// SponsorshipResumedEmail template (byAdmin:false = donor self-resume).
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipResumedEmail } from "@/emails/SponsorshipResumedEmail";

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
      { error: "Only monthly sponsorships can be resumed." },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "paused") {
    return NextResponse.json(
      {
        error: `Cannot resume a sponsorship in state ${sponsorship.status}.`,
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

  // Stripe resume — clearing pause_collection.
  try {
    await getStripe().subscriptions.update(sponsorship.stripe_subscription_id, {
      pause_collection: "",
    });
  } catch (err) {
    console.error("[sponsorship/resume] stripe failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripe resume failed." },
      { status: 502 },
    );
  }

  try {
    await updateSponsorship(sponsorship.id, {
      status: "active",
      paused_at: null,
    });
  } catch (err) {
    console.error("[sponsorship/resume] directus update failed:", err);
    return NextResponse.json(
      { error: "Internal update failed." },
      { status: 500 },
    );
  }

  await recordAuditEvent({
    actorUserId: donor.id,
    actorRole: "donor",
    action: "donor_resumed_sponsorship",
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

  // Best-effort email — don't fail the action if email fails (mirrors
  // the pause route exactly). Recipient = the donor.
  try {
    // sponsorship.child is the expanded object when fetched via the
    // donor path; unwrap the id (a bare String() cast yields
    // "[object Object]" which fetchChildById rejects).
    const childId =
      typeof sponsorship.child === "string"
        ? sponsorship.child
        : sponsorship.child.id;
    const child = await fetchChildById(childId);
    const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has resumed`,
      template: SponsorshipResumedEmail({
        firstName,
        childName: child?.display_name ?? "your sponsored child",
        dashboardUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
        byAdmin: false,
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/resume] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ success: true });
}
