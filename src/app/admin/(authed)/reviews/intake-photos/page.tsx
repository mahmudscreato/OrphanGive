// Session 52b — Admin intake-photo queue (grouped by child).
//
// Distinct from the documents queue because admin reviews multiple
// photos for the same child in one sitting. Each card shows the
// child name + a thumbnail strip + a Review batch CTA that routes
// to the per-child detail page.

import Link from "next/link";
import { ImagePlus } from "lucide-react";
import { listIntakePhotoGroups } from "@/lib/admin-intake-photos";
import { IntakePhotoGroupList } from "@/components/admin/IntakePhotoGroupList";

export const dynamic = "force-dynamic";

export default async function AdminIntakePhotosListPage() {
  const groups = await listIntakePhotoGroups();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <header className="mb-6 md:mb-8">
        <Link
          href="/admin/reviews"
          className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors mb-3"
        >
          ← All review queues
        </Link>
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Intake photos
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Grouped by child. Approve or reject each photo individually or
          batch a child&apos;s set in one decision pass.
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <ImagePlus
            className="w-10 h-10 text-stone-400 mx-auto mb-3 stroke-[1.5]"
            aria-hidden="true"
          />
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Inbox zero.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            No intake photos waiting on review.
          </p>
        </div>
      ) : (
        <IntakePhotoGroupList groups={groups} />
      )}
    </div>
  );
}
