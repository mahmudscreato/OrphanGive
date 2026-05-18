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
// We don't send a "resumed" donor email because the donor route
// doesn't either (the next monthly invoice is the natural signal
// that the sub is live again). Adding one here would surprise
// donors with a notification they don't get from self-resume.

import { NextResponse, type NextRequest } from "next/server";
import { createItem } from "@directus/sdk";
import { getStripe } from "@/lib/stripe-client";
import { updateSponsorship } from "@/lib/sponsorship-data";
import {
  authedAdminSponsorship,
  unwrapChildId,
} from "@/lib/admin-sponsorship-actions";
import { directusServer } from "@/lib/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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

  try {
    await directusServer().request(
      createItem("audit_log" as never, {
        timestamp: new Date().toISOString(),
        actor: admin.userId,
        actor_role: "admin",
        action: "admin_resumed_sponsorship",
        collection: "sponsorship",
        record_id: sponsorship.id,
        metadata: {
          donor: sponsorship.donor,
          childId: unwrapChildId(sponsorship),
        },
      } as never),
    );
  } catch (err) {
    console.warn(
      "[admin/sponsorships/resume] audit write failed (swallowed)",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}
