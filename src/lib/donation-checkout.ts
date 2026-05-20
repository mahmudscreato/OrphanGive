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
  /** Months count as string. Stamped for prepaid-bundle AND
   *  finite-term subscriptions; empty for open-ended subs + one-time. */
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
  /**
   * Session 58.3.1 — Donor-chosen payment schedule, stamped for
   * finance reconciliation. "monthly" or "monthly_prepaid" for
   * monthly modes; empty for one-time.
   */
  payment_schedule: string;
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
   * USD-equivalent of the PER-CHARGE rate (per-month for monthly +
   * monthly_prepaid; gift amount for one-time). Matches legacy
   * semantics so the existing dashboard's "$25/mo prepaid for 6
   * months" copy + admin reports still compute correctly. Real
   * donor-currency truth is in donor_currency_amount.
   */
  amount_usd: number;
  stripe_subscription_id?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_customer_id?: string | null;
  payment_schedule?: "monthly" | "monthly_prepaid" | null;
  prepaid_months_total?: number | null;
  prepaid_months_remaining?: number | null;
  /** Session 58.3.1 — fixed-term monthly: written for both
   *  monthly_prepaid and finite "Pay monthly" subscriptions so the
   *  dashboard can show a committed end date. */
  duration_months?: number | null;
  /** Session 58.3.1 — calculated end date for finite-term sponsorships.
   *  Null on open-ended subs and one-time gifts. */
  scheduled_end_date?: string | null;
  // Session 58.2 columns.
  cause_tag?: string | null;
  donation_package?: string | null;
  donor_currency_code?: string | null;
  /** Per-charge donor amount (per-month for monthly modes). */
  donor_currency_amount?: number | null;
  bdt_per_unit_at_checkout?: number | null;
}

export interface DonationPayload {
  mode: DonationMode;
  /** Whole BDT charged TODAY (perCharge × N for prepaid; perCharge
   *  for subscription first invoice + one-time). */
  totalBdt: number;
  /** Whole units in donor currency, charged TODAY. */
  totalDonorAmount: number;
  /** Smallest unit for Stripe TODAY (cents/pence/etc.). For
   *  subscriptions this is the recurring per-month unit_amount;
   *  for prepaid + one-time this is the upfront PI amount. */
  stripeAmount: number;
  /** Lowercased ISO 4217 — what Stripe expects on the API. */
  stripeCurrency: string;
  /** Snapshot of the rate used for this checkout. */
  bdtPerUnitSnapshot: number;
  /** Resolved finite term in months, or null for open-ended /
   *  one-time. Endpoint uses this to set Stripe cancel_at on
   *  finite subscriptions. */
  durationMonths: number | null;
  metadata: DonationStripeMetadata;
  sponsorshipRowDraft: SponsorshipRowDraft;
}

export interface BuildArgs {
  /** Either a loaded package (for preset checkouts) or null (custom). */
  pkg: DonationPackage | null;
  /** Active currency rate row, fetched fresh inside the request handler. */
  rate: CurrencyRate;
  /** Per-charge BDT amount: per-MONTH for monthly modes, the
   *  gift amount for one-time. The builder multiplies by N for
   *  prepaid bundles automatically. */
  perChargeAmountBdt: number;
  /** Required for subscription / prepaid-bundle. Optional for one-time
   *  (campaign donations have no child). */
  childId: string | null;
  donorId: string;
  /**
   * Session 58.3.1 — donor-chosen duration + schedule from the
   * restored /sponsor flow Steps 3 + 4. When present, OVERRIDES the
   * package-based mode dispatch (modeForPackage). When absent,
   * falls back to the package's own duration_months (legacy 58.2
   * behaviour).
   *
   * Ignored for one-time packages (those always force mode='one-time').
   *
   * Valid combinations:
   *   { paymentSchedule: 'monthly',           durationMonths: null }
   *     → open-ended subscription
   *   { paymentSchedule: 'monthly',           durationMonths: N>0 }
   *     → subscription with cancel_at = today + N months
   *   { paymentSchedule: 'monthly_prepaid',   durationMonths: N>0 }
   *     → single PI for perCharge × N upfront
   */
  override?: {
    paymentSchedule: "monthly" | "monthly_prepaid";
    durationMonths: number | null;
  };
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
  const { pkg, rate, perChargeAmountBdt, childId, donorId, override } = args;

  // ── Mode dispatch ──────────────────────────────────────────────
  // One-time packages always win (gifts + quick amounts + one-time
  // custom). For monthly + custom-monthly, the donor's choice in
  // Steps 3+4 (override) drives the mode; if no override is supplied
  // we fall back to the package's own duration_months (legacy 58.2
  // builder behavior).
  const isOneTimeIntent =
    pkg?.package_type === "one_time" || (!pkg && !override);

  let mode: DonationMode;
  let durationMonths: number | null;

  if (isOneTimeIntent) {
    mode = "one-time";
    durationMonths = null;
  } else if (override) {
    if (override.paymentSchedule === "monthly_prepaid") {
      if (!override.durationMonths || override.durationMonths < 1) {
        throw new Error(
          "buildDonationPayload: paymentSchedule='monthly_prepaid' requires durationMonths >= 1",
        );
      }
      mode = "prepaid-bundle";
      durationMonths = override.durationMonths;
    } else {
      // override.paymentSchedule === 'monthly'
      mode = "subscription";
      durationMonths = override.durationMonths ?? null;
    }
  } else if (pkg) {
    // Legacy package-driven dispatch.
    mode = modeForPackage(pkg);
    durationMonths =
      mode === "prepaid-bundle" && pkg.duration_months
        ? pkg.duration_months
        : null;
  } else {
    // Custom amount without override — only legitimate for one-time.
    mode = "one-time";
    durationMonths = null;
  }

