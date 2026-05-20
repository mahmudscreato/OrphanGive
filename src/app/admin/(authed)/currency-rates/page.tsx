// Session 58.2 — admin currency_rate list.
//
// Server component. Simple table of all 8 launch currencies sorted by
// code. v1 allows edit only (no create / delete) — the launch set is
// fixed. Each row links to /admin/currency-rates/[id] for edit.

import Link from "next/link";
import { Edit3 } from "lucide-react";
import { listAllCurrenciesForAdmin } from "@/lib/currency-rates";

export const dynamic = "force-dynamic";

export default async function AdminCurrencyRatesPage() {
  const rates = await listAllCurrenciesForAdmin();

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="font-serif text-3xl text-ink">Currency rates</h1>
        <p className="mt-1.5 text-[14px] text-slate max-w-xl">
          The BDT-per-unit rate each donor currency converts at. Rates are
          padded against FX swings; the value captured at checkout time
          is snapshotted to the sponsorship row so historic charges stay
          reconcilable when you change rates here.
        </p>
      </div>

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-stone-50 text-slate text-[11px] uppercase tracking-[0.14em]">
            <tr>
              <th className="px-4 py-2.5 text-left font-mono font-medium">Code</th>
              <th className="px-4 py-2.5 text-left font-mono font-medium">Name</th>
              <th className="px-4 py-2.5 text-right font-mono font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-right font-mono font-medium">BDT / unit</th>
              <th className="px-4 py-2.5 text-right font-mono font-medium">Status</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rates.map((r) => (
              <tr key={r.id} className={r.is_active ? "" : "opacity-55"}>
                <td className="px-4 py-3 font-mono font-medium text-ink">
                  {r.currency_code}
                </td>
                <td className="px-4 py-3 text-ink-soft">{r.display_name}</td>
                <td className="px-4 py-3 text-right text-ink">{r.symbol}</td>
                <td className="px-4 py-3 text-right font-mono text-ink">
                  {r.bdt_per_unit.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-[12px]">
                  {r.is_active ? (
                    <span className="text-moss-deep">Active</span>
                  ) : (
                    <span className="text-rose-700">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/currency-rates/${r.id}`}
                    className="inline-flex items-center text-slate hover:text-tangerine-deep"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="sr-only">Edit {r.currency_code}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
