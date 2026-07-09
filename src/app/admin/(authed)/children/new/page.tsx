// Admin create-child page. Renders the full create form; submission POSTs to
// /api/admin/children which lands the child at status='awaiting_intake' (not
// public), attributed to the creating admin. The admin then reviews on the
// child detail page and PUBLISHES via the existing reactivate action.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getBdDistricts } from "@/lib/di-children";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminChildCreateForm } from "@/components/admin/AdminChildCreateForm";

export const dynamic = "force-dynamic";

export default async function AdminChildCreatePage() {
  const session = await requireAdminUser();
  if (!session) return null;

  // District options for the division→district cascade (same source the DI
  // intake form uses).
  const districts = await getBdDistricts();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <Link
        href="/admin/children"
        className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All children
      </Link>

      <AdminPageHeader
        title="New child"
        subtitle="Create a full profile. It lands as ‘Awaiting intake’ — review and publish it on the next screen."
      />

      <div className="mt-6">
        <AdminChildCreateForm districts={districts} />
      </div>
    </div>
  );
}
