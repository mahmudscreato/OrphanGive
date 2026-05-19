// Session 58.2 — edit an existing donation package.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getPackageById } from "@/lib/donation-packages";
import { DonationPackageForm } from "@/components/admin/DonationPackageForm";

export const dynamic = "force-dynamic";

export default async function EditDonationPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pkg = await getPackageById(id, { includeInactive: true });
  if (!pkg) notFound();

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <Link
        href="/admin/donation-packages"
        className="inline-flex items-center gap-1 text-[13.5px] text-slate hover:text-tangerine-deeper mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All packages
      </Link>
      <h1 className="font-serif text-3xl text-ink mb-1">{pkg.name_en}</h1>
      <p className="mb-7 text-[14px] text-slate">
        Edit this {pkg.package_type === "monthly" ? "monthly" : "one-time"} package.
        Changes are audited.
      </p>
      <DonationPackageForm mode="edit" initial={pkg} />
    </div>
  );
}
