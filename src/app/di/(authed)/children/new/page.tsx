// Session 44 — Add New Child page.
//
// Server component. Reads the DI's assigned_divisions; if empty,
// renders the AssignedDivisionsEmptyState (no form). Otherwise,
// fetches the bd_division rows restricted to those codes and hands
// them to a blank ChildForm in 'create' mode.
//
// Why restrict at the dropdown level (UX) AND server-side (security):
// the dropdown enforcement is purely cosmetic — anyone could craft a
// raw POST. The server's createProposal re-validates via
// isDivisionAllowedForUser, so the security boundary holds either way.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getBdDistricts, getBdDivisions } from "@/lib/di-children";
import { getAssignedDivisionsForUser } from "@/lib/di-proposals";
import { ChildForm } from "@/components/di/ChildForm";
import { AssignedDivisionsEmptyState } from "@/components/di/AssignedDivisionsEmptyState";

export const dynamic = "force-dynamic";

export default async function DiNewChildPage() {
  const session = await requireDiUser();

  const assignedCodes = await getAssignedDivisionsForUser(session.userId);
  if (assignedCodes.length === 0) {
    return <AssignedDivisionsEmptyState />;
  }

  // Session 46-fix-2 — also fetch districts for the cascade dropdown.
  // Pass the FULL district list; the BdDistrictField filters
  // client-side based on the currently-selected division.
  const [divisions, districts] = await Promise.all([
    getBdDivisions(assignedCodes),
    getBdDistricts(),
  ]);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href="/di/children"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All children
      </Link>

      {/* Header */}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Add a new child
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          You&apos;ll add basic details and a photo. Your admin reviews and
          approves before this child appears in the main list.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Tell us about this child. Admin will review and approve.
        </p>
      </header>

      <ChildForm
        mode="create"
        divisions={divisions}
        districts={districts}
      />
    </div>
  );
}
