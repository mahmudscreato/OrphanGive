// Session 44 — Edit Child page.
//
// Server component. Pulls the editable snapshot for the child (with
// scope guard via getChildEditSnapshot) and pre-fills the shared
// ChildForm in 'edit' mode. The bd_division dropdown shows ALL eight
// divisions for edit (an existing child may already be in a division
// the DI isn't formally assigned to — we don't lock them out of
// fixing that record).
//
// 404s when the child is out of scope, via the route group's
// /di/(authed)/not-found.tsx (Session 43).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import {
  getBdDistricts,
  getBdDivisions,
  getChildEditSnapshot,
} from "@/lib/di-children";
import { getDraftForUser } from "@/lib/di-proposals";
import { listIntakePhotosForChild } from "@/lib/di-intake-photos";
import { ChildForm } from "@/components/di/ChildForm";

export const dynamic = "force-dynamic";

export default async function DiEditChildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draftId?: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;

  // Session 46-fix-2 — also fetch districts for the cascade dropdown.
  // Session 48b — also fetch intake photos so the grid hydrates with
  // existing rows on first paint (no client roundtrip needed).
  // Four parallel reads; districts is a tiny static-ish list (~64 rows),
  // intake photos are at most 5 rows.
  const [child, divisions, districts, intakePhotos] = await Promise.all([
    getChildEditSnapshot(id, session.userId),
    getBdDivisions(),
    getBdDistricts(),
    listIntakePhotosForChild(session.userId, id),
  ]);
  if (!child) notFound();

  // Session 48b — draft pre-fill via ?draftId=. Same redirect-on-
  // wrong-mode logic as the new-child page: if the draft is a
  // CREATE-type, bounce to /di/children/new with the same draftId.
  const sp = await searchParams;
  const draftIdParam = sp.draftId?.trim() || null;
  let existingDraft: Record<string, unknown> | null = null;
  if (draftIdParam) {
    existingDraft = await getDraftForUser(draftIdParam, session.userId);
    if (existingDraft && existingDraft.proposal_type === "create") {
      redirect(`/di/children/new?draftId=${draftIdParam}`);
    }
    // If the draft targets a different child than this URL, ignore
    // it (defence — DI shouldn't be able to load a draft against
    // the wrong child via URL tampering). We just don't pre-fill.
    if (existingDraft && existingDraft.target_child !== id) {
      existingDraft = null;
    }
  }

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href={`/di/children/${id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {child.display_name || "Child"}
      </Link>

      {/* Header */}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Edit profile
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Changes need admin approval before they go live.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Take your time. Nothing changes until admin approves.
        </p>
      </header>

      <ChildForm
        mode="edit"
        divisions={divisions}
        districts={districts}
        existing={child}
        draftId={existingDraft ? draftIdParam : null}
        existingDraft={existingDraft}
        intakePhotos={intakePhotos}
      />
    </div>
  );
}
