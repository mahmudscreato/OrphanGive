"use client";

import { formatUsd, type PaymentMode, type PaymentSchedule } from "@/lib/pricing";
import { labelForCause, type CauseEnum } from "@/lib/cause";

export type SponsorReviewProps = {
  paymentMode: PaymentMode;
  amountUsd: number;
  // monthly only; null for one-time
  durationMonths: number | null;
  paymentSchedule: PaymentSchedule | null;
  // Donor's chosen allocation intent.
  cause: CauseEnum;
  // Action props
  onEdit: () => void;
  onAddToCart: () => void;
  pending: boolean;
  error: string | null;
  // Action label is a prop so the parent can swap "Add to cart" for
  // "Save changes" when editing an existing cart item.
  ctaLabel?: string;
};

// Final step of the sponsor flow. Summarises the donor's choices and
// surfaces both the "today" and "total commitment" numbers so they can
// confirm before adding to cart.
export function SponsorReviewCard({
  paymentMode,
  amountUsd,
  durationMonths,
  paymentSchedule,
  cause,
  onEdit,
  onAddToCart,
  pending,
  error,
  ctaLabel = "Add to cart",
}: SponsorReviewProps) {
  const isMonthly = paymentMode === "monthly";
  const isFixedTerm = isMonthly && durationMonths !== null;
  const isPrepaid = paymentSchedule === "monthly_prepaid";

  // Today's charge:
  //   one_time → amount
  //   monthly_prepaid → amount × months (full upfront)
  //   monthly recurring (any duration) → amount (first month only)
  let todayAmount = amountUsd;
  if (paymentMode === "one_time") {
    todayAmount = amountUsd;
  } else if (isPrepaid && durationMonths !== null) {
    todayAmount = amountUsd * durationMonths;
  } else {
    todayAmount = amountUsd; // first month
  }

  // Total commitment (what the donor will end up paying over the term):
  //   one_time → amount
  //   monthly indefinite → "ongoing"
  //   monthly fixed-term (any schedule) → amount × months
  const totalCommitment: string =
    paymentMode === "one_time"
      ? formatUsd(amountUsd)
      : isFixedTerm
        ? formatUsd(amountUsd * (durationMonths ?? 0))
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
          className="text-[13px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Edit selections
        </button>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[14px] text-ink">
        <Row label="Type">
          {isMonthly ? "Monthly sponsorship" : "One-time gift"}
        </Row>
        <Row label="Amount">{formatUsd(amountUsd)}{isMonthly ? " / month" : ""}</Row>
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
        <Row label="Supporting">{labelForCause(cause)}</Row>
      </dl>

      <div className="mt-4 pt-4 border-t border-ink/[0.06] grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft mb-1">
            Today&rsquo;s charge
          </div>
          <div className="font-display text-[24px] text-ink tracking-[-0.01em]">
            {formatUsd(todayAmount)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft mb-1">
            Total commitment
          </div>
          <div className="font-display text-[20px] text-slate tracking-[-0.01em]">
            {totalCommitment}
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
        onClick={onAddToCart}
        disabled={pending}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-white px-6 py-[14px] text-[15px] transition-all duration-[250ms] ease-soft hover:bg-tangerine-deep hover:shadow-warm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : null}
        {ctaLabel}
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
