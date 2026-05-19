// Session 58.2 — edit a currency rate.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrencyById } from "@/lib/currency-rates";
import { CurrencyRateForm } from "@/components/admin/CurrencyRateForm";

export const dynamic = "force-dynamic";

export default async function EditCurrencyRatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rate = await getCurrencyById(id);
  if (!rate) notFound();

  return (
    <div className="px-6 py-8 max-w-xl mx-auto">
      <Link
        href="/admin/currency-rates"
        className="inline-flex items-center gap-1 text-[13.5px] text-slate hover:text-tangerine-deeper mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All rates
      </Link>
      <h1 className="font-serif text-3xl text-ink mb-1">
        {rate.currency_code} — {rate.display_name}
      </h1>
      <p className="mb-7 text-[14px] text-slate">
        Edit this currency rate. Changes are audited; sponsorship rows
        already created keep their snapshotted rate.
      </p>
      <CurrencyRateForm initial={rate} />
    </div>
  );
}
