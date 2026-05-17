// Session 43 — Profile tab content for Child Detail.
// Session 44 — Edit button wired up to /di/children/[id]/edit.
//
// Server component. Read-only DI-visible fields per spec §3.
// The `district_internal` and `guardian_summary_internal` fields
// get a tangerine-tinted "Internal notes (not shown to donors)"
// section so the DI is reminded what's staff-only data.

import Link from "next/link";
import { Edit3 } from "lucide-react";
import type { DiChildDetail } from "@/lib/di-children";

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function prettifyEducation(s: string | null): string | null {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Section({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`py-4 first:pt-0 ${divider ? "border-b border-stone-200 last:border-b-0" : ""}`}
    >
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium mb-2">
        {label}
      </div>
      <div className="text-[15px] text-ink leading-relaxed whitespace-pre-line">
        {children}
      </div>
    </div>
  );
}

export function ProfilePanel({ child }: { child: DiChildDetail }) {
  const enteredAt = formatLongDate(child.approved_at);
  const lastVisit = formatLongDate(child.last_visit_date);
  const story = child.story?.trim() || "—";
  const education = prettifyEducation(child.education_level) || "—";

  return (
    <section
      aria-label="Profile"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-6"
    >
      <h2 className="font-display text-[22px] text-ink mb-4">Profile</h2>

      <Section label="Story">{story}</Section>
      <Section label="Education">{education}</Section>
      <Section label="Last visit">{lastVisit ?? "—"}</Section>

      {/* Internal-only block — visually marked so the DI doesn't
          accidentally treat it as donor-facing copy. */}
      <div className="mt-2 -mx-2 px-4 py-3 rounded-xl bg-tangerine-mist/60 border border-tangerine-soft/60">
        <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deeper font-medium mb-3">
          Internal notes (not shown to donors)
        </div>
        <div className="space-y-3 text-[14.5px] text-ink leading-relaxed">
          <div>
            <span className="text-ink-soft text-[13px] font-medium mr-2">
              District:
            </span>
            <span>{child.district_internal?.trim() || "—"}</span>
          </div>
          <div>
            <span className="text-ink-soft text-[13px] font-medium mr-2">
              Guardian context:
            </span>
            <span className="whitespace-pre-line">
              {child.guardian_summary_internal?.trim() || "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-5 mt-2">
        <Section label="Entered the OrphanGive system" divider={false}>
          {enteredAt ?? "—"}
        </Section>
      </div>

      {/* Edit button — links to the proposal-creating edit form
          (Session 44). Submissions go through child_proposal — admin
          must approve before changes go live. */}
      <div className="pt-4 border-t border-stone-200 mt-2">
        <Link
          href={`/di/children/${child.id}/edit`}
          className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[14px] font-medium hover:bg-tangerine-mist/40 transition-colors"
        >
          <Edit3 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Edit profile
        </Link>
      </div>
    </section>
  );
}
