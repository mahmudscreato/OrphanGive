// feat/quick-donation — POST /api/donate/guest-init
//
// PUBLIC (no account) pooled-cause donation via Stripe HOSTED CHECKOUT.
// Fully ISOLATED from the sponsorship flow: no donor, no child, no
// sponsorship row — only a guest_donation record + a Checkout Session.
//
// SECURITY:
//   - Rate-limited per IP (RATE_LIMITS.guest_donation_per_ip = 20/15min —
//     deliberately generous for Bangladesh CGNAT/shared wifi; server-side
//     amounts + Stripe Radar are the real card-testing defence).
//   - Amounts are NEVER trusted from the client. The server loads the
//     active one-time donation_package and charges
//     package.amount_bdt × childCount (1..100), or a custom BDT amount
//     validated by the existing validateCustomAmount floor (500 BDT) plus
//     a 1,000,000 BDT ceiling.
//   - The Session + its PaymentIntent carry metadata kind='guest_cause';
//     the sponsorship webhook branch gates on metadata.payment_mode and
//     therefore ignores guest payments entirely.
//
// Body: {
//   packageId: string,           // active one_time donation_package (the cause)
//   childCount?: number,         // 1..100 → unit price × count
//   customAmountBdt?: number,    // OR a custom amount (overrides count)
//   currencyCode?: string,       // donor display currency (validated; default USD)
// }
//
// 200 → { url }  — the hosted Checkout redirect
// 400 bad_request / 404 unknown package / 429 rate-limited / 500 error

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe-client";
import { getPackageById } from "@/lib/donation-packages";
import { getChildById } from "@/lib/child-profile-data";
import {
  getBdtRate,
  convertBdtToCurrency,
  convertCurrencyToBdt,
} from "@/lib/currency-rates";
import { toStripeAmount, toStripeCurrency } from "@/lib/stripe-currency";
import { validateCustomAmount } from "@/lib/donation-checkout";
import { isValidCause, labelForCause } from "@/lib/cause";
import {
  RATE_LIMITS,
  countRecentRequests,
  recordOtpRequest,
} from "@/lib/donor-signup";
import {
  createPendingGuestDonation,
  attachCheckoutSession,
} from "@/lib/guest-donations";
import { siteUrl } from "@/lib/email";

export const runtime = "nodejs";

