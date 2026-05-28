import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import { updateSponsorship } from "@/lib/sponsorship-data";
import { promoteQueue } from "@/lib/queue";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipCancelledEmail } from "@/emails/SponsorshipCancelledEmail";
// Phase 0 — donor lifecycle audit. Previously this route wrote zero
// audit rows; the admin sponsorship timeline reader (see
// admin-sponsorships.ts:700-708) explicitly notes the gap and falls
// back to a "by donor" inference from row timestamps. With this call
// the reader gets real attribution + reason + IP / UA capture.
import { recordAuditEvent } from "@/lib/di-audit";
// P2 — revoke active reveals when the sponsorship truly ends so the
// (former) donor loses Tier-3 access. The helper is a no-op if the
// donor still has any other active/paused sponsorship of this child.
import { revokeRevealsForSponsorshipEnd } from "@/lib/reveal-data";

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

  const isPendingOneTime =
    sponsorship.payment_mode === "one_time" &&
    sponsorship.status === "pending_payment";

  // ── Prepaid scheduling ─────────────────────────────────────────────
  // If the donor cancels during a prepaid period (prepaid_months_remaining
  // > 0), we honour their paid-for coverage: the row stays 'active' until
  // the prepaid end date, at which point Session 15's cron flips it to
  // 'cancelled'. We immediately cancel any Stripe Subscription (the
  // monthly tail, if extended) so no future charges fire.
  const isPrepaidWithRemaining =
    sponsorship.payment_schedule === "monthly_prepaid" &&
    (sponsorship.prepaid_months_remaining ?? 0) > 0 &&
    !isPendingOneTime;

  if (isPrepaidWithRemaining) {
    // Prepaid period ends at scheduled_end_date - (extension months × 30.44d).
    // For a pure prepaid sponsorship (no monthly extension), this equals
    // scheduled_end_date itself.
    const monthlyExtensionMonths = Math.max(
      0,
      (sponsorship.duration_months ?? 0) -
        (sponsorship.prepaid_months_total ?? 0),
    );
    const baseEnd = sponsorship.scheduled_end_date
      ? new Date(sponsorship.scheduled_end_date)
      : null;
    const prepaidEndIso = baseEnd
      ? new Date(
          baseEnd.getTime() -
            monthlyExtensionMonths * 30.44 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : new Date().toISOString();

    // Cancel the monthly-extension sub if one exists. The webhook will
    // fire customer.subscription.deleted; we guard against that
    // overwriting our scheduled-cancel state by checking
    // cancellation_scheduled_at in the deleted handler.
    if (sponsorship.stripe_subscription_id) {
      try {
        await getStripe().subscriptions.cancel(
          sponsorship.stripe_subscription_id,
          { prorate: false },
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Stripe cancel failed.";
        if (!/already|No such/i.test(msg)) {
          console.error("[sponsorship/cancel] stripe sub cancel failed:", err);
          return NextResponse.json({ error: msg }, { status: 502 });
        }
      }
    }

    try {
      await updateSponsorship(sponsorship.id, {
        // Keep status 'active' — the donor still has prepaid coverage.
        cancellation_scheduled_at: prepaidEndIso,
        cancellation_reason:
          reasonRaw && reasonRaw !== "donor_cancelled"
            ? reasonRaw
            : "donor_cancelled_during_prepaid",
        // Clear stripe_subscription_id since the sub is now gone.
        stripe_subscription_id: null,
      });
    } catch (err) {
      console.error("[sponsorship/cancel] directus update failed:", err);
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }

    // Don't fire the SponsorshipCancelledEmail yet — the donor still
    // has coverage. Session 15's cron will fire it at prepaid-period end.

    await recordAuditEvent({
      actorUserId: donor.id,
      actorRole: "donor",
      action: "donor_cancelled_sponsorship",
      collection: "sponsorship",
      recordId: sponsorship.id,
      metadata: {
        donor: donor.id,
        childId:
          typeof sponsorship.child === "string"
            ? sponsorship.child
            : sponsorship.child.id,
        mode: "scheduled_for_prepaid_end",
        cancellationScheduledAt: prepaidEndIso,
        reason: reasonRaw || null,
      },
      request: req,
    });

    return NextResponse.json({
      success: true,
      mode: "scheduled_for_prepaid_end",
      cancellationScheduledAt: prepaidEndIso,
    });
  }

  // ── Standard cancellation path (no remaining prepaid coverage) ─────
  //
  // Session 58.7 — discriminate on WHAT THE ROW HOLDS, not on payment
  // mode. Three legitimate combinations exist:
  //
  //   stripe_subscription_id set, no PI    → recurring monthly sub
  //                                          (legacy AND new flow)
  //   stripe_payment_intent_id set, no sub → one-time gift OR pending
  //                                          monthly prepaid bundle
  //                                          (the new flow's mode=
  //                                          'prepaid-bundle' writes
  //                                          payment_mode='monthly'
  //                                          but uses a single PI, not
  //                                          a Subscription)
  //   neither set                          → the row was created but
  //                                          the Stripe object never
  //                                          attached (rare; resume
  //                                          / writePendingSponsorship
  //                                          attach the id AFTER the
  //                                          Stripe call, so if that
  //                                          call failed the row is
  //                                          orphaned). Local cancel
  //                                          only — no Stripe call.
  //
  // The pre-58.7 logic gated on isPendingOneTime which assumed
  // payment_mode='monthly' implies a subscription. Pending prepaid
  // (payment_mode='monthly', stripe_payment_intent_id set, no sub)
  // hit the else-branch and rejected with "no Stripe subscription".
  const hasPI = Boolean(sponsorship.stripe_payment_intent_id);
  const hasSub = Boolean(sponsorship.stripe_subscription_id);
  const stripeObjectKind: "pi" | "sub" | "none" = hasSub
    ? "sub"
    : hasPI
      ? "pi"
      : "none";

  // ── Session 58.5 — pre-cancel reconcile ──────────────────────────────
  //
  // "Cancel attempt" on a pending_payment row used to call
  // paymentIntents.cancel() / subscriptions.cancel() blindly. If the
  // underlying Stripe object had ALREADY succeeded (webhook race or
  // missed delivery), Stripe rejected the cancel with:
  //   "You cannot cancel this PaymentIntent because it has a status
  //    of succeeded..."
  // …and the donor saw a raw error.
  //
  // Defensive fix: retrieve the Stripe object first. If it's already
  // in a paid state, DON'T cancel — instead reconcile the local row
  // to the status the webhook would have set (active for sub /
  // prepaid; completed for one-time) and return a friendly success.
  // The webhook's own update is idempotent so its eventual arrival
  // (or replay) doesn't conflict.
  //
  // Only applies on the pending_payment cancel paths (the donor
  // clicking "Cancel attempt"). Active / paused cancellations stay
  // on the normal path — those are by definition not in an
  // unconfirmed state.
  if (sponsorship.status === "pending_payment") {
    const nowIso = new Date().toISOString();
    if (stripeObjectKind === "pi") {
      try {
        const pi = await getStripe().paymentIntents.retrieve(
          sponsorship.stripe_payment_intent_id!,
        );
        // succeeded   = donor was charged
        // processing  = mid-charge (will succeed shortly)
        // requires_capture = authorised, capture pending
        // All three mean we should NOT cancel and instead reconcile.
        if (
          pi.status === "succeeded" ||
          pi.status === "processing" ||
          pi.status === "requires_capture"
        ) {
          // 58.7 — match the webhook's reconcile shape for both
          // one-time (status='completed' + ended_at) and pending
          // prepaid (status='active' — the donor has paid the upfront
          // amount; the prepaid cron continues drawing months down).
          const isOneTime = sponsorship.payment_mode === "one_time";
          try {
            await updateSponsorship(sponsorship.id, {
              status: isOneTime ? "completed" : "active",
              ...(sponsorship.started_at ? {} : { started_at: nowIso }),
              ...(isOneTime ? { ended_at: nowIso } : {}),
            });
          } catch (err) {
            console.error(
              "[sponsorship/cancel] reconcile update failed:",
              err,
            );
            // Even if the local update failed, the webhook will
            // eventually flip the row. Surface a friendly message
            // either way.
          }
          return NextResponse.json({
            success: true,
            mode: "reconciled_already_succeeded",
            message:
              "This payment already completed — your sponsorship is now active.",
          });
        }
      } catch (err) {
        // Retrieve failed — fall through to the cancel attempt
        // below. The existing cancel catch handles "already gone"
        // gracefully.
        console.warn(
          "[sponsorship/cancel] PI retrieve failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    } else if (stripeObjectKind === "sub") {
      // Subscription path — pending_payment monthly with a sub id.
      try {
        const sub = await getStripe().subscriptions.retrieve(
          sponsorship.stripe_subscription_id!,
        );
        // Live states: 'active', 'trialing', 'past_due' (still
        // billing but a payment failed retry), 'unpaid' (escalated
        // past_due). 'trialing' covers queue-joined subs.
        // Cancelable: 'incomplete' (default_incomplete, awaiting
        // first payment confirmation) and 'incomplete_expired'.
        const liveStates = new Set([
          "active",
          "trialing",
          "past_due",
          "unpaid",
        ]);
        if (liveStates.has(sub.status)) {
          // The donor's sub is live but our row didn't get flipped
          // (webhook miss). Reconcile to active so the donor sees
          // the right state; we still allow the cancel below to
          // unwind it if that's what they intended — but per the
          // brief's intent, the donor clicked Cancel thinking the
          // payment failed; on discovering it succeeded, we keep
          // the live sub and return the reconcile message rather
          // than cancelling a healthy subscription.
          try {
            await updateSponsorship(sponsorship.id, {
              status: "active",
              ...(sponsorship.started_at ? {} : { started_at: nowIso }),
            });
          } catch (err) {
            console.error(
              "[sponsorship/cancel] sub reconcile update failed:",
              err,
            );
          }
          return NextResponse.json({
            success: true,
            mode: "reconciled_already_active",
            message:
              "This payment already completed — your sponsorship is now active.",
          });
        }
      } catch (err) {
        console.warn(
          "[sponsorship/cancel] sub retrieve failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // Cancel in Stripe. For monthly, the subscription.deleted webhook will
  // also fire and idempotently re-set the same fields; we update locally
  // anyway so the UI reflects the change immediately without waiting.
  //
  // Session 58.7 — branch on the Stripe object kind actually attached
  // to the row, not on payment_mode. Pending prepaid bundles are
  // payment_mode='monthly' but use a PaymentIntent (no subscription
  // exists). The pre-58.7 path always called subscriptions.cancel for
  // anything not isPendingOneTime and crashed with "no Stripe
  // subscription".
  try {
    if (stripeObjectKind === "pi") {
      await getStripe().paymentIntents.cancel(
        sponsorship.stripe_payment_intent_id!,
      );
    } else if (stripeObjectKind === "sub") {
      await getStripe().subscriptions.cancel(
        sponsorship.stripe_subscription_id!,
        { prorate: false },
      );
    }
    // stripeObjectKind === "none" → skip the Stripe call entirely.
    // No object means there's nothing to cancel server-side; we
    // proceed directly to the local-row update below.
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe cancel failed.";
    // Session 58.5 — second-line defense: if Stripe still throws
    // "cannot cancel ... succeeded" because the PI/sub state shifted
    // between our retrieve and our cancel, swallow gracefully + let
    // the local cancel proceed. The webhook will reconcile.
    const isAlreadyTerminal =
      /already|No such|status of succeeded|status of canceled/i.test(msg);
    if (!isAlreadyTerminal) {
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

  await recordAuditEvent({
    actorUserId: donor.id,
    actorRole: "donor",
    action: "donor_cancelled_sponsorship",
    collection: "sponsorship",
    recordId: sponsorship.id,
    metadata: {
      donor: donor.id,
      childId:
        typeof sponsorship.child === "string"
          ? sponsorship.child
          : sponsorship.child.id,
      mode: "immediate",
      reason: reasonRaw || null,
    },
    request: req,
  });

  // P2 — revoke active reveals (no-op if donor still has another
  // active/paused sponsorship of this child). Best-effort; failures
  // never block the cancel.
  {
    const childIdForRevoke =
      typeof sponsorship.child === "string"
        ? sponsorship.child
        : sponsorship.child.id;
    if (childIdForRevoke) {
      try {
        await revokeRevealsForSponsorshipEnd({
          sponsorshipId: sponsorship.id,
          donorId: donor.id,
          childId: childIdForRevoke,
          reason: "donor_cancel",
        });
      } catch (err) {
        console.warn(
          "[sponsorship/cancel] reveal revoke failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

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

  // Session 14.7: if the cancelled row was the active sponsor (or a
  // queued slot — promoteQueue is no-op when the head is still live),
  // advance the child's queue. The webhook handler also fires on
  // customer.subscription.deleted; either path is enough, both
  // running is harmless (promoteQueue is idempotent).
  const cancelledChildId =
    typeof sponsorship.child === "string"
      ? sponsorship.child
      : sponsorship.child.id;
  if (cancelledChildId) {
    try {
      await promoteQueue(cancelledChildId, { stripe: getStripe() });
    } catch (err) {
      console.warn(
        `[sponsorship/cancel] promoteQueue ${cancelledChildId} failed (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ success: true });
}
