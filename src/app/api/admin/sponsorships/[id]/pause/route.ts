// Session 61 — Admin pause endpoint.
//
// POST /api/admin/sponsorships/[id]/pause
// Auth: admin session cookie
// Body: none (admin pause is always immediate; donor pause is the
//             same).
//
// Mirrors the donor /api/sponsorship/[id]/pause route's Stripe +
// Directus update + email pattern, but auth'd against the admin
// session and adds an audit_log row tagged
// admin_paused_sponsorship.

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipPausedEmail } from "@/emails/SponsorshipPausedEmail";
import {
  authedAdminSponsorship,
  fetchDonorForEmail,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
// Phase 0 — see /api/admin/sponsorships/[id]/cancel/route.ts for why
// we swap raw createItem for recordAuditEvent.
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedAdminSponsorship(id);
  if (!auth.ok) return auth.response;
  const { admin, sponsorship } = auth.ctx;

  // Same state guards as the donor route. Admin still respects the
  // payment-mode + status invariants — pausing a one-time gift makes
  // no sense; pausing a non-active sub will fail at Stripe.
  if (sponsorship.payment_mode !== "monthly") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: "Only monthly sponsorships can be paused.",
      },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "active") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: `Cannot pause a sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }
  if (!sponsorship.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: "no_subscription",
        message: "Sponsorship has no Stripe subscription.",
      },
      { status: 400 },
    );
  }

  // Stripe pause.
  try {
    await getStripe().subscriptions.update(sponsorship.stripe_subscription_id, {
      pause_collection: { behavior: "mark_uncollectible" },
    });
  } catch (err) {
    console.error("[admin/sponsorships/pause] stripe failed:", err);
    return NextResponse.json(
      {
        error: "stripe_failed",
        message: err instanceof Error ? err.message : "Stripe pause failed.",
      },
      { status: 502 },
    );
  }

  // Local row update.
  try {
    await updateSponsorship(sponsorship.id, {
      status: "paused",
      paused_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/sponsorships/pause] directus update failed:", err);
    return NextResponse.json(
      { error: "server_error", message: "Internal update failed." },
      { status: 500 },
    );
  }

  // Audit (best-effort; recordAuditEvent never throws).
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_paused_sponsorship",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: sponsorship.donor,
      childId: unwrapChildId(sponsorship),
    },
    request: req,
  });

  // Session 61.3 hotfix — donor email now attributes the pause to
  // the OrphanGive team (was: same neutral copy as donor self-pause,
  // which left the donor wondering who paused their support).
  // byAdmin=true switches the template's lead copy + adds the
  // "reply to this email if you have questions" line. No reason
  // captured for admin pause today (the pause modal is body-less);
  // the field stays optional in the template for the future.
  try {
    const donor = await fetchDonorForEmail(sponsorship.donor);
    const childId = unwrapChildId(sponsorship);
    const child = childId ? await fetchChildById(childId) : null;
    if (donor) {
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has been paused`,
        template: SponsorshipPausedEmail({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          resumeUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
          byAdmin: true,
        }),
      });
    }
  } catch (err) {
    console.warn(
      "[admin/sponsorships/pause] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}
