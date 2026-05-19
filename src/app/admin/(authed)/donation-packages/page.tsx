// Session 58.2 — admin donation_package list.
//
// Server component. Two sections (Monthly + One-time), each rendered
// via SortableDonationPackageList — a drag-and-drop sortable list
// that fires bulk display_order updates via /api/admin/donation-
// packages/reorder. Each row links to /admin/donation-packages/[id]
// for edit; an "Add new" button at top routes to /new. Inactive
// rows render with reduced opacity so the admin can see archived
// packages without losing the audit trail.
//
// Session 58.2-overnight Task 3 — drag-and-drop reorder shipped.
// The manual display_order number input on the edit page remains
// as a keyboard-accessible fallback.

import Link from "next/link";
import { Plus } from "lucide-react";
import { listAllPackagesForAdmin } from "@/lib/donation-packages";
import {
  SortableDonationPackageList,
  type SortableRow,
} from "@/components/admin/SortableDonationPackageList";

export const dynamic = "force-dynamic";

export default async function AdminDonationPackagesPage() {
  const all = await listAllPackagesForAdmin();
  const toRow = (p: (typeof all)[number]): SortableRow => ({
    id: p.id,
    name_en: p.name_en,
    description_en: p.description_en,
    amount_bdt: p.amount_bdt,
    display_order: p.display_order,
    is_active: p.is_active,
    duration_months: p.duration_months,
    cause_tag: p.cause_tag,
  });
  const monthly = all
    .filter((p) => p.package_type === "monthly")
    .map(toRow);
  const oneTime = all
    .filter((p) => p.package_type === "one_time")
    .map(toRow);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-serif text-3xl text-ink">Donation packages</h1>
          <p className="mt-1.5 text-[14px] text-slate max-w-xl">
            Edit the presets donors see on /sponsor and /donate. Amounts
            are in BDT; the donor-facing currency converts via the active
            currency rate at checkout. Drag the handle on the left of any
            row to reorder.
          </p>
        </div>
        <Link
          href="/admin/donation-packages/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-orange-solid px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm hover:bg-tangerine-deep"
        >
          <Plus className="h-4 w-4" /> Add package
        </Link>
      </div>

      <SortableDonationPackageList title="Monthly" rows={monthly} />
      <SortableDonationPackageList title="One-time" rows={oneTime} />
    </div>
  );
}
