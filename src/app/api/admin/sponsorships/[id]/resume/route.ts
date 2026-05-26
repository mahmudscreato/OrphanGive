// Session 61 — Admin resume endpoint.
//
// POST /api/admin/sponsorships/[id]/resume
// Auth: admin session cookie
// Body: none
//
// Mirrors the donor resume route: clears pause_collection on the
// Stripe sub + flips local status back to 'active' + null
// paused_at. Audit row tagged admin_resumed_sponsorship.
//
// Session 61.3 hotfix — DOES send a "resumed" donor email now.
// Previously the rationale was "the donor route doesn't either, so
// admin shouldn't surprise the donor with a notification donors
// don't get from self-resume." But admin-initiated resume IS a
// surprise the donor needs to know about: from the donor's
// perspective they paused their support, did nothing else, and
// then started getting charged again. Without an email, that
// reads as "OrphanGive started charging me without asking." The
// email closes the loop. Donor self-resume still doesn't email —
// the symmetry argument doesn't hold when the actor is different.

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipResumedEmail } from "@/emails/SponsorshipResumedEmail";
import {
  authedAdminSponsorship,
  fetchDonorForEmail,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
// Phase 0 — see /api/admin/sponsorships/[id]/cancel/route.ts for why.
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

  if (sponsorship.payment_mode !== "monthly") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: "Only monthly sponsorships can be resumed.",
      },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "paused") {
    return NextResponse.json(
      {
        error: "invalid_state",
        message: `Cannot resume a sponsorship in state ${sponsorship.status}.`,
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

  try {
    await getStripe().subscriptions.update(sponsorship.stripe_subscription_id, {
      // Empty string clears pause_collection per Stripe's API.
      pause_collection: "",
    });
  } catch (err) {
    console.error("[admin/sponsorships/resume] stripe failed:", err);
    return NextResponse.json(
      {
        error: "stripe_failed",
        message: err instanceof Error ? err.message : "Stripe resume failed.",
      },
      { status: 502 },
    );
  }

  try {
    await updateSponsorship(sponsorship.id, {
      status: "active",
      paused_at: null,
    });
  } catch (err) {
    console.error("[admin/sponsorships/resume] directus update failed:", err);
    return NextResponse.json(
      { error: "server_error", message: "Internal update failed." },
      { status: 500 },
    );
  }

  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_resumed_sponsorship",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: sponsorship.donor,
      childId: unwrapChildId(sponsorship),
    },
    request: req,
  });

  // Session 61.3 hotfix — donor email mirroring the pause + cancel
  // pattern. Fire-and-await with non-fatal catch (same shape the
  // other admin endpoints use). Resume endpoint has no body / no
  // admin reason today, so adminReason is omitted; byAdmin=true
  // drives the "by the OrphanGive team" copy.
  try {
    const donor = await fetchDonorForEmail(sponsorship.donor);
    const childId = unwrapChildId(sponsorship);
    const child = childId ? await fetchChildById(childId) : null;
    if (donor) {
      const firstName =
        donor.first_name?.trim() || donor.email.split("@")[0]!;
      await sendEmail({
        to: formatTo(donor.email, firstName),
        subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has been resumed`,
        template: SponsorshipResumedEmail({
          firstName,
          childName: child?.display_name ?? "your sponsored child",
          dashboardUrl: siteUrl(`/dashboard/sponsorship/${sponsorship.id}`),
          byAdmin: true,
        }),
      });
    }
  } catch (err) {
    console.warn(
      "[admin/sponsorships/resume] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}
