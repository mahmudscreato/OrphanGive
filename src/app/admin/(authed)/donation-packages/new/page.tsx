// Session 58.2 — create a new donation package.
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DonationPackageForm } from "@/components/admin/DonationPackageForm";

export const dynamic = "force-dynamic";

export default function NewDonationPackagePage() {
  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <Link
        href="/admin/donation-packages"
        className="inline-flex items-center gap-1 text-[13.5px] text-slate hover:text-tangerine-deeper mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        All packages
      </Link>
      <h1 className="font-serif text-3xl text-ink mb-1">New donation package</h1>
      <p className="mb-7 text-[14px] text-slate">
        Create a preset shown on /sponsor or /donate.
      </p>
      <DonationPackageForm mode="create" />
    </div>
  );
}
