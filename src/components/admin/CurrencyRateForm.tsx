// Session 58.2 — edit form for currency_rate.
//
// v1 fields: bdt_per_unit, is_active, display_name, symbol. The
// currency_code is immutable (it's the natural key + drives all
// downstream lookups). New currencies are not creatable in v1 —
// the 8 launch currencies cover all planned regions.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyRate } from "@/lib/currency-rates";
import type { CurrencyRateInput } from "@/lib/admin-donation-actions";

interface Props {
  initial: CurrencyRate;
}

export function CurrencyRateForm({ initial }: Props) {
  const router = useRouter();
  const [bdtPerUnit, setBdtPerUnit] = useState<string>(
    initial.bdt_per_unit.toFixed(2),
  );
  const [isActive, setIsActive] = useState(initial.is_active);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [symbol, setSymbol] = useState(initial.symbol);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const rateNum = Number.parseFloat(bdtPerUnit);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setError("BDT per unit must be a positive number");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required");
      return;
    }
    if (!symbol.trim()) {
      setError("Symbol is required");
      return;
    }

    const patch: Partial<CurrencyRateInput> = {
      bdt_per_unit: rateNum,
      is_active: isActive,
      display_name: displayName.trim(),
      symbol: symbol.trim(),
    };

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/currency-rates/${initial.id}/edit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.message || json.error || "Save failed");
          return;
        }
        router.push("/admin/currency-rates");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate font-mono mb-0.5">
          Currency code (immutable)
        </p>
        <p className="font-mono text-[18px] font-medium text-ink">
          {initial.currency_code}
        </p>
      </div>

      <label className="block">
        <span className="block text-[13px] font-medium text-ink mb-1.5">
          BDT per unit
        </span>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={bdtPerUnit}
          onChange={(e) => setBdtPerUnit(e.target.value)}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] font-mono text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
          required
        />
        <p className="mt-1 text-[12px] text-ink-soft">
          How many BDT = 1 unit of this currency. Padded against FX swings.
          Snapshotted onto sponsorship rows at checkout time so historic
          charges keep their original rate.
        </p>
      </label>

      <label className="block">
        <span className="block text-[13px] font-medium text-ink mb-1.5">
          Display name
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
          required
        />
      </label>

      <label className="block">
        <span className="block text-[13px] font-medium text-ink mb-1.5">
          Symbol
        </span>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          maxLength={8}
          className="w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft"
          required
        />
      </label>

      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-tangerine"
        />
        Active (donors can select this currency)
      </label>

      {error ? <p className="text-[13px] text-rose-700">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-orange-solid px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-tangerine-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/currency-rates")}
          className="text-[13.5px] text-ink-soft hover:text-tangerine-deeper underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
