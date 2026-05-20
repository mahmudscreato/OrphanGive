// Session 58.2 — currency picker for /donate and /sponsor.
//
// Click opens a dropdown; selection invokes the setDonorCurrencyAction
// server action which sets the og_currency cookie and revalidates the
// parent path. The page then re-renders with amounts in the new
// currency.

"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { setDonorCurrencyAction } from "@/app/donate/actions";

interface CurrencyOption {
  code: string;
  symbol: string;
  display_name: string;
}

interface Props {
  current: { code: string; symbol: string; display_name: string };
  options: ReadonlyArray<CurrencyOption>;
  fromPath: string;
  /**
   * Session 58.3.2 — when true, the donor already has Stripe objects
   * in this currency and Stripe forbids combining currencies on one
   * customer. The picker renders disabled with a lock icon + tooltip.
   */
  locked?: boolean;
}

const LOCKED_TOOLTIP =
  "Your account is linked to this currency. To change it, contact us.";

export function CurrencyPicker({
  current,
  options,
  fromPath,
  locked = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(code: string) {
    setOpen(false);
    startTransition(async () => {
      await setDonorCurrencyAction(code, fromPath);
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => {
          if (locked) return;
          setOpen((v) => !v);
        }}
        disabled={isPending || locked}
        title={locked ? LOCKED_TOOLTIP : undefined}
        aria-disabled={locked || undefined}
        className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium text-ink shadow-sm ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-tangerine ${
          locked
            ? "cursor-not-allowed opacity-80"
            : "hover:ring-tangerine disabled:opacity-60"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-slate">{current.symbol}</span>
        <span>{current.code}</span>
        {locked ? (
          <Lock className="h-3 w-3 text-slate" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate" aria-hidden="true" />
        )}
      </button>

      {open && !locked ? (
        <ul
          role="listbox"
          className="absolute right-0 z-10 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200"
        >
          {options.map((opt) => {
            const isActive = opt.code === current.code;
            return (
              <li key={opt.code}>
                <button
                  type="button"
                  onClick={() => pick(opt.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-tangerine-mist/50 ${
                    isActive ? "bg-tangerine-mist/40 text-ink" : "text-ink"
                  }`}
                >
                  <span className="w-6 text-slate">{opt.symbol}</span>
                  <span className="font-medium">{opt.code}</span>
                  <span className="text-ink-soft">— {opt.display_name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
