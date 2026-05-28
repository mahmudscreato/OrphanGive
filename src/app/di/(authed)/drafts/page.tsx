// Session 48b — DI drafts list page.
//
// Server component. Lists this DI's draft proposals (status='draft'
// AND created_by = self.userId — defence-in-depth on top of the
// Directus permission filter). Each card shows operation type,
// child name (proposed for create-drafts, live for update-drafts),
// last edited time, plus Resume + Discard actions.

import Link from "next/link";
import { FileEdit, Plus } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { listDraftsForUser } from "@/lib/di-proposals";
import { DraftCard } from "@/components/di/DraftCard";
import { DiPageHeader } from "@/components/di/DiPageHeader";

export const dynamic = "force-dynamic";

export default async function DiDraftsPage() {
  const session = await requireDiUser();
  const drafts = await listDraftsForUser(session.userId);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <DiPageHeader
        title="Drafts"
        subtitle={
          drafts.length === 0
            ? "Anything you save without submitting lands here."
            : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} waiting for you to finish.`
        }
      />

      {drafts.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 text-amber-700 mb-4"
            aria-hidden="true"
          >
            <FileEdit className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Nothing in progress.
          </p>
          <p className="font-display text-[20px] text-ink mb-2">No drafts yet.</p>
          <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto mb-5">
            When you start a child profile but can&apos;t finish in one
            sitting, hit &quot;Save as draft&quot; on the form. Your work
            shows up here to resume later.
          </p>
          <Link
            href="/di/children/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tangerine text-white text-[13.5px] font-medium hover:bg-tangerine-deep transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2]" aria-hidden="true" />
            Add new child
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </div>
  );
}
