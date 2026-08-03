// feat/sslcommerz-phase1-guest — POST /api/donate/sslcommerz/init
//
// PARALLEL to /api/donate/guest-init (Stripe hosted Checkout), for the guest
// one-time cause-donation flow. Same server-authoritative amount computation;
// the ONLY differences are the gateway (SSLCommerz hosted redirect) and that we
// collect the donor's email up-front (SSLCommerz needs cus_email; it also
// becomes the receipt address). BDT only. ONE-TIME only.
//
// SECURITY (identical discipline to the Stripe path):
//   - Rate-limited per IP.
//   - Amounts are NEVER trusted from the client — the server loads the active
//     one_time package and charges amount_bdt × childCount, or a custom BDT
//     amount validated by validateCustomAmount + a ceiling.
//   - The browser redirect that follows is NOT proof of payment; settlement is
//     confirmed only by the IPN (/api/donate/sslcommerz/ipn).
//
// Body: { packageId, childCount?, customAmount?(BDT), cause?, childId?,
//         cusEmail(required), cusName?, cusPhone? }
// 200 → { url }  (SSLCommerz GatewayPageURL)   ·   400/404/429/500 on error

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPackageById } from "@/lib/donation-packages";
import { getChildById } from "@/lib/child-profile-data";
import { getBdtRate, convertCurrencyToBdt } from "@/lib/currency-rates";
import { validateCustomAmount } from "@/lib/donation-checkout";
import { isValidCause, labelForCause } from "@/lib/cause";
import {
  RATE_LIMITS,
  countRecentRequests,
  recordOtpRequest,
} from "@/lib/donor-signup";
import { createPendingGuestDonation } from "@/lib/guest-donations";
import {
  createSslcommerzSession,
  isSslcommerzConfigured,
} from "@/lib/sslcommerz";
import { siteUrl } from "@/lib/email";

export const runtime = "nodejs";

const MAX_CHILD_COUNT = 100;
const MAX_CUSTOM_BDT = 1_000_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Short, unique, ≤30 chars (SSLCommerz tran_id limit). Also the IPN lookup key.
function newTranId(): string {
  return `og${randomBytes(12).toString("hex")}`; // "og" + 24 hex = 26 chars
}

