// Session 57 — Children profile redesign: "Family situation" card.
//
// New section the prior design didn't have a dedicated home for.
// Surfaces approved family/guardian context as warm narrative
// prose — NOT a table. Composes 1-3 short sentences from the
// available fields:
//
//   "{Name} lives with their {guardian relationship} in {district}.
//    The family's primary income comes from {income source}.
//    {Optional: There are {N} children in the household.}"
//
// Privacy: this card is sponsor-only on the donor side (relies on
// `isSponsor` passed from the page). Public + non-sponsor donors
// see a warm locked overlay: "{Name}'s family details unlock when
// you become a sponsor." Admin tier sees the same prose as
// sponsors (they have full access via getChildById admin mode).
//
// The actual sensitive guardian name / contact stays in the
// existing LockedFieldsBand reveal-request flow; this card only
// surfaces NON-PII contextual facts (relationship category,
// income source category, household size) — all of which are
// enum-bucketed and donor-safe by design.

import Link from "next/link";
import { WarmCard, CardHeader } from "./WarmCard";
import type { ChildProfile } from "@/lib/child-profile-data";
import {
  getGuardianRelationshipLabel,
  getHouseholdIncomeSourceLabel,
} from "@/lib/form-constants";

// Session 57 — the narrative-source fields (guardian_relationship,
// household_income_source, household_size) live under `child.tier2`
// per the Session 50 tier split. `tier2` is null for public
// viewers; the parent component handles the public/non-sponsor
// gating before this prose path is reached, but we still defensively
// read through the optional chain so the card silently no-ops on
// any shape it doesn't recognise.
function hasNarrativeContent(child: ChildProfile): boolean {
  const t2 = child.tier2;
  if (!t2) return false;
  return Boolean(
    t2.guardian_relationship ||
      t2.household_income_source ||
      t2.household_size,
  );
}

function buildSentences(child: ChildProfile): string[] {
  const sentences: string[] = [];
  const firstName = child.display_name.split(" ")[0] || child.display_name;
  const t2 = child.tier2;
  if (!t2) return sentences;

  // Sentence 1: who they live with + where.
  // Relationship label comes from the canonical form-constants
  // table — lowercased here so it reads naturally inside the
  // sentence ("lives with their paternal uncle" vs. "Paternal
  // uncle").
  const relRaw = t2.guardian_relationship;
  const relLabel = relRaw
    ? getGuardianRelationshipLabel(relRaw).toLowerCase()
    : null;
  if (relLabel && child.district) {
    sentences.push(
      `${firstName} lives with their ${relLabel} in ${child.district}.`,
    );
  } else if (relLabel) {
    sentences.push(`${firstName} lives with their ${relLabel}.`);
  } else if (child.district) {
    sentences.push(`${firstName} lives in ${child.district}.`);
  }

  // Sentence 2: household income context.
  const incomeRaw = t2.household_income_source;
  const incomeLabel = incomeRaw
    ? getHouseholdIncomeSourceLabel(incomeRaw).toLowerCase()
    : null;
  if (incomeLabel && incomeLabel !== "unknown" && incomeLabel !== "none") {
    sentences.push(
      `The family's primary income comes from ${incomeLabel}.`,
    );
  }

  // Sentence 3: household size as a soft context note. Skip when
  // 0 or 1 (would read as oddly precise / lonely).
  if (
    typeof t2.household_size === "number" &&
    t2.household_size >= 2 &&
    t2.household_size <= 20
  ) {
    sentences.push(
      `There are ${t2.household_size} people in the household.`,
    );
  }

  return sentences;
}

export function FamilyNarrativeCard({
  child,
  isSponsor,
  isAuthenticated,
}: {
  child: ChildProfile;
  isSponsor: boolean;
  isAuthenticated: boolean;
}) {
  const firstName = child.display_name.split(" ")[0] || child.display_name;

  // Non-sponsor branch: ALWAYS render the warm locked invitation
  // regardless of whether tier2 data actually exists. We render
  // before hasNarrativeContent() because public viewers don't
  // receive tier2 in their payload (`child.tier2 === null` per
  // Session 50 tier split) and so wouldn't be able to make the
  // sponsor-vs-empty distinction even if they wanted to. The lock
  // copy frames as a privacy promise, not a paywall — fine to
  // surface even on the rare profile where the family fields
  // happen to be empty server-side.
  if (!isSponsor) {
    return (
      <section className="px-4 md:px-6 py-6 md:py-8 bg-warmth-50">
        <div className="max-w-[760px] mx-auto">
          <WarmCard surface="warm">
            <CardHeader title="Family situation" />
            <p className="text-[15.5px] text-warmth-text leading-relaxed">
              {firstName}&apos;s family details unlock when you become a
              sponsor — we keep them out of public view to protect the
              family&apos;s privacy.
            </p>
            <div className="mt-5">
              {isAuthenticated ? (
                <Link
                  href={`/sponsor/${child.id}`}
                  className="inline-flex items-center gap-1.5 text-tangerine-deeper font-medium text-[14px] hover:gap-2.5 transition-[gap]"
                >
                  Sponsor {firstName} to learn more →
                </Link>
              ) : (
                <Link
                  href={`/signin?from=/children/${child.id}`}
                  className="inline-flex items-center gap-1.5 text-tangerine-deeper font-medium text-[14px] hover:gap-2.5 transition-[gap]"
                >
                  Sign in to learn more →
                </Link>
              )}
            </div>
          </WarmCard>
        </div>
      </section>
    );
  }

  // Sponsor (or admin) branch: warm narrative prose. If the child
  // genuinely has no family data populated, render-when-truthy: omit
  // the card silently rather than show an empty box.
  if (!hasNarrativeContent(child)) return null;
  const sentences = buildSentences(child);
  if (sentences.length === 0) return null;

  return (
    <section className="px-4 md:px-6 py-6 md:py-8 bg-warmth-50">
      <div className="max-w-[760px] mx-auto">
        <WarmCard surface="warm">
          <CardHeader title="Family situation" />
          <div className="text-[16.5px] md:text-[17px] text-ink leading-[1.75] space-y-3">
            {sentences.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        </WarmCard>
      </div>
    </section>
  );
}

export default FamilyNarrativeCard;
