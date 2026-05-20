// Session 58.3 — restored + rewired. Two key changes vs. the original:
//
//   1. All amounts render in donor currency (props are pre-converted
//      whole-unit amounts in the donor's currency, with the symbol +
//      code passed in alongside).
//   2. The CTA is now "Continue to payment" instead of "Add to cart".
//      Cart no longer exists in the new flow — clicking the CTA calls
//      back into the parent which fires /api/donate/init and mounts
//      Stripe Elements inline on the same page (rendered by the
//      orchestrator below this card).
//
// Cause + visibility rows render only when the orchestrator chose to
// collect them (monthly skips cause; one-time gift selections skip
// cause). Pass `cause` and `causeLabel` as null to suppress the row.

"use client";

import type { PaymentMode, PaymentSchedule } from "@/lib/pricing";
import type { VisibilityEnum } from "@/lib/visibility";

export type SponsorReviewProps = {
  paymentMode: PaymentMode;
  /** Per-charge donor-currency amount (whole units). For monthly =
   *  per-month; for one-time = the gift amount. */
  perChargeDonorAmount: number;
  /** monthly only; null for one-time */
  durationMonths: number | null;
  paymentSchedule: PaymentSchedule | null;
  /** Pre-resolved label (e.g. "Education", or a gift name). Null
   *  suppresses the row entirely. */
  causeLabel: string | null;
  visibility: VisibilityEnum;
  donorFirstName?: string | null;
  /** Donor currency context. */
  currencySymbol: string;
  currencyCode: string;
  /** "≈ X BDT" subtext rendered under each amount. */
  perChargeBdt: number;
  queueJoin?: {
    position: number;
    estimatedStartsAt: string | null;
  } | null;
  onEdit: () => void;
  onContinue: () => void;
  pending: boolean;
  error: string | null;
};

function fmt(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString()}`;
}

export function SponsorReviewCard({
  paymentMode,
  perChargeDonorAmount,
  durationMonths,
  paymentSchedule,
  causeLabel,
  visibility,
  donorFirstName,
  currencySymbol,
  currencyCode,
  perChargeBdt,
  queueJoin,
  onEdit,
  onContinue,
  pending,
  error,
}: SponsorReviewProps) {
  const isMonthly = paymentMode === "monthly";
  const isFixedTerm = isMonthly && durationMonths !== null;
  const isPrepaid = paymentSchedule === "monthly_prepaid";

  // Today's charge logic mirrors the original:
  //   one_time         → perChargeDonorAmount
  //   monthly_prepaid  → perChargeDonorAmount × months
  //   monthly recurring → perChargeDonorAmount (first month only)
  let todayAmount = perChargeDonorAmount;
  let todayBdt = perChargeBdt;
  if (isPrepaid && durationMonths !== null) {
    todayAmount = perChargeDonorAmount * durationMonths;
    todayBdt = perChargeBdt * durationMonths;
  }

  // Total commitment over the term.
  const totalCommitment: string =
    paymentMode === "one_time"
      ? fmt(perChargeDonorAmount, currencySymbol)
      : isFixedTerm
        ? fmt(perChargeDonorAmount * (durationMonths ?? 0), currencySymbol)
        : "Ongoing";

  return (
    <div className="rounded-[20px] bg-white border border-ink/[0.08] px-6 py-5 max-md:px-5">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-display text-[20px] text-ink leading-tight m-0">
          Review your sponsorship
        </h3>
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          className="text-[13px] text-tangerine-deeper hover:opacity-80 underline-offset-4 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Edit selections
        </button>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[14px] text-ink">
        <Row label="Type">
          {isMonthly ? "Monthly sponsorship" : "One-time gift"}
        </Row>
        <Row label="Amount">
          {fmt(perChargeDonorAmount, currencySymbol)} {currencyCode}
          {isMonthly ? " / month" : ""}
          <span className="ml-2 font-mono text-[10.5px] text-slate-soft">
            ≈ ৳{perChargeBdt.toLocaleString()}
            {isMonthly ? " / mo" : ""}
          </span>
        </Row>
        {isMonthly ? (
          <Row label="Duration">
            {durationMonths === null
              ? "Continue until I cancel"
              : `${durationMonths} ${durationMonths === 1 ? "month" : "months"}`}
          </Row>
        ) : null}
        {isFixedTerm ? (
          <Row label="Schedule">
            {paymentSchedule === "monthly_prepaid"
              ? "Pay full amount now"
              : "Pay monthly"}
          </Row>
        ) : null}
        {causeLabel ? <Row label="Supporting">{causeLabel}</Row> : null}
        <Row label="Visibility">
          {visibility === "named"
            ? donorFirstName
              ? `Shown publicly as "${donorFirstName}"`
              : "Shown publicly with your first name"
            : "Anonymous"}
        </Row>
        {queueJoin ? (
          <>
            <Row label="Begins">
              {(() => {
                const iso = queueJoin.estimatedStartsAt;
                if (!iso) return "When the current sponsor's term ends";
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return "—";
                return `≈ ${d.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}`;
              })()}
            </Row>
            <Row label="Queue position">{queueJoin.position}</Row>
          </>
        ) : null}
      </dl>
      {queueJoin ? (
        <p className="mt-3 text-[12.5px] text-slate-soft italic leading-snug">
          Your card is captured today. Your sponsorship begins when the
          current sponsor&rsquo;s term ends.
        </p>
      ) : null}

      <div className="mt-4 pt-4 border-t border-ink/[0.06] grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft mb-1">
            Today&rsquo;s charge
          </div>
          <div className="font-display text-[24px] text-ink tracking-[-0.01em]">
            {fmt(todayAmount, currencySymbol)} {currencyCode}
          </div>
          <div className="font-mono text-[10.5px] text-slate-soft mt-0.5">
            ≈ ৳{todayBdt.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft mb-1">
            Total commitment
          </div>
          <div className="font-display text-[20px] text-slate tracking-[-0.01em]">
            {totalCommitment}
            {totalCommitment !== "Ongoing" ? ` ${currencyCode}` : ""}
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[13px] text-[#A02B2B]"
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        disabled={pending}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : null}
        Continue to payment
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft self-center">
        {label}
      </dt>
      <dd className="m-0">{children}</dd>
    </>
  );
}

export default SponsorReviewCard;
