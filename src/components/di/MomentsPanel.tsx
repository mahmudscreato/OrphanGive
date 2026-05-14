// Session 45 — Moments tab content for Child Detail.
//
// Server component. Replaces the Session 43 ComingSoonPanel for the
// Moments tab. Renders an "Upload moment" CTA + chronological list
// (newest first) of all moments on this child, including the DI's
// own pending uploads.

import Link from "next/link";
import { Camera, Upload } from "lucide-react";
import type { MomentSummary } from "@/lib/di-moments";
import { MomentCard } from "./MomentCard";

export function MomentsPanel({
  moments,
  childId,
}: {
  moments: MomentSummary[];
  childId: string;
}) {
  return (
    <section
      aria-label="Moments"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-[20px] text-ink leading-tight">
          Moments
        </h2>
        <Link
          href={`/di/children/${childId}/moments/new`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-tangerine text-white text-[13.5px] font-medium hover:bg-tangerine-deep transition-colors"
        >
          <Upload className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Upload moment
        </Link>
      </header>

      {moments.length === 0 ? (
        <div className="py-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-3"
            aria-hidden="true"
          >
            <Camera className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            Photos and short videos tell their story.
          </p>
          <p className="text-[14.5px] text-ink leading-relaxed mb-1">
            No moments yet.
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed max-w-sm mx-auto">
            The first photo or video you upload will appear here once admin
            approves it.
          </p>
        </div>
      ) : (
        <div>
          {moments.map((m) => (
            <MomentCard key={m.id} moment={m} />
          ))}
        </div>
      )}
    </section>
  );
}
