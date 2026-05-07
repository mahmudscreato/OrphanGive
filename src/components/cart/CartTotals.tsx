import { formatUsd } from "@/lib/pricing";

type Props = {
  monthlyTotal: number;
  oneTimeTotal: number;
};

export function CartTotals({ monthlyTotal, oneTimeTotal }: Props) {
  const hasMonthly = monthlyTotal > 0;
  const hasOneTime = oneTimeTotal > 0;
  return (
    <div className="rounded-[20px] bg-cream border border-ink/[0.06] p-5">
      <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate-soft font-medium mb-3">
        Order totals
      </h3>
      <div className="space-y-3">
        {hasMonthly ? (
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-slate">Monthly total</span>
            <span className="font-display text-[24px] text-ink">
              {formatUsd(monthlyTotal)}
              <span className="text-[13px] text-slate-soft">/month</span>
            </span>
          </div>
        ) : null}
        {hasOneTime ? (
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] text-slate">One-time total</span>
            <span className="font-display text-[24px] text-ink">
              {formatUsd(oneTimeTotal)}
            </span>
          </div>
        ) : null}
        {!hasMonthly && !hasOneTime ? (
          <div className="text-[14px] text-slate-soft">Cart is empty.</div>
        ) : null}
      </div>
      {hasMonthly ? (
        <p className="mt-4 text-[11.5px] text-slate-soft leading-snug">
          Monthly amounts charge automatically each month starting next billing
          cycle. Cancel any time.
        </p>
      ) : null}
    </div>
  );
}

export default CartTotals;
