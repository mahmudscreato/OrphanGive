import { formatUsd } from "@/lib/pricing";

type Props = {
  // Per-month recurring amount across all monthly-recurring items.
  monthlyRecurringTotal: number;
  // Sum of monthly_prepaid items (full N-month bundles, charged today).
  monthlyPrepaidTotal: number;
  // Sum of one-time gifts (charged today).
  oneTimeTotal: number;
};

// Split into two intentionally separate concepts:
//   • "Recurring monthly" — what the donor commits to per month going
//     forward (recurring subscriptions only).
//   • "Today's charge"    — what's actually charged at checkout
//     (one-time gifts + the full prepaid bundles).
// We never sum the two — they're different units (rate vs amount).
export function CartTotals({
  monthlyRecurringTotal,
  monthlyPrepaidTotal,
  oneTimeTotal,
}: Props) {
  const todaysCharge = monthlyPrepaidTotal + oneTimeTotal;
  const hasRecurring = monthlyRecurringTotal > 0;
  const hasToday = todaysCharge > 0;
  const isEmpty = !hasRecurring && !hasToday;

  return (
    <div className="rounded-[20px] bg-cream border border-ink/[0.06] p-5">
      <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate-soft font-medium mb-3">
        Order totals
      </h3>
      <div className="space-y-3">
        <TotalRow
          label="Recurring monthly"
          amount={formatUsd(monthlyRecurringTotal)}
          suffix="/mo"
          dim={!hasRecurring}
        />
        <TotalRow
          label="Today's charge"
          amount={formatUsd(todaysCharge)}
          suffix=""
          dim={!hasToday}
        />
        {isEmpty ? (
          <div className="text-[14px] text-slate-soft">Cart is empty.</div>
        ) : null}
      </div>
      {hasRecurring ? (
        <p className="mt-4 text-[11.5px] text-slate-soft leading-snug">
          Recurring amounts charge automatically each month starting next
          billing cycle. Cancel any time.
        </p>
      ) : null}
      {monthlyPrepaidTotal > 0 ? (
        <p className="mt-2 text-[11.5px] text-slate-soft leading-snug">
          Prepaid sponsorships charge the full amount today and cover all
          months upfront — no recurring billing.
        </p>
      ) : null}
    </div>
  );
}

function TotalRow({
  label,
  amount,
  suffix,
  dim,
}: {
  label: string;
  amount: string;
  suffix: string;
  dim: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-[14px] ${dim ? "text-slate-soft" : "text-slate"}`}>
        {label}
      </span>
      <span
        className={`font-display text-[24px] ${dim ? "text-slate-soft" : "text-ink"}`}
      >
        {amount}
        {suffix ? (
          <span
            className={`text-[13px] ${dim ? "text-slate-soft" : "text-slate-soft"}`}
          >
            {suffix}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default CartTotals;
