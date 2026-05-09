// Sponsor visibility taxonomy. Two values:
//
//   anonymous  — DEFAULT. Donor's name does not appear on the child's
//                public page. Faith-conscious / hidden-sadaqah baseline.
//   named      — Donor's first name appears on the child's public page
//                ("Sponsored by [first name]"). Donor opts INTO this.
//
// HYBRID FLOW:
//   • Donor selects at sponsor flow time (default: anonymous).
//   • Donor can change post-hoc from /dashboard/sponsorship/[id].
//   • Public child page reads the live value, so post-hoc changes
//     surface immediately (no caching).
//   • Legacy rows with visibility=null pre-date the migration —
//     `labelForVisibility` and the public-banner logic treat null
//     as anonymous so legacy data never accidentally exposes names.

export const VISIBILITY_OPTIONS = [
  {
    enum: "anonymous",
    label: "Keep anonymous",
    description:
      "Your name will not appear on the child's public page. The Prophet ﷺ taught that sadaqah given in secret is among the most beloved acts.",
  },
  {
    enum: "named",
    label: "Show my name",
    description:
      "Your first name will appear as the child's sponsor on their public page. Only your name — no other details.",
  },
] as const;

export type VisibilityEnum = (typeof VISIBILITY_OPTIONS)[number]["enum"];

export const DEFAULT_VISIBILITY: VisibilityEnum = "anonymous";

const VALID_VISIBILITY_SET: ReadonlySet<string> = new Set(
  VISIBILITY_OPTIONS.map((o) => o.enum),
);

// Type-narrowing predicate for input validation. Use on every
// inbound visibility value (cart/add body, prefill query string,
// PATCH /api/sponsorship/[id]/visibility) before letting it touch
// a CartItem or sponsorship row.
export function isValidVisibility(v: unknown): v is VisibilityEnum {
  return typeof v === "string" && VALID_VISIBILITY_SET.has(v);
}

// Donor-facing label. Null / unknown → "Keep anonymous" (the
// privacy-preserving default; legacy rows that pre-date the
// migration never accidentally render as named).
export function labelForVisibility(
  v: VisibilityEnum | string | null | undefined,
): string {
  if (typeof v === "string") {
    const match = VISIBILITY_OPTIONS.find((x) => x.enum === v);
    if (match) return match.label;
  }
  return VISIBILITY_OPTIONS[0].label; // "Keep anonymous"
}

// Treats null / unknown as 'anonymous'. Used by every read-side
// path that needs to decide whether to surface the donor's name.
export function effectiveVisibility(
  v: VisibilityEnum | string | null | undefined,
): VisibilityEnum {
  return isValidVisibility(v) ? v : DEFAULT_VISIBILITY;
}
