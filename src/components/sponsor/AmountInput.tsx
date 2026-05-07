"use client";

import {
  formatUsd,
  isValidAmount,
  MIN_AMOUNTS,
  type PaymentMode,
} from "@/lib/pricing";

type Props = {
  mode: PaymentMode;
  value: number | "";
  onChange: (v: number | "") => void;
};

export function AmountInput({ mode, value, onChange }: Props) {
  const min = MIN_AMOUNTS[mode];
  const num = typeof value === "number" ? value : NaN;
  const hasValue = typeof value === "number";
  const valid = hasValue && isValidAmount(mode, num);
  const showError = hasValue && !valid;

  return (
    <div>
      <label className="block">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          Other amount{mode === "monthly" ? " /month" : ""}
        </span>
        <div className="mt-2 flex items-stretch gap-2">
          <span className="inline-flex items-center px-4 rounded-l-xl border border-ink/[0.12] bg-tangerine-mist text-tangerine-deep font-mono text-[14px] font-medium border-r-0">
            $
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={min}
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
            placeholder={`${min}`}
          />
        </div>
      </label>
      <p className={`mt-1.5 text-[12px] ${showError ? "text-[#A02B2B]" : "text-slate-soft"}`}>
        {showError
          ? `Minimum ${formatUsd(min)}${mode === "monthly" ? "/month" : ""}.`
          : `Whole dollars only. Minimum ${formatUsd(min)}${mode === "monthly" ? "/month" : ""}.`}
      </p>
    </div>
  );
}

export default AmountInput;