export async function POST(req: NextRequest) {
  if (!isSslcommerzConfigured()) {
    return bad("SSLCommerz is not configured on the server.", 503);
  }

  // ── Rate limit (per IP) — same policy as the Stripe guest path ──────
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
  await recordOtpRequest({ email: "", ip, kind: limit.kind });

  // ── Parse ───────────────────────────────────────────────────────────
  let body: {
    packageId?: unknown;
    childCount?: unknown;
    customAmount?: unknown; // BDT
    cause?: unknown;
    childId?: unknown;
    cusEmail?: unknown;
    cusName?: unknown;
    cusPhone?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("Invalid JSON body.");
  }

  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  if (!packageId) return bad("packageId is required.");

  // SSLCommerz requires cus_email; it's also the receipt address.
  const cusEmail =
    typeof body.cusEmail === "string" ? body.cusEmail.trim().slice(0, 200) : "";
  if (!EMAIL_RE.test(cusEmail)) {
    return bad("A valid email is required for your receipt.");
  }
  const cusName =
    typeof body.cusName === "string" && body.cusName.trim()
      ? body.cusName.trim().slice(0, 120)
      : cusEmail.split("@")[0] || "OrphanGive Donor";
  const cusPhone =
    typeof body.cusPhone === "string" ? body.cusPhone.trim().slice(0, 40) : "";

  // The cause = an ACTIVE one_time donation_package. Server-side load — the
  // unit price comes from here, never the client. (Same gate as guest-init.)
  const pkg = await getPackageById(packageId);
  if (!pkg || !pkg.is_active || pkg.package_type !== "one_time") {
    return bad("Unknown or inactive cause.", 404);
  }

  // BDT, server-authoritative (identical to guest-init).
  const rate = await getBdtRate();

  const causeLabel = isValidCause(body.cause)
    ? labelForCause(body.cause)
    : labelForCause(pkg.cause_tag);

  // ── Server-side amount (never trust a client total) ─────────────────
  let amountBdt: number;
  let childCount: number | null = null;
  let unitAmountBdt: number | null = null;

  const rawCustom = body.customAmount;
  if (rawCustom !== undefined && rawCustom !== null) {
    const custom = typeof rawCustom === "number" ? Math.round(rawCustom) : NaN;
    if (!Number.isFinite(custom) || custom < 1) {
      return bad("Invalid custom amount.");
    }
    const customBdt = convertCurrencyToBdt(custom, rate); // identity (BDT)
    const check = validateCustomAmount(customBdt, "one_time", 0);
    if (!check.ok) return bad(check.reason);
    if (customBdt > MAX_CUSTOM_BDT) {
      return bad(
        `Custom amount can't exceed the equivalent of ${MAX_CUSTOM_BDT.toLocaleString()} BDT.`,
      );
    }
    amountBdt = customBdt;
  } else {
    const rawCount = body.childCount;
    const count = typeof rawCount === "number" ? Math.round(rawCount) : NaN;
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHILD_COUNT) {
      return bad(`childCount must be between 1 and ${MAX_CHILD_COUNT}.`);
    }
    childCount = count;
    unitAmountBdt = pkg.amount_bdt;
    amountBdt = pkg.amount_bdt * count;
  }

  // SSLCommerz total_amount floor is 10 BDT — our one_time floor (500) already
  // exceeds it, but guard defensively.
  if (amountBdt < 10) return bad("Amount below the minimum.");

  // ── Optional child gift (schema-free parity with guest-init) ────────
  const rawChildId = typeof body.childId === "string" ? body.childId.trim() : "";
  let childGiftName: string | null = null;
  if (rawChildId) {
    const child = await getChildById(rawChildId, "public");
    if (child) childGiftName = child.display_name?.trim() || null;
  }
  const isChildGift = childGiftName !== null;
  const recordTitle = isChildGift ? `Support ${childGiftName}` : pkg.name_en;
  const productName = isChildGift
    ? `Support ${childGiftName} — One-Time Donation`
    : `${causeLabel} — One-Time Donation`;

  // ── Create the pending row (gateway='sslcommerz' + tran_id) ─────────
  const tranId = newTranId();
  let guestDonationId: string;
  try {
    guestDonationId = await createPendingGuestDonation({
      donationPackageId: pkg.id,
      causeTag: pkg.cause_tag,
      packageTitle: recordTitle,
      unitAmountBdt,
      childId: isChildGift ? rawChildId : null,
      childCount,
      amountBdt,
      donorCurrencyCode: "BDT",
      donorCurrencyAmount: amountBdt,
      gateway: "sslcommerz",
      sslTranId: tranId,
      guestEmail: cusEmail,
    });
  } catch (err) {
    console.error(
      "[sslcommerz-init] pending row insert failed",
      err instanceof Error ? err.message : err,
    );
    return bad("Could not start the donation. Please try again.", 500);
  }

  // ── SSLCommerz session → GatewayPageURL ─────────────────────────────
  const session = await createSslcommerzSession({
    tranId,
    amountBdt,
    productName,
    productCategory: "donation",
    cusName,
    cusEmail,
    cusPhone,
    successUrl: siteUrl("/api/donate/sslcommerz/return?state=success"),
    failUrl: siteUrl("/api/donate/sslcommerz/return?state=fail"),
    cancelUrl: siteUrl("/api/donate/sslcommerz/return?state=cancel"),
    ipnUrl: siteUrl("/api/donate/sslcommerz/ipn"),
  });

  if (!session.ok || !session.gatewayPageURL) {
    console.error("[sslcommerz-init] session failed", session.error);
    return bad(session.error ?? "Could not start the payment.", 502);
  }

  return NextResponse.json({ url: session.gatewayPageURL });
}
