// Session 43 — Branded 404 for /di/(authed)/* routes.
//
// Triggers when a page beneath this route group calls notFound() —
// most commonly the child detail page when the requested child either
// doesn't exist OR is outside the DI's scope (we collapse both into
// a single 404 so the API never reveals which child IDs the DI is
// or isn't allowed to see; see src/lib/di-children.ts).
//
// The root /not-found.tsx is marketing-flavored (Browse children /
// About / Contact). Here we keep the destinations DI-relevant.

import Link from "next/link";
import { ChevronLeft, Compass } from "lucide-react";

export const metadata = {
  title: "Not found",
};

export default function DiNotFound() {
  return (
    <div className="px-5 md:px-10 lg:px-12 py-16 md:py-24 max-w-2xl mx-auto text-center">
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-5"
        aria-hidden="true"
      >
        <Compass className="w-7 h-7 stroke-[1.5]" />
      </div>
      <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight mb-3">
        Not found
      </h1>
      <p className="text-[15px] md:text-[16px] text-ink-soft leading-relaxed mb-6">
        This child either doesn&apos;t exist or isn&apos;t in your care.
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