const MAX_CHILD_COUNT = 100;
const MAX_CUSTOM_BDT = 1_000_000; // sanity ceiling on custom amounts

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  // ── Rate limit (per IP) ─────────────────────────────────────────
  const ip = clientIp(req);
  const limit = RATE_LIMITS.guest_donation_per_ip;
  if (ip) {
    const recent = await countRecentRequests({
      kind: limit.kind,
      ip,
      windowMs: limit.windowMs,
    });
    if (recent >= limit.max) {
      return bad("Too many donation attempts. Please try again shortly.", 429);
    }
  }
  // Record the attempt (email unknown pre-Checkout — Stripe collects it).
  await recordOtpRequest({ email: "", ip, kind: limit.kind });

  // ── Parse + validate input ──────────────────────────────────────
  let body: {
    packageId?: unknown;
    childCount?: unknown;
    // In BDT (taka) — what the donor typed; the guest flow is BDT-only.
    customAmount?: unknown;
    // The curated cause the donor selected (enum) — DISPLAY ONLY: used for the
    // Stripe line-item label. The charge is governed by packageId (below),
    // never by this. Validated server-side against the cause taxonomy.
    cause?: unknown;
    // fix/child-profile-support-cta — optional guest one-time gift FOR a
    // specific child (from the profile "Support [Name]" CTA). The child NAME is
    // resolved server-side from this id (never trusted from the client); the
    // charge vehicle is still the resolved one_time package (schema-free — the
    // child link rides in the label + Stripe metadata).
    childId?: unknown;
    // Optional WhatsApp for child updates — DISPLAY/CONTACT ONLY, stored in
    // Stripe metadata. Email + name are collected by Stripe at checkout.
    whatsapp?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  if (!packageId) return bad("packageId is required.");

  // The cause = an ACTIVE one-time donation_package. Server-side load —
  // the unit price comes from here, never the client.
  const pkg = await getPackageById(packageId);
  if (!pkg || !pkg.is_active || pkg.package_type !== "one_time") {
    return bad("Unknown or inactive cause.", 404);
  }

  // ── Currency: BDT, server-authoritative ─────────────────────────
  // fix/donate-checkout-and-copy (Fix 2) — the guest flow is Bangladesh-only
  // and charges in BDT (taka). Currency is NOT taken from the client; the
  // server always resolves BDT so the charge is always in taka. The donor's
  // typed amount is therefore taka. getBdtRate never returns null (exact
  // hardcoded fallback), so there is no "unsupported currency" path here.
  const rate = await getBdtRate();

  // Curated cause the donor picked — DISPLAY ONLY, for the Stripe line item.
  // Validated against the cause taxonomy; falls back to the package's own tag.
  const causeLabel = isValidCause(body.cause)
    ? labelForCause(body.cause)
    : labelForCause(pkg.cause_tag);

  // ── Server-side amount computation (never trust a client total) ──
  let amountBdt: number;
  let donorCurrencyAmount: number;
  let childCount: number | null = null;
  let unitAmountBdt: number | null = null;

  const rawCustom = body.customAmount;
  if (rawCustom !== undefined && rawCustom !== null) {
    // Custom amount is in BDT (taka) — the guest flow is BDT-only, so
    // convertCurrencyToBdt is an identity here (bdt_per_unit = 1). Kept
    // generic so the same validation path holds if a currency is ever added.
    const custom = typeof rawCustom === "number" ? Math.round(rawCustom) : NaN;
    if (!Number.isFinite(custom) || custom < 1) {
      return bad("Invalid custom amount.");
    }
    const customBdt = convertCurrencyToBdt(custom, rate);
    const check = validateCustomAmount(customBdt, "one_time", 0);
    if (!check.ok) return bad(check.reason);
    if (customBdt > MAX_CUSTOM_BDT) {
      return bad(
        `Custom amount can't exceed the equivalent of ${MAX_CUSTOM_BDT.toLocaleString()} BDT.`,
      );
    }
    amountBdt = customBdt;
    donorCurrencyAmount = custom;
  } else {
    const rawCount = body.childCount;
    const count = typeof rawCount === "number" ? Math.round(rawCount) : NaN;
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHILD_COUNT) {
      return bad(`childCount must be between 1 and ${MAX_CHILD_COUNT}.`);
    }
    childCount = count;
    unitAmountBdt = pkg.amount_bdt;
    amountBdt = pkg.amount_bdt * count;
    donorCurrencyAmount = convertBdtToCurrency(amountBdt, rate).amount;
  }

  const stripeAmount = toStripeAmount(donorCurrencyAmount, rate.currency_code);
  const stripeCurrency = toStripeCurrency(rate.currency_code);

  // ── Optional child gift (schema-free) ───────────────────────────
  // When a childId is supplied, this is a guest one-time gift FOR that child.
  // The child NAME is resolved SERVER-SIDE (never trusted from the client) so
  // no arbitrary text can reach the Stripe line item. The charge still runs on
  // the resolved one_time package (the pooled vehicle); the child link is
  // recorded via the label + the guest_donation title + Stripe metadata — no
  // schema change. An unknown/inactive childId simply degrades to a normal gift.
  const rawChildId = typeof body.childId === "string" ? body.childId.trim() : "";
  let childGiftName: string | null = null;
  if (rawChildId) {
    const child = await getChildById(rawChildId, "public");
    if (child) childGiftName = child.display_name?.trim() || null;
  }
  const isChildGift = childGiftName !== null;
  // Optional WhatsApp — contact only, kept short + stored in Stripe metadata.
  const whatsapp =
    typeof body.whatsapp === "string" ? body.whatsapp.trim().slice(0, 32) : "";

  const recordTitle = isChildGift ? `Support ${childGiftName}` : pkg.name_en;
  const lineItemName = isChildGift
    ? `Support ${childGiftName} — One-Time Donation, OrphanGive`
    : `${causeLabel} — One-Time Donation, OrphanGive`;
  const lineItemDescription = isChildGift
    ? `A one-time gift for ${childGiftName} in Bangladesh`
    : childCount
      ? `Supports ${childCount} ${childCount === 1 ? "child" : "children"} in Bangladesh`
      : "A one-time gift for children in Bangladesh";

  // Stripe metadata — keep kind='guest_cause' so the webhook still routes this
  // to the guest branch (unchanged); child_id / whatsapp are additive.
  // guest_donation_id is added at session-create time (once the row exists).
  const giftMetadata: Record<string, string> = { kind: "guest_cause" };
  if (isChildGift) {
    giftMetadata.child_id = rawChildId;
    giftMetadata.child_gift = "1";
  }
  if (whatsapp) giftMetadata.whatsapp = whatsapp;

  // ── Record (pending) + hosted Checkout Session ──────────────────
  let guestDonationId: string;
  try {
    guestDonationId = await createPendingGuestDonation({
      donationPackageId: pkg.id,
      causeTag: pkg.cause_tag,
      packageTitle: recordTitle,
      unitAmountBdt,
      childCount,
      amountBdt,
      donorCurrencyCode: rate.currency_code,
      donorCurrencyAmount,
    });
  } catch (err) {
    console.error(
      "[guest-init] pending row insert failed",
      err instanceof Error ? err.message : err,
    );
    return bad("Could not start the donation. Please try again.", 500);
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeCurrency,
            unit_amount: stripeAmount,
            product_data: {
              // fix/donate-checkout-and-copy (Fix 1 + Fix 6) — the donor-facing
              // line item is the CURATED CAUSE the donor picked (or, for a child
              // gift, "Support <Name>"), never the raw package title, never
              // "pooled".
              name: lineItemName,
              description: lineItemDescription,
            },
          },
        },
      ],
      // kind='guest_cause' on BOTH the session and its PaymentIntent:
      //  - the session metadata routes checkout.session.completed to the
      //    guest webhook branch;
      //  - the PI metadata propagates to the Charge, letting the refund/
      //    dispute branches identify guest charges WITHOUT touching the
      //    sponsorship handlers (which gate on metadata.payment_mode and
      //    ignore guest PIs entirely).
      // child_id / whatsapp (when present) ride along additively for the
      // child-gift case; the routing key (kind) is unchanged.
      metadata: { ...giftMetadata, guest_donation_id: guestDonationId },
      payment_intent_data: {
        metadata: { ...giftMetadata, guest_donation_id: guestDonationId },
      },
      success_url: siteUrl(
        "/donate/quick/success?session_id={CHECKOUT_SESSION_ID}",
      ),
      cancel_url: siteUrl("/donate/quick"),
    });

    // Best-effort session-id stamp (the webhook keys on the metadata id,
    // so a failed stamp never loses the donation).
    try {
      await attachCheckoutSession(guestDonationId, session.id);
    } catch (err) {
      console.warn(
        "[guest-init] session-id stamp failed (non-fatal)",
        err instanceof Error ? err.message : err,
      );
    }

    if (!session.url) {
      return bad("Stripe did not return a redirect URL.", 500);
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(
      "[guest-init] checkout session failed",
      err instanceof Error ? err.message : err,
    );
    return bad("Could not start the payment. Please try again.", 500);
  }
}
