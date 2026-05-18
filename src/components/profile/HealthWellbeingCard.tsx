// Session 57 — Children profile redesign: warm health & wellbeing
// summary.
//
// Conditional card — renders only when AT LEAST ONE of:
//   - vaccination_status is populated and not "unknown"
//   - disability_status is populated and not "none" / "unknown"
// is present. When the child profile carries no health data, the
// card is silently omitted (consistent with the rest of the
// profile's render-when-truthy convention).
//
// Tone: warm, narrative, non-clinical. We compose at most three
// short sentences. Sensitive specifics (disability notes, mental
// health, allergies, exact medical checkup date) are NEVER
// surfaced here — those stay admin-only per the existing privacy
// tier logic (Tier 3 fields aren't in the donor profile shape at
// all per src/lib/child-profile-data.ts). This card only reflects
// category-level enums that have already been deemed donor-safe.
//
// All readings go through `child.tier2` because Session 50 moved
// the health enums there. Tier 2 is null for the public viewer,
// in which case this card no-ops cleanly.

import type { ChildProfile } from "@/lib/child-profile-data";
import { WarmCard, CardHeader } from "./WarmCard";
import {
  getVaccinationStatusLabel,
  getDisabilityStatusLabel,
} from "@/lib/form-constants";

function buildSentences(child: ChildProfile): string[] {
  const sentences: string[] = [];
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const t2 = child.tier2;
  if (!t2) return sentences;

  // Vaccination — phrase by category.
  const vac = (t2.vaccination_status || "").toLowerCase();
  if (vac === "up_to_date") {
    sentences.push("Vaccinations are up to date.");
  } else if (vac === "partial") {
    sentences.push(
      "Vaccinations are partially complete — the field team is following up.",
    );
  } else if (vac === "not_started") {
    sentences.push(
      "Vaccinations haven't started yet — supporting this is part of what sponsorship helps with.",
    );
  }
  // 'unknown' / null → skip silently.

  // Disability — only the category, never the notes. The notes
  // column may contain identifying clinical detail; that's not
  // appropriate for donor-facing rendering.
  const dis = (t2.disability_status || "").toLowerCase();
  if (dis && dis !== "none" && dis !== "unknown") {
    const label = getDisabilityStatusLabel(t2.disability_status);
    sentences.push(
      `${firstName} lives with a ${label.toLowerCase()} condition; their day-to-day care is adapted accordingly.`,
    );
  }

  return sentences;
}

export function HealthWellbeingCard({ child }: { child: ChildProfile }) {
  const sentences = buildSentences(child);
  if (sentences.length === 0) return null;

  // Quick badge row for the highest-trust status. Lets the
  // "Vaccinations up to date" line surface as a green chip even
  // before the reader scans the prose.
  const t2 = child.tier2;
  const vacLabel = t2?.vaccination_status
    ? getVaccinationStatusLabel(t2.vaccination_status)
    : null;
  const showVacChip =
    (t2?.vaccination_status || "").toLowerCase() === "up_to_date";

  return (
    <section className="px-4 md:px-6 py-6 md:py-8 bg-warmth-50">
      <div className="max-w-[760px] mx-auto">
        <WarmCard>
          <CardHeader title="Health & wellbeing" />

          {showVacChip && vacLabel ? (
            <div className="mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-moss-soft/80 text-moss-deep px-3 py-1 text-[12px] font-medium">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <path
                    d="M9 12l2 2 4-4"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  />
                </svg>
                {vacLabel}
              </span>
            </div>
          ) : null}

          <div className="text-[16px] md:text-[17px] text-ink leading-[1.7] space-y-2.5">
            {sentences.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        </WarmCard>
      </div>
    </section>
  );
}

export default HealthWellbeingCard;
