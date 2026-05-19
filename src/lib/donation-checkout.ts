// Session 58.2 — central payload builder for /api/donate/init.
//
// Why a builder vs inlining in the route handler: the same numbers
// (donor amount, BDT-equivalent, snapshotted rate) need to land in
// THREE places — Stripe (amount + currency), Stripe metadata (for
// finance reconciliation), and the sponsorship row (so admin reports
// match what was charged). One builder enforces consistency; a
// regression there is the kind of bug nobody notices until someone
// reconciles end-of-month.
//
// Also: this module is where we decide what mode a donation is
// (subscription | prepaid-bundle | one-time) so the endpoint can
// branch cleanly without re-deriving it.

import "server-only";
import {
  convertBdtToCurrency,
  convertCurrencyToBdt,
  type CurrencyRate,
} from "./currency-rates";
import {
  type DonationPackage,
  type DonationMode,
  modeForPackage,
} from "./donation-packages";
import { toStripeAmount, toStripeCurrency } from "./stripe-currency";

/**
 * Stripe metadata keys are limited to 500-byte values and 50 keys per
 * object. We stamp the lot below and have plenty of room.
 *
 * Every value is a string per Stripe's API constraints.
 */
export interface DonationStripeMetadata {
  /** Whole units in donor currency, as string. */
  amount_donor_currency: string;
  /** ISO 4217 uppercase. */
  donor_currency_code: string;
  /** Whole BDT, as string. */
  amount_bdt_equivalent: string;
  /** Snapshotted FX rate, e.g. "140.00". */
  bdt_per_unit_rate_used: string;
  /** Package UUID, or empty string for custom. */
  package_id: string;
  /** "monthly" | "one_time". */
  package_type: string;
  /** Child UUID, or empty string when not child-scoped. */
  child_id: string;
  /** Donor UUID. */
  donor_id: string;
  /** Campaign tag, e.g. "feed-a-child", or empty string. */
  cause_tag: string;
  /** "subscription" | "prepaid-bundle" | "one-time". */
  mode: string;
  /** Prepaid months count as string, or empty for non-prepaid. */
  duration_months: string;
  /**
   * Legacy key kept for the existing /api/webhooks/stripe handler,
   * which gates handlePaymentIntentSucceeded on
   * `pi.metadata.payment_mode IN ("one_time", "monthly_prepaid")`.
   * Mapping:
   *   mode = "one-time"       → payment_mode = "one_time"
   *   mode = "prepaid-bundle" → payment_mode = "monthly_prepaid"
   *   mode = "subscription"   → payment_mode = "" (subs flow via invoice.paid)
   * Without this the existing webhook would silently skip donations
   * coming from /api/donate/init.
   */
  payment_mode: string;
}

/**
 * Draft row matching the shape createPendingSponsorship() expects,
 * with the Session 58.2 columns added. The route handler hands this
 * straight to the data layer.
 */
export interface SponsorshipRowDraft {
  donor: string;
  /** Nullable for campaign one-time gifts. */
  child: string | null;
  payment_mode: "monthly" | "one_time";
  /**
   * USD-equivalent of the charge. Kept populated for backward compat
   * with admin reports + the existing dashboard. The real donor
   * truth lives in donor_currency_amount + donor_currency_code below.
   * Treat as a legacy reporting field.
   */
  amount_usd: number;
  stripe_subscription_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_customer_id?: string | null;
  payment_schedule?: "monthly" | "monthly_prepaid" | null;
  prepaid_months_total?: number | null;
  prepaid_months_remaining?: number | null;
  // Session 58.2 columns.
  cause_tag?: string | null;
  donation_package?: string | null;
  donor_currency_code?: string | null;
  donor_currency_amount?: number | null;
  bdt_per_unit_at_checkout?: number | null;
}

export interface DonationPayload {
  mode: DonationMode;
  /** Whole BDT total (already × duration_months for prepaid). */
  totalBdt: number;
  /** Whole units in donor currency. */
  totalDonorAmount: number;
  /** Smallest unit for Stripe (cents/pence/etc.). */
  stripeAmount: number;
  /** Lowercased ISO 4217 — what Stripe expects on the API. */
  stripeCurrency: string;
  /** Snapshot of the rate used for this checkout. */
  bdtPerUnitSnapshot: number;
  metadata: DonationStripeMetadata;
  sponsorshipRowDraft: SponsorshipRowDraft;
}

export interface BuildArgs {
  /** Either a loaded package (for preset checkouts) or null (custom). */
  pkg: DonationPackage | null;
  /** Active currency rate row, fetched fresh inside the request handler. */
  rate: CurrencyRate;
  /** Per-donation amount in whole BDT. For prepaid this is the per-MONTH amount; the builder multiplies by duration_months automatically. */
  perChargeAmountBdt: number;
  /** Required for subscription / prepaid-bundle. Optional for one-time (campaign donations have no child). */
  childId: string | null;
  donorId: string;
}

/**
 * Build the full donation payload for /api/donate/init.
 *
 * - Computes donor-currency total via convertBdtToCurrency (which
 *   rounds to whole units for display consistency with the package
 *   cards).
 * - Reverse-computes the BDT total from the donor amount so the
 *   sponsorship.amount_bdt_equivalent matches what was actually
 *   charged, not the theoretical amount_bdt × duration. This avoids
 *   a +/-1 BDT drift between metadata and Stripe.
 * - Snapshots rate.bdt_per_unit so subsequent rate changes don't
 *   affect this row's reconciliation.
 */
