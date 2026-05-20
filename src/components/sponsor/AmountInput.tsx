// Session 58.3 — restored + rewired for donor-currency amounts.
//
// The original used the hardcoded MIN_AMOUNTS table from pricing.ts.
// The restored version takes its floor from props so the orchestrator
// can pass:
//   - monthly: smallest active monthly_tier package converted to
//     donor currency
//   - one_time: a hardcoded constant (1500 BDT minimum per brief)
//     converted to donor currency

"use client";

type Props = {
  /** "monthly" affects the "/month" suffix in the label. */
  perMonth: boolean;
  /** Minimum amount in DONOR currency (whole units). */
  minDonorAmount: number;
  /** Donor's currency symbol (e.g. "$", "৳"). */
  currencySymbol: string;
  /** Donor's ISO code, shown in helper text. */
  currencyCode: string;
  value: number | "";
  onChange: (v: number | "") => void;
};

export function AmountInput({
  perMonth,
  minDonorAmount,
  currencySymbol,
  currencyCode,
  value,
  onChange,
}: Props) {
  const num = typeof value === "number" ? value : NaN;
  const hasValue = typeof value === "number";
  const valid = hasValue && Number.isInteger(num) && num >= minDonorAmount;
  const showError = hasValue && !valid;

  return (
    <div>
      <label className="block">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          Other amount{perMonth ? " /month" : ""}
        </span>
        <div className="mt-2 flex items-stretch gap-2">
          <span className="inline-flex items-center px-4 rounded-l-xl border border-ink/[0.12] bg-tangerine-mist text-tangerine-deep font-mono text-[14px] font-medium border-r-0">
            {currencySymbol}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={minDonorAmount}
            step={1}
            value={value === "" ? "" : value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onChange("");
              else {
                const n = Number(v);
                onChange(Number.isFinite(n) ? Math.floor(n) : "");
              }
            }}
            className={`flex-1 rounded-r-xl border px-4 py-3 text-[15px] text-ink bg-white focus:outline-none focus:ring-2 transition-all duration-150 ${
              showError
                ? "border-[#D04848] focus:ring-[#F4C7C7]"
                : "border-ink/[0.12] focus:border-tangerine focus:ring-tangerine-soft"
            }`}
            placeholder={`${minDonorAmount}`}
          />
        </div>
      </label>
      <p
        className={`mt-1.5 text-[12px] ${
          showError ? "text-[#A02B2B]" : "text-slate-soft"
        }`}
      >
        {showError
          ? `Minimum ${currencySymbol}${minDonorAmount.toLocaleString()} ${currencyCode}${perMonth ? "/month" : ""}.`
          : `Whole ${currencyCode} only. Minimum ${currencySymbol}${minDonorAmount.toLocaleString()} ${currencyCode}${perMonth ? "/month" : ""}.`}
      </p>
    </div>
  );
}

export default AmountInput;
