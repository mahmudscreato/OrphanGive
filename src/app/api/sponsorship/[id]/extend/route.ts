import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import {
  updateSponsorship,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import {
  CUSTOM_DURATION_MAX,
  CUSTOM_DURATION_MIN,
  calculateScheduledEndDate,
  isPaymentSchedule,
  type PaymentSchedule,
} from "@/lib/pricing";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipExtendedEmail } from "@/emails/SponsorshipExtendedEmail";
import { shiftQueueDates, sendQueueShiftEmail } from "@/lib/queue";
import { getActiveMonthlySponsorForChild } from "@/lib/sponsorship-data";

export const runtime = "nodejs";

// Pushes the existing scheduled_end_date out by N months (calendar-ish:
// 30.44 days/month). Used by both extension paths so they agree on the
// end-date math regardless of which Stripe operation we run.
// Session 14.7 Phase 2 — after the active sponsor's extension lands,
// every queued donor's start date moves forward. Call this once per
// successful extension path to recompute the queue and send shift
// emails to the affected donors. Best-effort: failures here log but
// don't unwind the extension itself.
async function shiftQueuedDonorsAfterExtend(opts: {
  childId: string;
  newEnd: Date;
  stripe: Stripe;
}): Promise<void> {
  try {
    // Resolve the active sponsor's first name once, so each shift
    // email can credit them by name (when their visibility='named').
    const active = await getActiveMonthlySponsorForChild(opts.childId);
    const activeFirstName =
      active?.visibility === "named" ? active.donorFirstName ?? null : null;
    const { shifted } = await shiftQueueDates(opts.childId, opts.newEnd, {
      stripe: opts.stripe,
    });
    for (const s of shifted) {
      await sendQueueShiftEmail(s, {
        activeSponsorFirstName: activeFirstName,
      });
    }
  } catch (err) {
    console.warn(
      `[sponsorship/extend] shiftQueueDates fan-out failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }
}

function newScheduledEnd(
  currentEnd: string | null,
  additionalMonths: number,
  fallbackBase: Date = new Date(),
): Date {
  const base = currentEnd ? new Date(currentEnd) : fallbackBase;
  const baseTime = Number.isNaN(base.getTime()) ? Date.now() : base.getTime();
  return new Date(
    baseTime + additionalMonths * 30.44 * 24 * 60 * 60 * 1000,
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  let body: { additionalMonths?: unknown; paymentSchedule?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const additionalMonths =
    typeof body.additionalMonths === "number"
      ? body.additionalMonths
      : Number(body.additionalMonths);
  if (
    !Number.isFinite(additionalMonths) ||
    !Number.isInteger(additionalMonths) ||
    additionalMonths < CUSTOM_DURATION_MIN ||
    additionalMonths > CUSTOM_DURATION_MAX
  ) {
    return NextResponse.json(
      {
        error: `additionalMonths must be an integer ${CUSTOM_DURATION_MIN}-${CUSTOM_DURATION_MAX}.`,
      },
      { status: 400 },
    );
  }
  const requestedSchedule = body.paymentSchedule;
  if (!isPaymentSchedule(requestedSchedule)) {
    return NextResponse.json(
      { error: "paymentSchedule must be 'monthly' or 'monthly_prepaid'." },
      { status: 400 },
    );
  }

  // ── Eligibility checks ──────────────────────────────────────────────
  if (sponsorship.payment_mode === "one_time") {
    return NextResponse.json(
      {
        error:
          "One-time gifts cannot be extended. Make a new sponsorship to support this child again.",
      },
      { status: 400 },
    );
  }
  if (sponsorship.status === "completed") {
    return NextResponse.json(
      {
        error:
          "This sponsorship is complete. Make a new sponsorship to support this child again.",
      },
      { status: 400 },
    );
  }
  if (sponsorship.status === "cancelled") {
    return NextResponse.json(
      { error: "Cancelled sponsorships cannot be extended." },
      { status: 400 },
    );
  }
  // Indefinite recurring can't be extended — there's no end date to push.
  const isIndefinite =
    sponsorship.payment_schedule === "monthly" &&
    sponsorship.duration_months == null;
  if (isIndefinite) {
    return NextResponse.json(
      {
        error:
          "Indefinite sponsorships continue until cancelled. There's nothing to extend — please cancel and create a new fixed-term sponsorship if needed.",
      },
      { status: 400 },
    );
  }
  // Prepaid sponsorships now accept BOTH extension shapes:
  //   • monthly_prepaid → pay for the extension upfront (existing)
  //   • monthly        → schedule a NEW sub that starts charging
  //                      after the prepaid period ends (new)

  const isAddToSchedule =
    sponsorship.payment_schedule === "monthly" &&
    requestedSchedule === "monthly";
  const isPayNow = requestedSchedule === "monthly_prepaid";
  const isPrepaidWithMonthlyExtension =
    sponsorship.payment_schedule === "monthly_prepaid" &&
    requestedSchedule === "monthly";

  // ── Path 1: Recurring + add to monthly schedule (no charge today) ──
  if (isAddToSchedule) {
    if (!sponsorship.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Sponsorship has no Stripe subscription." },
        { status: 400 },
      );
    }
    const newEnd = newScheduledEnd(
      sponsorship.scheduled_end_date,
      additionalMonths,
    );
    try {
      await getStripe().subscriptions.update(
        sponsorship.stripe_subscription_id,
        { cancel_at: Math.floor(newEnd.getTime() / 1000) },
      );
    } catch (err) {
      console.error("[sponsorship/extend] sub update failed:", err);
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Stripe update failed.",
        },
        { status: 502 },
      );
    }
    const newDuration = (sponsorship.duration_months ?? 0) + additionalMonths;
    try {
      await updateSponsorship(sponsorship.id, {
        duration_months: newDuration,
        scheduled_end_date: newEnd.toISOString(),
      });
    } catch (err) {
      console.error("[sponsorship/extend] directus update failed:", err);
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }
    await fireExtendEmail({
      sponsorship,
      additionalMonths,
      newDuration,
      newEnd,
      paidNow: false,
      paymentAmount: 0,
      donorEmail: donor.email,
      donorFirstName:
        donor.first_name?.trim() || donor.email.split("@")[0]!,
    });
    // Session 14.7 Phase 2: queued donors' start dates shift forward.
    {
      const childIdRef =
        typeof sponsorship.child === "string"
          ? sponsorship.child
          : sponsorship.child?.id ?? null;
      if (childIdRef) {
        await shiftQueuedDonorsAfterExtend({
          childId: childIdRef,
          newEnd,
          stripe: getStripe(),
        });
      }
    }
    return NextResponse.json({
      success: true,
      mode: "added_to_schedule",
      newEndDate: newEnd.toISOString(),
      newDurationMonths: newDuration,
    });
  }

  // ── Path 3: Prepaid + add monthly billing after prepaid ends ───────
  // The donor wants to keep their existing prepaid coverage and tack on
  // recurring monthly months that begin charging when the prepaid
  // period ends. We create a NEW Stripe Subscription for this child
  // anchored at the prepaid_end_date (so it doesn't charge before then)
  // and set cancel_at to the new total end date so it auto-stops after
  // the additional months.
  if (isPrepaidWithMonthlyExtension) {
    if (!sponsorship.stripe_customer_id) {
      return NextResponse.json(
        { error: "Sponsorship has no Stripe customer on file." },
        { status: 400 },
      );
    }
    if (!sponsorship.scheduled_end_date) {
      return NextResponse.json(
        { error: "Prepaid sponsorship has no end date on file." },
        { status: 400 },
      );
    }
    // Charging off-session in the future also requires a saved card —
    // surface the same sentinel as Path 2 so the modal swaps to the
    // inline card-collector flow.
    const stripe = getStripe();
    let pmId: string | null = null;
    try {
      const customer = (await stripe.customers.retrieve(
        sponsorship.stripe_customer_id,
        { expand: ["invoice_settings.default_payment_method"] },
      )) as Stripe.Customer | Stripe.DeletedCustomer;
      if (!("deleted" in customer && customer.deleted)) {
        const def = (customer as Stripe.Customer).invoice_settings
          ?.default_payment_method;
        pmId = typeof def === "string" ? def : def?.id ?? null;
      }
    } catch (err) {
      console.warn(
        "[sponsorship/extend] customer retrieve failed:",
        err instanceof Error ? err.message : err,
      );
    }
    if (!pmId) {
      return NextResponse.json(
        {
          error: "no_saved_payment_method",
          message: "Please enter a payment method to continue.",
        },
        { status: 200 },
      );
    }

    const childIdStr =
      typeof sponsorship.child === "string"
        ? sponsorship.child
        : sponsorship.child.id;

    const prepaidEnd = new Date(sponsorship.scheduled_end_date);
    const newEnd = newScheduledEnd(
      sponsorship.scheduled_end_date,
      additionalMonths,
    );

    // Mint a fresh Product+Price for this monthly extension. We
    // intentionally don't reuse Prices across sponsorships — Stripe
    // Prices are immutable, and per-sponsorship Prices keep the
    // accounting clean.
    let product: Stripe.Product;
    let price: Stripe.Price;
    let newSub: Stripe.Subscription;
    try {
      product = await stripe.products.create({
        name: `Sponsorship extension: child ${childIdStr}`,
        metadata: {
          child_id: childIdStr,
          donor_id: donor.id,
          source: "prepaid_extension",
        },
      });
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(sponsorship.amount_usd * 100),
        currency: "usd",
        recurring: { interval: "month" },
      });
      newSub = await stripe.subscriptions.create({
        customer: sponsorship.stripe_customer_id,
        items: [{ price: price.id }],
        // Defer the first charge by putting the sub in 'trialing' state
        // until the prepaid period ends. Stripe rejects
        // billing_cycle_anchor more than ~1 natural billing cycle out;
        // trial_end has no such limit, and no proration math is needed
        // because nothing is billed during the trial.
        trial_end: Math.floor(prepaidEnd.getTime() / 1000),
        cancel_at: Math.floor(newEnd.getTime() / 1000),
        default_payment_method: pmId,
        metadata: {
          donor_id: donor.id,
          child_id: childIdStr,
          sponsorship_id: sponsorship.id,
          is_prepaid_extension: "true",
          additional_months: String(additionalMonths),
        },
      });
    } catch (err) {
      console.error("[sponsorship/extend] prepaid+monthly setup failed:", err);
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Stripe subscription creation failed.",
        },
        { status: 502 },
      );
    }

    // Update local row: bind the new sub, extend duration + end date.
    // prepaid_months_total / prepaid_months_remaining stay unchanged —
    // the prepaid coverage is the same; only the post-prepaid tail
    // grows.
    const newDuration =
      (sponsorship.duration_months ?? sponsorship.prepaid_months_total ?? 0) +
      additionalMonths;
    try {
      await updateSponsorship(sponsorship.id, {
        stripe_subscription_id: newSub.id,
        duration_months: newDuration,
        scheduled_end_date: newEnd.toISOString(),
      });
    } catch (err) {
      console.error("[sponsorship/extend] directus update failed:", err);
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }

    await fireExtendEmail({
      sponsorship,
      additionalMonths,
      newDuration,
      newEnd,
      paidNow: false,
      paymentAmount: 0,
      donorEmail: donor.email,
      donorFirstName:
        donor.first_name?.trim() || donor.email.split("@")[0]!,
      monthlyExtensionAfterPrepaid: true,
      prepaidEndDateIso: sponsorship.scheduled_end_date,
      monthlyAmountUsd: sponsorship.amount_usd,
    });

    // Session 14.7 Phase 2: queued donors' start dates shift forward.
    {
      const childIdRef =
        typeof sponsorship.child === "string"
          ? sponsorship.child
          : sponsorship.child?.id ?? null;
      if (childIdRef) {
        await shiftQueuedDonorsAfterExtend({
          childId: childIdRef,
          newEnd,
          stripe: getStripe(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: "monthly_after_prepaid",
      newEndDate: newEnd.toISOString(),
      newDurationMonths: newDuration,
      monthlyStartsAt: prepaidEnd.toISOString(),
    });
  }

  // ── Path 2: Pay-now extension (PI charged off-session) ─────────────
  if (isPayNow) {
    if (!sponsorship.stripe_customer_id) {
      return NextResponse.json(
        { error: "Sponsorship has no Stripe customer on file." },
        { status: 400 },
      );
    }
    const stripe = getStripe();

    // Find the customer's default payment method. Without one we can't
    // charge off-session — bail with a friendly error.
    let pmId: string | null = null;
    try {
      const customer = (await stripe.customers.retrieve(
        sponsorship.stripe_customer_id,
        { expand: ["invoice_settings.default_payment_method"] },
      )) as Stripe.Customer | Stripe.DeletedCustomer;
      if (!("deleted" in customer && customer.deleted)) {
        const def = (customer as Stripe.Customer).invoice_settings
          ?.default_payment_method;
        pmId = typeof def === "string" ? def : def?.id ?? null;
      }
    } catch (err) {
      console.warn(
        "[sponsorship/extend] customer retrieve failed:",
        err instanceof Error ? err.message : err,
      );
    }
    if (!pmId) {
      // Sentinel response: 200 + this specific error code tells the
      // client to swap the modal into an inline card-entry flow instead
      // of showing a red banner. After the donor enters a card, the
      // client attaches it via /api/donor/me/payment-method/attach and
      // retries this route.
      return NextResponse.json(
        {
          error: "no_saved_payment_method",
          message: "Please enter a payment method to continue.",
        },
        { status: 200 },
      );
    }

    const totalCents = Math.round(
      sponsorship.amount_usd * additionalMonths * 100,
    );

    // Create + confirm the PaymentIntent in one call. If Stripe needs
    // SCA we'll surface that as an error so the client can retry.
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: "usd",
        customer: sponsorship.stripe_customer_id,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        metadata: {
          donor_id: donor.id,
          payment_mode: "extend_payment",
          sponsorship_id: sponsorship.id,
          additional_months: String(additionalMonths),
          monthly_amount_usd: String(sponsorship.amount_usd),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe charge failed.";
      console.error("[sponsorship/extend] paymentIntent create failed:", err);
      const isAuthRequired =
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "authentication_required";
      return NextResponse.json(
        {
          error: isAuthRequired
            ? "Your card requires additional verification. Please try again from the dashboard."
            : msg,
        },
        { status: 502 },
      );
    }
    if (pi.status !== "succeeded" && pi.status !== "processing") {
      return NextResponse.json(
        {
          error: `Payment status: ${pi.status}. Please try again or use a different card.`,
        },
        { status: 502 },
      );
    }

    // Compute new end date + push the Subscription's cancel_at to match
    // (recurring case only — prepaid sponsorships have no sub).
    const newEnd = newScheduledEnd(
      sponsorship.scheduled_end_date,
      additionalMonths,
    );
    if (sponsorship.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(sponsorship.stripe_subscription_id, {
          cancel_at: Math.floor(newEnd.getTime() / 1000),
        });
      } catch (err) {
        // The PI already succeeded — log but don't fail. The donor still
        // got the additional months credited; cancel_at can be fixed by
        // an admin.
        console.warn(
          "[sponsorship/extend] sub cancel_at update failed (non-fatal):",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Update local state. For prepaid sponsorships we increment the
    // existing prepaid counters; for recurring we initialise them so
    // the dashboard can display "X months prepaid in advance".
    const newPrepaidTotal =
      (sponsorship.prepaid_months_total ?? 0) + additionalMonths;
    const newPrepaidRemaining =
      (sponsorship.prepaid_months_remaining ?? 0) + additionalMonths;
    const newDuration = (sponsorship.duration_months ?? 0) + additionalMonths;
    try {
      await updateSponsorship(sponsorship.id, {
        duration_months: newDuration,
        scheduled_end_date: newEnd.toISOString(),
        prepaid_months_total: newPrepaidTotal,
        prepaid_months_remaining: newPrepaidRemaining,
      });
    } catch (err) {
      console.error("[sponsorship/extend] directus update failed:", err);
      return NextResponse.json(
        { error: "Internal update failed." },
        { status: 500 },
      );
    }

    await fireExtendEmail({
      sponsorship,
      additionalMonths,
      newDuration,
      newEnd,
      paidNow: true,
      paymentAmount: totalCents / 100,
      donorEmail: donor.email,
      donorFirstName:
        donor.first_name?.trim() || donor.email.split("@")[0]!,
    });

    // Session 14.7 Phase 2: queued donors' start dates shift forward.
    {
      const childIdRef =
        typeof sponsorship.child === "string"
          ? sponsorship.child
          : sponsorship.child?.id ?? null;
      if (childIdRef) {
        await shiftQueuedDonorsAfterExtend({
          childId: childIdRef,
          newEnd,
          stripe: getStripe(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      mode: "paid_now",
      paymentIntentId: pi.id,
      paymentAmountUsd: totalCents / 100,
      newEndDate: newEnd.toISOString(),
      newDurationMonths: newDuration,
      newPrepaidMonthsRemaining: newPrepaidRemaining,
    });
  }

  return NextResponse.json(
    { error: "Unsupported extension request." },
    { status: 400 },
  );
}

// Best-effort email fire — never fail the action if email throws. The
// extension already happened either way; worst case is a missed email.
async function fireExtendEmail(args: {
  sponsorship: Sponsorship;
  additionalMonths: number;
  newDuration: number;
  newEnd: Date;
  paidNow: boolean;
  paymentAmount: number;
  donorEmail: string;
  donorFirstName: string;
  // New: distinguishes the "prepaid + monthly tail" extension shape so
  // the email can speak about "monthly billing starts after {prepaid
  // end}" instead of "charged today".
  monthlyExtensionAfterPrepaid?: boolean;
  prepaidEndDateIso?: string | null;
  monthlyAmountUsd?: number;
}) {
  void calculateScheduledEndDate; // imported for type-side completeness
  try {
    const childId =
      typeof args.sponsorship.child === "string"
        ? args.sponsorship.child
        : args.sponsorship.child.id;
    const child = await fetchChildById(childId);
    const remaining = Math.max(
      0,
      Math.round(
        (args.newEnd.getTime() - Date.now()) /
          (30.44 * 24 * 60 * 60 * 1000),
      ),
    );
    await sendEmail({
      to: formatTo(args.donorEmail, args.donorFirstName),
      subject: `Your sponsorship of ${child?.display_name ?? "your sponsored child"} has been extended`,
      template: SponsorshipExtendedEmail({
        firstName: args.donorFirstName,
        childName: child?.display_name ?? "your sponsored child",
        additionalMonths: args.additionalMonths,
        newDurationMonths: args.newDuration,
        monthsRemaining: remaining,
        newEndDateIso: args.newEnd.toISOString(),
        paidNow: args.paidNow,
        paymentAmountUsd: args.paymentAmount,
        monthlyExtensionAfterPrepaid:
          args.monthlyExtensionAfterPrepaid ?? false,
        prepaidEndDateIso: args.prepaidEndDateIso ?? null,
        monthlyAmountUsd: args.monthlyAmountUsd ?? args.sponsorship.amount_usd,
        sponsorshipUrl: siteUrl(
          `/dashboard/sponsorship/${args.sponsorship.id}`,
        ),
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/extend] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }
}