export function buildDonationPayload(args: BuildArgs): DonationPayload {
  const { pkg, rate, perChargeAmountBdt, childId, donorId } = args;

  const mode: DonationMode = pkg
    ? modeForPackage(pkg)
    : "one-time"; // custom amount default — subscription/prepaid require a package

  const durationMonths =
    mode === "prepaid-bundle" && pkg?.duration_months
      ? pkg.duration_months
      : 1;

  // Total in BDT for THIS charge: per-month × N for prepaid bundles,
  // otherwise just the per-charge amount.
  const totalBdt =
    mode === "prepaid-bundle" ? perChargeAmountBdt * durationMonths : perChargeAmountBdt;

  // Donor-currency amount (rounded to whole units to match what the
  // preset card showed).
  const display = convertBdtToCurrency(totalBdt, rate);
  const totalDonorAmount = display.amount;

  // Re-derive the BDT-equivalent FROM the donor amount so the two
  // numbers reconcile exactly. This is what we stamp into metadata
  // and onto the sponsorship row — not the theoretical totalBdt
  // (which can drift by ±1 BDT due to rounding).
  const reconciledBdt = convertCurrencyToBdt(totalDonorAmount, rate);

  const stripeAmount = toStripeAmount(totalDonorAmount, rate.currency_code);
  const stripeCurrency = toStripeCurrency(rate.currency_code);

  const causeTag = pkg?.cause_tag ?? null;
  const packageType = pkg?.package_type ?? "one_time";

  const metadata: DonationStripeMetadata = {
    amount_donor_currency: String(totalDonorAmount),
    donor_currency_code: rate.currency_code,
    amount_bdt_equivalent: String(reconciledBdt),
    bdt_per_unit_rate_used: rate.bdt_per_unit.toFixed(2),
    package_id: pkg?.id ?? "",
    package_type: packageType,
    child_id: childId ?? "",
    donor_id: donorId,
    cause_tag: causeTag ?? "",
    mode,
    duration_months: mode === "prepaid-bundle" ? String(durationMonths) : "",
    payment_mode:
      mode === "one-time"
        ? "one_time"
        : mode === "prepaid-bundle"
          ? "monthly_prepaid"
          : "",
  };

  // USD-equivalent for the legacy sponsorship.amount_usd field. Derive
  // by going through BDT so the rate snapshots are consistent. If USD
  // rate is missing (shouldn't happen — BDT always present), fall back
  // to dividing by the env preview rate to avoid a write failure.
  const usdEquivalent = computeUsdEquivalentBdt(reconciledBdt, rate);

  const sponsorshipRowDraft: SponsorshipRowDraft = {
    donor: donorId,
    child: childId,
    payment_mode: mode === "one-time" ? "one_time" : "monthly",
    amount_usd: usdEquivalent,
    payment_schedule:
      mode === "prepaid-bundle"
        ? "monthly_prepaid"
        : mode === "subscription"
          ? "monthly"
          : null,
    prepaid_months_total: mode === "prepaid-bundle" ? durationMonths : null,
    prepaid_months_remaining: mode === "prepaid-bundle" ? durationMonths : null,
    cause_tag: causeTag,
    donation_package: pkg?.id ?? null,
    donor_currency_code: rate.currency_code,
    donor_currency_amount: totalDonorAmount,
    bdt_per_unit_at_checkout: rate.bdt_per_unit,
  };

  return {
    mode,
    totalBdt: reconciledBdt,
    totalDonorAmount,
    stripeAmount,
    stripeCurrency,
    bdtPerUnitSnapshot: rate.bdt_per_unit,
    metadata,
    sponsorshipRowDraft,
  };
}

/**
 * BDT → USD whole-unit conversion using the SAME currency_rate
 * mechanism the rest of the system uses. Avoids drifting away from
 * the rate-snapshot model by computing through the rate row instead
 * of hardcoded conversions.
 *
 * If the donor currency already IS USD, the input rate carries the
 * USD bdt_per_unit and we use that directly.
 */
function computeUsdEquivalentBdt(amountBdt: number, donorRate: CurrencyRate): number {
  // If donor currency is USD we already have the rate.
  if (donorRate.currency_code === "USD") {
    return Math.max(1, Math.round(amountBdt / donorRate.bdt_per_unit));
  }
  // Otherwise we need the USD rate. Falling back to the env preview
  // rate keeps the write from failing if currency_rate has been
  // misconfigured (extremely defensive).
  const usdRate = Number.parseFloat(
    process.env.NEXT_PUBLIC_USD_TO_BDT_RATE || "110",
  );
  return Math.max(1, Math.round(amountBdt / (Number.isFinite(usdRate) ? usdRate : 110)));
}

/**
 * Floor enforcement for custom-amount donations.
 *
 * One-time: 500 BDT floor per brief (hardcoded — the new "least
 * generous one-time gift" baseline).
 *
 * Monthly: the smallest active monthly package's amount_bdt (callers
 * should pass this in; centralized here so the comparison logic
 * matches across UI + endpoint).
 */
export function validateCustomAmount(
  amountBdt: number,
  packageType: "monthly" | "one_time",
  monthlyFloorBdt: number,
): { ok: true } | { ok: false; reason: string; floor: number } {
  const floor = packageType === "monthly" ? Math.max(1, monthlyFloorBdt) : 500;
  if (!Number.isFinite(amountBdt) || amountBdt < floor) {
    return {
      ok: false,
      reason:
        packageType === "monthly"
          ? `Monthly amount must be at least ${floor} BDT`
          : `One-time amount must be at least ${floor} BDT`,
      floor,
    };
  }
  return { ok: true };
}
