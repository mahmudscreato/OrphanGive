// Admin direct-edit child page.
//
// Server component. Loads the current child via getAdminChildDetail (which
// already returns every editable field) + the district list for the cascade,
// and seeds the shared ChildFieldSet (via AdminChildEditForm) with ALL 39
// fields' current values. The form POSTs to /api/admin/children/[id]/edit
// which writes directly to the child row (bypasses the proposal queue).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminChildDetail } from "@/lib/admin-children";
import { getBdDistricts } from "@/lib/di-children";
import { AdminChildEditForm } from "@/components/admin/AdminChildEditForm";
import type { ChildInitialValues } from "@/components/admin/ChildFieldSet";

export const dynamic = "force-dynamic";

// Date columns may come back as full ISO datetimes; the <input type="date">
// binds to YYYY-MM-DD.
function toDateInput(v: string | null | undefined): string {
  if (!v) return "";
  return String(v).slice(0, 10);
}
function toNumStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

export default async function AdminChildEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const [detail, districts] = await Promise.all([
    getAdminChildDetail(id),
    getBdDistricts(),
  ]);
  if (!detail) notFound();

  // Seed the shared field set with the child's CURRENT values (all 39 fields).
  const initial: ChildInitialValues = {
    fields: {
      display_name: detail.display_name === "Unnamed child" ? "" : detail.display_name,
      gender: detail.gender ?? "",
      date_of_birth: toDateInput(detail.date_of_birth),
      bd_division: detail.division_code ?? "",
      bd_district: detail.district_code ?? "",
      district_internal: detail.district_internal ?? "",
      permanent_address: detail.permanent_address ?? "",
      education_level: detail.education_level ?? "",
      class_grade: detail.class_grade ?? "",
      school_name_raw: detail.school_name_raw ?? "",
      story: detail.story ?? "",
      support_type: detail.support_type ?? "",
      monthly_cost: toNumStr(detail.monthly_cost),
      priority_support: detail.priority_support ?? "",
      priority_notes: detail.priority_notes ?? "",
      blood_group: detail.blood_group ?? "",
      vaccination_status: detail.vaccination_status ?? "",
      last_medical_checkup: toDateInput(detail.last_medical_checkup),
      disability_status: detail.disability_status ?? "",
      disability_notes: detail.disability_notes ?? "",
      parent_loss: detail.parent_loss ?? "",
      siblings_count: toNumStr(detail.siblings_count),
      sibling_position: toNumStr(detail.sibling_position),
      siblings_notes: detail.siblings_notes ?? "",
      household_size: toNumStr(detail.household_size),
      household_income_source: detail.household_income_source ?? "",
      monthly_household_income_bdt: toNumStr(detail.monthly_household_income_bdt),
      guardian_relationship: detail.guardian_relationship ?? "",
      guardian_employment_type: detail.guardian_employment_type ?? "",
      guardian_employment: detail.guardian_employment ?? "",
      guardian_phone: detail.guardian_phone ?? "",
      guardian_phone_alt: detail.guardian_phone_alt ?? "",
      guardian_summary_internal: detail.guardian_summary_internal ?? "",
      additional_family_notes: detail.additional_family_notes ?? "",
      last_visit_date: toDateInput(detail.last_visit_date),
      submission_date: toDateInput(detail.submission_date),
    },
    areas: detail.areas_of_interest ?? [],
    photoUuid: detail.photo_uuid ?? null,
    photoConsent: detail.photo_consent ?? false,
  };

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
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
          Admin edits are written directly to the child record and audited with
          a before/after diff. The DI proposal queue is bypassed — changes
          appear immediately on donor surfaces.
        </p>
      </header>

      <AdminChildEditForm
        childId={detail.id}
        districts={districts}
        initial={initial}
      />
    </div>
  );
}
