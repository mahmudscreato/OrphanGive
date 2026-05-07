// Sponsorship tier definitions. Source of truth for amounts/labels.
// Stripe integration in Part B will reference these tier ids.

export type PaymentMode = "monthly" | "one_time";

export type SponsorshipTier = {
  id: string;
  amount: number; // USD, integer
  label: string;
  description?: string;
};

export const SPONSORSHIP_TIERS: Record<PaymentMode, ReadonlyArray<SponsorshipTier>> = {
  monthly: [
    { id: "t_m_25",  amount: 25,  label: "Essentials",
      description: "Food, basic supplies, regular health checks." },
    { id: "t_m_50",  amount: 50,  label: "Care",
      description: "Above plus school supplies, clothing." },
    { id: "t_m_100", amount: 100, label: "Full sponsorship",
      description: "Above plus tutoring, healthcare, full support." },
    { id: "t_m_250", amount: 250, label: "Patron",
      description: "Full sponsorship plus contribution to centre operations." },
  ],
  one_time: [
    { id: "t_o_50",  amount: 50,  label: "Gift" },
    { id: "t_o_100", amount: 100, label: "Meaningful gift" },
    { id: "t_o_250", amount: 250, label: "Significant gift" },
    { id: "t_o_500", amount: 500, label: "Major gift" },
  ],
};

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
