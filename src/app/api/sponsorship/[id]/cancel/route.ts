import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  let body: { reason?: unknown } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    /* empty body OK */
  }
  const reasonRaw =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const cancellationReason = reasonRaw || "donor_cancelled";

  // Allowed states:
  //   - active / paused      → cancel the live subscription
  //   - pending_payment      → cancel the in-flight Stripe object the
  //                            donor never finished paying for
  // Anything else (cancelled / failed / completed) is a no-op refusal.
  const allowedStates = new Set([
    "active",
    "paused",
    "pending_payment",
  ]);
  if (!allowedStates.has(sponsorship.status)) {
    return NextResponse.json(
      {
        error: `Cannot cancel a sponsorship in state ${sponsorship.status}.`,
      },
      { status: 400 },
    );
  }

  // For one-time payments that already succeeded (status='active'),
  // the donor has already been charged — we can't unwind that here.
  if (
    sponsorship.payment_mode === "one_time" &&
    sponsorship.status !== "pending_payment"
  ) {
    return NextResponse.json(
      {
        error:
          "One-time sponsorships cannot be cancelled retroactively. Contact us if you need help.",
      },
      { status: 400 },
    );
  }

  // Pick the right Stripe op for the (mode, status) pair.
  const isPendingOneTime =
    sponsorship.payment_mode === "one_time" &&
    sponsorship.status === "pending_payment";
  if (isPendingOneTime) {
    if (!sponsorship.stripe_payment_intent_id) {
      return NextResponse.json(
        { error: "Pending sponsorship has no PaymentIntent." },
        { status: 400 },
      );
    }
  } else if (!sponsorship.stripe_subscription_id) {
    return NextResponse.json(
      { error: "Sponsorship has no Stripe subscription." },
      { status: 400 },
    );
  }

  // Cancel in Stripe. For monthly, the subscription.deleted webhook will
  // also fire and idempotently re-set the same fields; we update locally
  // anyway so the UI reflects the change immediately without waiting.
  try {
    if (isPendingOneTime) {
      await getStripe().paymentIntents.cancel(
        sponsorship.stripe_payment_intent_id!,
      );
    } else {
      await getStripe().subscriptions.cancel(
        sponsorship.stripe_subscription_id!,
        { prorate: false },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
    // "No such …" / "already canceled" isn't fatal — the local row
    // should still be marked cancelled.
    if (!/already|No such/i.test(msg)) {
      console.error("[sponsorship/cancel] stripe failed:", err);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    console.warn(
      "[sponsorship/cancel] stripe object already gone — proceeding to mark local row",
    );
  }

  const nowIso = new Date().toISOString();
  try {
    await updateSponsorship(sponsorship.id, {
      status: "cancelled",
      cancelled_at: nowIso,
      ended_at: nowIso,
      cancellation_reason: cancellationReason,
    });
  } catch (err) {
    console.error("[sponsorship/cancel] directus update failed:", err);
    return NextResponse.json(
      { error: "Internal update failed." },
      { status: 500 },
    );
  }

  // Email — best-effort.
  try {
    const child = await fetchChildById(
      typeof sponsorship.child === "string"
        ? sponsorship.child
        : sponsorship.child.id,
    );
    const firstName =
      donor.first_name?.trim() || donor.email.split("@")[0]!;
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has ended`,
      template: SponsorshipCancelledEmail({
        firstName,
        childName: child?.display_name ?? "your sponsored child",
        browseUrl: siteUrl("/children"),
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/cancel] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ success: true });
}
