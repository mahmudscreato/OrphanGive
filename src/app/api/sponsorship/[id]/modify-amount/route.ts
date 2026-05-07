import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe-client";
import { authedSponsorship } from "@/lib/sponsorship-actions";
import {
  updateSponsorship,
  type ModificationEntry,
} from "@/lib/sponsorship-data";
import { MIN_AMOUNTS } from "@/lib/pricing";
import { sendEmail, siteUrl } from "@/lib/email";
import { fetchChildById, formatTo } from "@/lib/email-data";
import { SponsorshipModifiedEmail } from "@/emails/SponsorshipModifiedEmail";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await authedSponsorship(id);
  if (!auth.ok) return auth.response;
  const { donor, sponsorship } = auth.ctx;

  let body: { newAmountUsd?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const newAmount = body.newAmountUsd;
  if (
    typeof newAmount !== "number" ||
    !Number.isFinite(newAmount) ||
    !Number.isInteger(newAmount) ||
    newAmount < MIN_AMOUNTS.monthly
  ) {
    return NextResponse.json(
      {
        error: `newAmountUsd must be a whole-dollar integer ≥ ${MIN_AMOUNTS.monthly}.`,
      },
      { status: 400 },
    );
  }
  if (sponsorship.payment_mode !== "monthly") {
    return NextResponse.json(
      { error: "Only monthly sponsorships can have their amount changed." },
      { status: 400 },
    );
  }
  if (sponsorship.status !== "active" && sponsorship.status !== "paused") {
    return NextResponse.json(
      {
        error: `Cannot modify a sponsorship in state ${sponsorship.status}.`,
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
  if (newAmount === sponsorship.amount_usd) {
    return NextResponse.json(
      { error: "New amount is the same as the current amount." },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  // Fetch current subscription with the price + product expanded so we
  // can attach the new Price to the same Product (one Product per child).
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(
      sponsorship.stripe_subscription_id,
      { expand: ["items.data.price"] },
    );
  } catch (err) {
    console.error("[sponsorship/modify-amount] retrieve failed:", err);
    return NextResponse.json(
      { error: "Stripe subscription lookup failed." },
      { status: 502 },
    );
  }
  const subItem = sub.items.data[0];
  if (!subItem) {
    return NextResponse.json(
      { error: "Stripe subscription has no item — cannot modify." },
      { status: 502 },
    );
  }
  const productRef = subItem.price?.product;
  const productId =
    typeof productRef === "string"
      ? productRef
      : productRef && "id" in productRef
        ? productRef.id
        : null;
  if (!productId) {
    return NextResponse.json(
      { error: "Could not resolve Stripe Product for this subscription." },
      { status: 502 },
    );
  }

  // Create new Price under the same Product.
  let newPrice: Stripe.Price;
  try {
    newPrice = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(newAmount * 100),
      currency: "usd",
      recurring: { interval: "month" },
    });
  } catch (err) {
    console.error("[sponsorship/modify-amount] create price failed:", err);
    return NextResponse.json(
      { error: "Stripe price creation failed." },
      { status: 502 },
    );
  }

  // Update the subscription to point at the new Price, with prorations.
  try {
    await stripe.subscriptions.update(sponsorship.stripe_subscription_id, {
      items: [{ id: subItem.id, price: newPrice.id }],
      proration_behavior: "create_prorations",
    });
  } catch (err) {
    console.error("[sponsorship/modify-amount] update failed:", err);
    // Best-effort: dispose of the orphan price so we don't leak.
    stripe.prices
      .update(newPrice.id, { active: false })
      .catch(() => {});
    return NextResponse.json(
      { error: "Stripe subscription update failed." },
      { status: 502 },
    );
  }

  // Best-effort: pull the prorated delta off the upcoming invoice so the
  // email can show it. Stripe's API surface for "upcoming invoice" has
  // shifted across versions; we try a few names and fall back to null.
  // The delta is the SUM of proration line items only.
  let prorationCents: number | null = null;
  try {
    const stripeAny = stripe as unknown as {
      invoices: {
        retrieveUpcoming?: (
          p: { subscription: string },
        ) => Promise<Stripe.Invoice>;
        createPreview?: (
          p: { subscription: string },
        ) => Promise<Stripe.Invoice>;
        upcoming?: (
          p: { subscription: string },
        ) => Promise<Stripe.Invoice>;
      };
    };
    const fetchUpcoming =
      stripeAny.invoices.createPreview ??
      stripeAny.invoices.retrieveUpcoming ??
      stripeAny.invoices.upcoming;
    if (fetchUpcoming) {
      const upcoming = await fetchUpcoming.call(stripe.invoices, {
        subscription: sponsorship.stripe_subscription_id,
      });
      const lines = upcoming.lines?.data ?? [];
      const sum = lines
        .filter((l) => (l as unknown as { proration?: boolean }).proration)
        .reduce((acc, l) => acc + (l.amount ?? 0), 0);
      if (Number.isFinite(sum) && sum !== 0) prorationCents = sum;
    }
  } catch (err) {
    console.warn(
      "[sponsorship/modify-amount] proration preview failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  // Local row update.
  const oldAmount = sponsorship.amount_usd;
  const nowIso = new Date().toISOString();
  const entry: ModificationEntry = {
    from_amount: oldAmount,
    to_amount: newAmount,
    at: nowIso,
  };
  const nextHistory = [
    ...(sponsorship.modification_history ?? []),
    entry,
  ];
  try {
    await updateSponsorship(sponsorship.id, {
      amount_usd: newAmount,
      modified_at: nowIso,
      modification_history: nextHistory,
    });
  } catch (err) {
    console.error(
      "[sponsorship/modify-amount] directus update failed:",
      err,
    );
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
      subject: "Your sponsorship amount has been updated",
      template: SponsorshipModifiedEmail({
        firstName,
        childName: child?.display_name ?? "your sponsored child",
        oldAmountUsd: oldAmount,
        newAmountUsd: newAmount,
        nextBillingDate: sponsorship.next_billing_date,
        prorationCents,
        dashboardUrl: siteUrl("/dashboard"),
      }),
    });
  } catch (err) {
    console.warn(
      "[sponsorship/modify-amount] email failed (non-fatal):",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    success: true,
    prorationCents,
  });
}
