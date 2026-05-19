// Session 58.2 — admin donation_package list.
//
// Server component. Two-section table grouping by package_type
// (monthly first, then one_time), sorted by display_order. Each
// row links to /admin/donation-packages/[id] for edit; an
// "Add new" button at top routes to /new. Inactive rows render
// with reduced opacity so the admin can see archived packages
// without losing the audit trail.

import Link from "next/link";
import { Plus, Edit3 } from "lucide-react";
import { listAllPackagesForAdmin } from "@/lib/donation-packages";

export const dynamic = "force-dynamic";

export default async function AdminDonationPackagesPage() {
  const all = await listAllPackagesForAdmin();
  const monthly = all.filter((p) => p.package_type === "monthly");
  const oneTime = all.filter((p) => p.package_type === "one_time");

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-serif text-3xl text-ink">Donation packages</h1>
          <p className="mt-1.5 text-[14px] text-slate max-w-xl">
            Edit the presets donors see on /sponsor and /donate. Amounts
            are in BDT; the donor-facing currency converts via the active
            currency rate at checkout.
          </p>
        </div>
        <Link
          href="/admin/donation-packages/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-orange-solid px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm hover:bg-tangerine-deep"
        >
          <Plus className="h-4 w-4" /> Add package
        </Link>
      </div>

      <Section title="Monthly" packages={monthly} />
      <Section title="One-time" packages={oneTime} />
    </div>
  );
}

function Section({
  title,
  packages,
}: {
  title: string;
  packages: ReadonlyArray<{
    id: string;
    name_en: string;
    description_en: string;
    amount_bdt: number;
    display_order: number;
    is_active: boolean;
    duration_months: number | null;
    cause_tag: string | null;
    icon: string | null;
  }>;
}) {
  return (
    <div className="mb-10">
      <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-3">
        {title}
      </h2>
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 overflow-hidden">
        {packages.length === 0 ? (
          <p className="px-5 py-6 text-[13.5px] text-ink-soft italic">
            No {title.toLowerCase()} packages yet.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {packages.map((p) => (
              <li
                key={p.id}
                className={`px-5 py-4 ${p.is_active ? "" : "opacity-55"}`}
              >
                <Link
                  href={`/admin/donation-packages/${p.id}`}
                  className="flex items-center gap-4"
                >
                  <span className="font-mono text-[11px] text-slate w-6 text-right shrink-0">
                    {p.display_order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium text-ink truncate">
                      {p.name_en}
                      {p.duration_months ? (
                        <span className="ml-2 rounded-full bg-tangerine-mist px-2 py-0.5 text-[11px] font-normal text-tangerine-deeper">
                          {p.duration_months}mo prepaid
                        </span>
                      ) : null}
                      {p.cause_tag ? (
                        <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-mono font-normal text-ink-soft">
                          {p.cause_tag}
                        </span>
                      ) : null}
                      {!p.is_active ? (
                        <span className="ml-2 text-[11px] uppercase tracking-wide text-rose-700">
                          archived
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[12.5px] text-ink-soft truncate">
                      {p.description_en}
                    </p>
                  </div>
                  <p className="text-[14px] font-mono text-ink shrink-0">
                    ৳{p.amount_bdt.toLocaleString()}
                  </p>
                  <Edit3 className="h-4 w-4 text-slate-soft shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
