"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  effectiveVisibility,
  VISIBILITY_OPTIONS,
  type VisibilityEnum,
} from "@/lib/visibility";

type Props = {
  sponsorshipId: string;
  // Initial value (may be null on legacy rows pre-14.6 — treated as
  // anonymous via effectiveVisibility).
  initialVisibility: VisibilityEnum | string | null;
  // Donor's first name. Used only for the "as: <name>" preview when
  // the donor has selected 'named'.
  donorFirstName: string | null;
};

// Editable visibility section for /dashboard/sponsorship/[id].
// Persists changes via PATCH /api/sponsorship/[id]/visibility.
//
// UX choices:
//   • Two-button toggle (anonymous / named) — same visual language
//     as the sponsor flow's VisibilityPicker but tighter for the
//     dashboard context.
//   • Optimistic update: flip the value locally on success; on
//     failure, revert and surface the error inline.
//   • router.refresh() after success so the public child page banner
//     reflects the new state on the next visit (no caching of the
//     visibility value anywhere — we want changes to surface
//     immediately).
export function VisibilityEditor({
  sponsorshipId,
  initialVisibility,
  donorFirstName,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<VisibilityEnum>(
    effectiveVisibility(initialVisibility),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: VisibilityEnum) {
    if (next === value || pending) return;
    setError(null);
    const prev = value;
    setValue(next); // optimistic
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/sponsorship/${sponsorshipId}/visibility`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visibility: next }),
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setValue(prev); // revert
          setError(json.error ?? "Could not save your choice.");
          return;
        }
        // Force a fresh server render so the public child page banner
        // (and any other cached read-side surface) picks up the change.
        router.refresh();
      } catch {
        setValue(prev);
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <section className="mt-10 rounded-[20px] bg-white border border-ink/[0.06] px-6 py-5 max-md:px-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h2 className="font-display text-[18px] text-ink m-0">
          Public visibility
        </h2>
        {pending ? (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-soft">
            Saving…
          </span>
        ) : null}
      </div>

      <p className="text-[13.5px] text-slate leading-[1.6] mb-4 max-w-[560px]">
        Control whether your name appears on this child&rsquo;s public page.
        Only your first name is ever shown — never your email, last name, or
        any other detail.
      </p>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {VISIBILITY_OPTIONS.map((opt) => {
          const selected = opt.enum === value;
          return (
            <button
              key={opt.enum}
              type="button"
              onClick={() => pick(opt.enum)}
              disabled={pending}
              aria-pressed={selected}
              className={
                "text-left rounded-[14px] border px-4 py-3 transition-all " +
                (selected
                  ? "border-tangerine bg-tangerine-mist/60 shadow-warm"
                  : "border-ink/[0.10] bg-cream hover:border-ink/[0.20] hover:bg-white") +
                (pending ? " cursor-progress opacity-90" : " cursor-pointer")
              }
            >
              <div className="font-display text-[14.5px] text-ink leading-tight m-0">
                {opt.label}
              </div>
              <p className="mt-1 text-[12px] text-slate-soft italic leading-snug">
                {opt.enum === "named" && donorFirstName
                  ? `Public page will read “Sponsored by ${donorFirstName}.”`
                  : opt.description}
              </p>
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-danger-mist border border-danger-soft px-4 py-2 text-[12.5px] text-danger"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}

export default VisibilityEditor;
