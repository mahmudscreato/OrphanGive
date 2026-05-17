// Session 45 — Deliveries tab content for Child Detail.

import Link from "next/link";
import { Truck, Upload } from "lucide-react";
import type { DeliverySummary } from "@/lib/di-deliveries";
import { DeliveryCard } from "./DeliveryCard";

export function DeliveriesPanel({
  deliveries,
  childId,
}: {
  deliveries: DeliverySummary[];
  childId: string;
}) {
  return (
    <section
      aria-label="Deliveries"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-[20px] text-ink leading-tight">
          Deliveries
        </h2>
        <Link
          href={`/di/children/${childId}/deliveries/new`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tangerine text-white text-[13.5px] font-medium hover:bg-tangerine-deep transition-colors"
        >
          <Upload className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Mark delivery
        </Link>
      </header>

      {deliveries.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <Truck className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="text-[14.5px] text-ink leading-relaxed mb-1">
            No deliveries logged yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto">
            When you hand aid to the family — school supplies, food,
            clothing, healthcare — log it here. Photo evidence required.
          </p>
        </div>
      ) : (
        <div>
          {deliveries.map((d) => (
            <DeliveryCard key={d.id} delivery={d} />
          ))}
        </div>
      )}
    </section>
  );
}
