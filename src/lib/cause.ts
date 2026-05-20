// Coverage package / cause taxonomy. Single source of truth for the
// 5 supported causes; sponsor flow, dashboard cards, emails, and
// Directus seed data all reference these constants.
//
// HYBRID ALLOCATION MODEL:
//   • Donor's stated intent is captured at sponsor flow (default:
//     general_care).
//   • Charity admin can override `cause` on a sponsorship row in
//     Directus admin to reflect actual operational allocation.
//   • All display surfaces (dashboard cards, detail page, emails)
//     read the current value of `cause`, so admin overrides flow
//     through immediately — no caching, no copies, no re-derivation.
//   • Donor-facing copy explicitly notes "Funds may be applied where
//     most needed" — sets expectation for charity flexibility.

export const CAUSES = [
  {
    enum: "general_care",
    label: "Where most needed",
    description:
      "Allocated by the charity based on the child's most pressing needs that month.",
  },
  // Session 58.3.2 — added "Family support" as a donor-facing intent.
  // Stored on sponsorship.cause as a new value `family_support`. The
  // column is a string (max 255) with a Directus dropdown hint, not a
  // hard Postgres enum, so the new value writes cleanly. NOTE: brief
  // suggested mapping to general_care; we kept it as a distinct enum
  // so the donor's intent is preserved on the row and admin can
  // re-allocate if needed (hybrid-allocation model already documented
  // at the top of this file).
  {
    enum: "family_support",
    label: "Family support",
    description:
      "Help the wider family — household essentials, rent assistance, livelihood support.",
  },
  {
    enum: "education",
    label: "Education and learning",
    description: "Tuition, books, uniforms, and learning support.",
  },
  {
    enum: "healthcare",
    label: "Health and wellbeing",
    description: "Medical care, checkups, and health essentials.",
  },
  {
    enum: "food",
    label: "Food and nutrition",
    description: "Daily meals and nutritional support.",
  },
  {
    enum: "eid_gift",
    label: "Eid blessing",
    description:
      "An Eid gift for the child to mark the holiday with their community.",
  },
] as const;

export type CauseEnum = (typeof CAUSES)[number]["enum"];

export const DEFAULT_CAUSE: CauseEnum = "general_care";

const VALID_CAUSE_SET: ReadonlySet<string> = new Set(CAUSES.map((c) => c.enum));

// Type-narrowing predicate for input validation. Use this on every
// inbound `cause` value (cart/add body, prefill query string, anything
// crossing a trust boundary) before letting it touch a CartItem or
// sponsorship row. Unknown strings are rejected; legacy data with null
// is handled separately at the display layer via labelForCause().
export function isValidCause(c: unknown): c is CauseEnum {
  return typeof c === "string" && VALID_CAUSE_SET.has(c);
}

// Donor-facing label. For unknown / null values (legacy rows that
// pre-date the migration, or admin entries not in the enum), falls
// back to "Where most needed" so the UI never shows a blank or raw
// enum string.
export function labelForCause(
  c: CauseEnum | string | null | undefined,
): string {
  if (typeof c === "string") {
    const match = CAUSES.find((x) => x.enum === c);
    if (match) return match.label;
  }
  return CAUSES[0].label; // "Where most needed"
}

// One-line description used in the CausePicker UI.
export function descriptionForCause(c: CauseEnum): string {
  return CAUSES.find((x) => x.enum === c)?.description ?? "";
}
