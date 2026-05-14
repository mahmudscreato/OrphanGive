// Session 44 — "Your submission was sent" success banner.
//
// Client component. Mounted only when the URL has ?just_submitted=<id>.
// Auto-dismisses after 5s for tidiness; user can dismiss manually too.

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export function JustSubmittedBanner({ proposalId }: { proposalId: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [proposalId]);

  if (!visible) return null;

  return (
    <div className="mb-5 rounded-xl border border-moss/40 bg-moss-soft/40 px-4 py-3 flex items-start gap-3">
      <CheckCircle2
        className="w-5 h-5 text-moss-deep stroke-[1.75] shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-ink leading-snug">
          Your submission was sent for review. Admin will look at it soon.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="text-moss-deep/70 hover:text-moss-deep transition-colors shrink-0"
      >
        <X className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
      </button>
    </div>
  );
}
