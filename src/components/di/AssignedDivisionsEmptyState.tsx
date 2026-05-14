// Session 44 — Empty state for /di/children/new when the DI's
// assigned_divisions is null or empty.
//
// Server component. Renders instead of the form so a brand-new DI
// can't propose a child in a division they haven't been assigned to.

import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";

const SUPPORT_EMAIL = "support@orphangive.org";

export function AssignedDivisionsEmptyState() {
  return (
    <div className="px-5 md:px-10 lg:px-12 py-10 md:py-16 max-w-xl mx-auto text-center">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-tangerine-mist text-tangerine-deeper mb-5"
        aria-hidden="true"
      >
        <MapPin className="w-8 h-8 stroke-[1.5]" />
      </div>
      <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight mb-3">
        Not yet set up to add children
      </h1>
      <p className="text-[15px] md:text-[16px] text-ink-soft leading-relaxed mb-2">
        Your admin hasn&apos;t assigned divisions you can create new children
        in yet.
      </p>
      <p className="text-[15px] text-ink-soft leading-relaxed mb-6">
        Ask them to set your assigned divisions, then come back here. You can
        reach them at{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-tangerine-deeper hover:underline font-medium"
        >
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <Link
        href="/di/children"
        className="inline-flex items-center gap-1 text-[14px] font-medium text-tangerine-deeper hover:underline"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Back to my children
      </Link>
    </div>
  );
}