  // ── Amount math ───────────────────────────────────────────────
  // Charge TODAY in BDT: perCharge × N for prepaid; perCharge for
  // subscription (first invoice) + one-time.
  const totalBdtToday =
    mode === "prepaid-bundle" && durationMonths
      ? perChargeAmountBdt * durationMonths
      : perChargeAmountBdt;

  const displayToday = convertBdtToCurrency(totalBdtToday, rate);
  const totalDonorAmountToday = displayToday.amount;

  // Reconcile BDT from the rounded donor amount so the metadata
  // matches what was actually charged (±0 BDT, not ±1).
  const reconciledTodayBdt = convertCurrencyToBdt(totalDonorAmountToday, rate);

  // Per-charge donor amount (per-month for monthly modes, the gift
  // amount for one-time). For prepaid this is derived by reversing
  // the total back to per-month so the donor-currency rate snapshot
  // is consistent with what the dashboard shows.
  const perChargeDonorAmount =
    mode === "prepaid-bundle" && durationMonths
      ? Math.max(1, Math.round(totalDonorAmountToday / durationMonths))
      : totalDonorAmountToday;

  const stripeAmount = toStripeAmount(
    // Subscription's per-month unit_amount = perCharge.
    // Prepaid + one-time = the full upfront amount.
    mode === "subscription" ? perChargeDonorAmount : totalDonorAmountToday,
    rate.currency_code,
  );
  const stripeCurrency = toStripeCurrency(rate.currency_code);

  // ── Metadata + row draft ──────────────────────────────────────
  const causeTag = pkg?.cause_tag ?? null;
  const packageType = pkg?.package_type ?? "one_time";

  // payment_schedule for Stripe metadata + sponsorship row:
  //   prepaid-bundle → 'monthly_prepaid'
  //   subscription   → 'monthly'
  //   one-time       → null
  const paymentScheduleEnum: "monthly" | "monthly_prepaid" | null =
    mode === "prepaid-bundle"
      ? "monthly_prepaid"
      : mode === "subscription"
        ? "monthly"
        : null;

  const metadata: DonationStripeMetadata = {
    amount_donor_currency: String(totalDonorAmountToday),
    donor_currency_code: rate.currency_code,
    amount_bdt_equivalent: String(reconciledTodayBdt),
    bdt_per_unit_rate_used: rate.bdt_per_unit.toFixed(2),
    package_id: pkg?.id ?? "",
    package_type: packageType,
    child_id: childId ?? "",
    donor_id: donorId,
    cause_tag: causeTag ?? "",
    mode,
    // 58.3.1: stamp duration_months for BOTH prepaid AND finite
    // subscriptions so the webhook + finance can see committed term.
    duration_months: durationMonths ? String(durationMonths) : "",
    payment_mode:
      mode === "one-time"
        ? "one_time"
        : mode === "prepaid-bundle"
          ? "monthly_prepaid"
          : "",
    payment_schedule: paymentScheduleEnum ?? "",
  };

  // amount_usd is PER-CHARGE (per-month for monthly modes; gift
  // amount for one-time) — matches legacy semantics. Use perCharge BDT
  // so the rate snapshot ties to what donor_currency_amount shows.
  const perChargeBdt =
    mode === "prepaid-bundle"
      ? perChargeAmountBdt // per-month BDT
      : reconciledTodayBdt;
  const usdEquivalentPerCharge = computeUsdEquivalentBdt(perChargeBdt, rate);

  // scheduled_end_date for finite terms (monthly_prepaid + finite
  // "Pay monthly"). Open-ended subs and one-time leave it null.
  let scheduledEndIso: string | null = null;
  if (mode !== "one-time" && durationMonths) {
    scheduledEndIso = calculateScheduledEndDateIso(durationMonths);
  }

  const sponsorshipRowDraft: SponsorshipRowDraft = {
    donor: donorId,
    child: childId,
    payment_mode: mode === "one-time" ? "one_time" : "monthly",
    amount_usd: usdEquivalentPerCharge,
    payment_schedule: paymentScheduleEnum,
    prepaid_months_total: mode === "prepaid-bundle" ? durationMonths : null,
    prepaid_months_remaining: mode === "prepaid-bundle" ? durationMonths : null,
    duration_months: durationMonths,
    scheduled_end_date: scheduledEndIso,
    cause_tag: causeTag,
    donation_package: pkg?.id ?? null,
    donor_currency_code: rate.currency_code,
    donor_currency_amount: perChargeDonorAmount,
    bdt_per_unit_at_checkout: rate.bdt_per_unit,
  };

  return {
    mode,
    totalBdt: reconciledTodayBdt,
    totalDonorAmount: totalDonorAmountToday,
    stripeAmount,
    stripeCurrency,
    bdtPerUnitSnapshot: rate.bdt_per_unit,
    durationMonths,
    metadata,
    sponsorshipRowDraft,
  };
}

/**
 * Match legacy pricing.calculateScheduledEndDate's 30.44-days-per-month
 * convention without taking a runtime dep on it (keeps this module
 * standalone for testing). Returns ISO string for direct write into
 * the sponsorship.scheduled_end_date column.
 */
function calculateScheduledEndDateIso(durationMonths: number): string {
  const ms = durationMonths * 30.44 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
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
