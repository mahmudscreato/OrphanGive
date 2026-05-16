// Session 52b — Admin intake-photo queue (grouped by child).
//
// Distinct from the documents queue because admin reviews multiple
// photos for the same child in one sitting. Each card shows the
// child name + a thumbnail strip + a Review batch CTA that routes
// to the per-child detail page.

import Link from "next/link";
import { ChevronRight, ImagePlus } from "lucide-react";
import { listIntakePhotoGroups } from "@/lib/admin-intake-photos";

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
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.childId}>
              <Link
                href={`/admin/reviews/intake-photos/${g.childId}`}
                className="group block rounded-2xl bg-white border border-stone-200 shadow-sm p-4 md:p-5 transition-colors hover:border-tangerine-soft"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-display text-[18px] text-ink leading-snug">
                      {g.childDisplayName}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-soft">
                      {g.pendingCount} pending of {g.totalCount} total
                    </p>
                  </div>
                  <ChevronRight
                    className="w-4 h-4 mt-1 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
                    aria-hidden="true"
                  />
                </div>
                {g.thumbnails.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {g.thumbnails.map((t) => (
                      <div
                        key={t.id}
                        className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border ${
                          t.status === "pending"
                            ? "border-amber-300"
                            : t.status === "approved"
                              ? "border-moss"
                              : t.status === "rejected"
                                ? "border-[#A02020]/40"
                                : "border-stone-200"
                        }`}
                        title={t.status}
                      >
                        {t.photoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={t.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
