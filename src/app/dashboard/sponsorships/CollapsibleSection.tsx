"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// Small client-side disclosure used on /dashboard/sponsorships for the
// "Cancelled" section. Editorial small-caps toggle that flips a single
// piece of state — pure useState, no URL persistence (the section is
// transient noise; there's no value to deep-linking the open state).
//
// The cards passed as `children` are server-rendered inside the parent
// page component and handed in as a ReactNode prop, so the heavy
// rendering stays on the server and the client component is just a
// chrome wrapper.
export function CollapsibleSection({
  count,
  showLabel,
  hideLabel,
  children,
}: {
  count: number;
  showLabel: string;
  hideLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-[12.5px] font-mono uppercase tracking-[0.12em] text-slate-soft hover:text-slate transition-colors cursor-pointer"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span>
          {open ? hideLabel : showLabel} ({count})
        </span>
      </button>
      {open ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

export default CollapsibleSection;
