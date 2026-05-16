// Session 44 — Add New Child page.
//
// Server component. Reads the DI's assigned_divisions; if empty,
// renders the AssignedDivisionsEmptyState (no form). Otherwise,
// fetches the full bd_division list (all 8 divisions) and hands them
// to a blank ChildForm in 'create' mode.
//
// Session 51.5 — the dropdown used to be restricted to the DI's
// assigned_divisions, which surfaced as "only 2 of 8 divisions appear"
// for the typical DI (Mahmud's smoke test caught this). The dropdown
// is now ALWAYS the full 8; the server's createProposal continues
// to enforce assigned_divisions via isDivisionAllowedForUser →
// DivisionNotAllowedError. This separation matches the brief's
// design: "what divisions a DI can work in" (always all 8 — they
// might be reassigning a child geographically) vs "what children a
// DI can see" (scoped to assigned_divisions). The security boundary
// is the server, not the dropdown.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getBdDistricts, getBdDivisions } from "@/lib/di-children";
import { getAssignedDivisionsForUser, getDraftForUser } from "@/lib/di-proposals";
import { listIntakePhotosForChild } from "@/lib/di-intake-photos";
import { listDocumentsForChild } from "@/lib/di-documents";
import { ChildForm } from "@/components/di/ChildForm";
import { AssignedDivisionsEmptyState } from "@/components/di/AssignedDivisionsEmptyState";

export const dynamic = "force-dynamic";

export default async function DiNewChildPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const session = await requireDiUser();

  const assignedCodes = await getAssignedDivisionsForUser(session.userId);
  if (assignedCodes.length === 0) {
    return <AssignedDivisionsEmptyState />;
  }

  // Session 48b — if the URL carries ?draftId=, attempt to load that
  // draft and pre-fill the form. Two failure modes are silently
  // ignored (form just renders blank): draft missing/not-owned, or
  // draft is an UPDATE-type that should be on the edit page (we
  // redirect there).
  const sp = await searchParams;
  const draftIdParam = sp.draftId?.trim() || null;
  let existingDraft: Record<string, unknown> | null = null;
  if (draftIdParam) {
    existingDraft = await getDraftForUser(draftIdParam, session.userId);
    if (
      existingDraft &&
      existingDraft.proposal_type === "update" &&
      existingDraft.target_child
    ) {
      // Wrong page — bounce to edit with the same draftId.
      redirect(
        `/di/children/${existingDraft.target_child}/edit?draftId=${draftIdParam}`,
      );
    }
  }

  // Session 46-fix-2 — also fetch districts for the cascade dropdown.
  // Pass the FULL district list; the BdDistrictField filters
  // client-side based on the currently-selected division.
  // Session 51.5 — divisions is the full 8 (see header). The
  // edit-page already uses getBdDivisions() with no arg (the
  // existing child may already be in a division the DI isn't
  // formally assigned to — we don't lock them out of fixing that
  // record); the new-page now matches that pattern.
  const [divisions, districts] = await Promise.all([
    getBdDivisions(),
    getBdDistricts(),
  ]);

  // Session 52e — Bug 2: when resuming a CREATE-mode draft, the
  // server pre-created a stub child at first save (Session 52a) and
  // the DI may have already uploaded intake photos + documents
  // against it before leaving the page. The edit page hydrates these
  // via listIntakePhotosForChild + listDocumentsForChild; this page
  // wasn't doing the same fetch, so resumed drafts always showed
  // empty Documents + IntakePhotoGrid sections. Mirror the edit
  // page's pattern: when existingDraft has a target_child stub, pull
  // both attached collections so the form hydrates with what's
  // already there.
  const stubChildId =
    existingDraft &&
    typeof (existingDraft as { target_child?: string | null }).target_child ===
      "string"
      ? ((existingDraft as { target_child?: string | null })
          .target_child as string)
      : null;
  const [intakePhotos, documents] = stubChildId
    ? await Promise.all([
        listIntakePhotosForChild(session.userId, stubChildId),
        listDocumentsForChild(session.userId, stubChildId),
      ])
    : [[], []];

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
        draftId={existingDraft ? draftIdParam : null}
        existingDraft={existingDraft}
        intakePhotos={intakePhotos}
        documents={documents}
      />
    </div>
  );
}
