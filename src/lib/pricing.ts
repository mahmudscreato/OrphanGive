// Pricing primitives shared across the donation system.
//
// Session 58.2 removed SPONSORSHIP_TIERS — the hardcoded tier table
// that drove the legacy /sponsor/[childId] flow. Amounts now come
// from the admin-editable `donation_package` collection (read via
// src/lib/donation-packages.ts). The SponsorshipTier shape is also
// gone since nothing imports it after the rip.
//
// What remains in this file is the small set of primitives still
// load-bearing across the codebase:
//   - PaymentMode      enum used in cart-data, /api/cart/*, sponsorship-data
//   - PaymentSchedule  enum mapped to existing sponsorship rows
//   - MIN_AMOUNTS      floor for legacy cart/extend paths (the new
//                      /api/donate/init endpoint enforces its own
//                      floors via validateCustomAmount)
//   - formatUsd        display helper still used on the dashboard
//                      for amount_usd-shaped legacy values
//   - duration helpers calculateScheduledEndDate, isValidDurationMonths
//   - predicates       isPaymentMode, isPaymentSchedule, isValidAmount

export type PaymentMode = "monthly" | "one_time";

export const MIN_AMOUNTS: Record<PaymentMode, number> = {
  monthly: 10,
  one_time: 25,
};

export function isPaymentMode(v: unknown): v is PaymentMode {
  return v === "monthly" || v === "one_time";
}

export function isValidAmount(mode: PaymentMode, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!Number.isInteger(amount)) return false;
  return amount >= MIN_AMOUNTS[mode];
}

export function formatUsd(amount: number, opts: { withDecimals?: boolean } = {}): string {
  const { withDecimals = false } = opts;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  });
}

// ─── Duration + payment schedule (monthly only) ─────────────────────────────
//
// Monthly sponsorships now have a duration: indefinite (default) or a
// fixed-term in months. Fixed-term donors additionally choose a payment
// schedule: pay monthly (recurring) or pay the full N months upfront
// (single PaymentIntent, no recurring).
//
// One-time gifts ignore both fields.

export type DurationOption = {
  id: string;
  // null = indefinite, "custom" = donor enters a value, integer = fixed
  months: number | null | "custom";
  label: string;
  description: string;
};

export const DURATION_OPTIONS: Record<"monthly", ReadonlyArray<DurationOption>> = {
  monthly: [
    {
      id: "d_indef",
      months: null,
      label: "Continue until I cancel",
      description: "Most flexible — cancel anytime from your dashboard",
    },
    {
      id: "d_3",
      months: 3,
      label: "3 months",
      description: "Short-term commitment",
    },
    {
      id: "d_6",
      months: 6,
      label: "6 months",
      description: "Half-year support",
    },
    {
      id: "d_12",
      months: 12,
      label: "12 months",
      description: "Full year of consistent support",
    },
    {
      id: "d_custom",
      months: "custom",
      label: "Custom",
      description: "Choose your own duration (1-36 months)",
    },
  ],
};

export const CUSTOM_DURATION_MIN = 1;
export const CUSTOM_DURATION_MAX = 36;

export type PaymentSchedule = "monthly" | "monthly_prepaid";

export type PaymentScheduleOption = {
  id: PaymentSchedule;
  label: string;
  description: string;
};

export const PAYMENT_SCHEDULE_OPTIONS: ReadonlyArray<PaymentScheduleOption> = [
  {
    id: "monthly",
    label: "Pay monthly",
    description: "Charged automatically each month",
  },
  {
    id: "monthly_prepaid",
    label: "Pay full amount now",
    description: "One charge today covers all months",
  },
];

export function isPaymentSchedule(v: unknown): v is PaymentSchedule {
  return v === "monthly" || v === "monthly_prepaid";
}

// Validation: 1..36 integer, or null for indefinite. Indefinite is only
// valid in monthly mode (one-time has no concept of duration).
export function isValidDurationMonths(
  mode: PaymentMode,
  months: number | null,
): boolean {
  if (mode === "one_time") return months === null;
  if (months === null) return true; // indefinite monthly
  return Number.isInteger(months) && months >= CUSTOM_DURATION_MIN && months <= CUSTOM_DURATION_MAX;
}

// Total amount the donor will commit over the chosen duration.
//   indefinite → just the monthly amount (commitment is per-month)
//   fixed-term → amount × months
export function calculateMonthlyTotal(
  amountUsd: number,
  durationMonths: number | null,
): number {
  if (durationMonths == null) return amountUsd;
  return amountUsd * durationMonths;
}

// When does this sponsorship's coverage end? Best-effort approximation
// for display — exact dates are computed at create-time by Stripe (for
// recurring fixed-term) and by the cron (for prepaid).
//   30.44 = average days per month (365.25 / 12).
export function calculateScheduledEndDate(
  durationMonths: number | null,
  now: Date = new Date(),
): Date | null {
  if (durationMonths == null) return null;
  const ms = durationMonths * 30.44 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}
