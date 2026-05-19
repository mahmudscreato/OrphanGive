// Session 66 — Admin direct-edit form page.
//
// Server component. Loads the current child via getAdminChildDetail
// and seeds the client form's `initial` values from it. The client
// component (AdminChildEditForm) POSTs to
// /api/admin/children/[id]/edit which writes directly to the child
// row (bypasses the proposal queue).
//
// V1 covers the subset of fields the brief specifically asks for:
// display_name, story, support_type, monthly_cost, priority_support,
// priority_notes, blood_group, vaccination_status,
// last_medical_checkup, disability_status, disability_notes,
// additional_family_notes. The full 41-field surface is still
// available in Directus admin for the long tail.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminChildDetail } from "@/lib/admin-children";
import { AdminChildEditForm } from "@/components/admin/AdminChildEditForm";

export const dynamic = "force-dynamic";

export default async function AdminChildEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const detail = await getAdminChildDetail(id);
  if (!detail) notFound();

  // Seed initial form values from current row. Numbers + dates get
  // converted to display-strings since the form binds to text/number
  // inputs. Empty values stay as "" so the diff in the form can
  // detect dirty fields by comparing trimmed strings.
  const initial = {
    display_name: detail.display_name,
    story: detail.story,
    support_type: detail.support_type ?? "",
    monthly_cost:
      detail.monthly_cost === null ? "" : String(detail.monthly_cost),
    priority_support: detail.priority_support ?? "",
    priority_notes: detail.priority_notes ?? "",
    blood_group: detail.blood_group ?? "",
    vaccination_status: detail.vaccination_status ?? "",
    last_medical_checkup: detail.last_medical_checkup ?? "",
    disability_status: detail.disability_status ?? "",
    disability_notes: detail.disability_notes ?? "",
    additional_family_notes: detail.additional_family_notes ?? "",
  };

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href={`/admin/children/${detail.id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Back to {detail.display_name}
      </Link>

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Edit child profile
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Admin edits are written directly to the child record and audited
          with a before/after diff. The DI proposal queue is bypassed —
          changes appear immediately on donor surfaces.
        </p>
      </header>

      <AdminChildEditForm childId={detail.id} initial={initial} />
    </div>
  );
}
