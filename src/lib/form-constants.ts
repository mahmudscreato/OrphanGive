// Session 48a — single source of truth for the 6 form enums added /
// extended this session.
//
// Each enum is exported as both:
//   - a const tuple of value strings (for `z.enum([...])` schemas)
//   - an OPTIONS array of {value, label} objects (for form dropdowns
//     and donor-facing display)
//
// Three rules:
//   1. Form fields, server-side Zod schemas, and any donor-side
//      display helpers MUST import from here. No copy-paste.
//   2. The values match the Directus enum dropdown choices registered
//      in migrations/session-48a/002-register-fields.sh — keep both
//      in lockstep on any future edit.
//   3. This module has no React or server-only deps so it's safe to
//      import from both client + server contexts.
//
// What's NOT here yet (intentional — Session 48a left them inline):
//   SUPPORT_TYPES, BLOOD_GROUPS, VACCINATION_STATUSES,
//   DISABILITY_STATUSES, GENDERS, HOUSEHOLD_INCOME_SOURCES.
//   These already live at the top of src/app/api/di/proposals/route.ts.
//   Consolidating them here is purely refactoring — out of scope for
//   48a; flag for a follow-up cleanup if Mahmud wants symmetry.

// ─── 1. Education levels ────────────────────────────────────────────
//
// Replaces the prior free-text `education_level` input with a
// structured dropdown so admin reports / donor displays don't have
// to deal with "5" / "class 5" / "Class V" inconsistencies.

export const EDUCATION_LEVELS = [
  "not_enrolled",
  "primary_1_5",
  "junior_secondary_6_8",
  "secondary_9_10",
  "higher_secondary_11_12",
  "madrasa_ibtidayee",
  "madrasa_dakhil",
  "madrasa_alim",
  "vocational",
  "other",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LEVEL_OPTIONS: ReadonlyArray<{
  value: EducationLevel;
  label: string;
}> = [
  { value: "not_enrolled", label: "Not enrolled" },
  { value: "primary_1_5", label: "Primary (Class 1–5)" },
  { value: "junior_secondary_6_8", label: "Junior secondary (Class 6–8)" },
  { value: "secondary_9_10", label: "Secondary (Class 9–10)" },
  { value: "higher_secondary_11_12", label: "Higher secondary (Class 11–12)" },
  { value: "madrasa_ibtidayee", label: "Madrasa — Ibtidayee" },
  { value: "madrasa_dakhil", label: "Madrasa — Dakhil" },
  { value: "madrasa_alim", label: "Madrasa — Alim" },
  { value: "vocational", label: "Vocational training" },
  { value: "other", label: "Other" },
];

// ─── 2. Areas of interest ───────────────────────────────────────────
//
// 20 values surfaced as a checkbox grid in the form (Tier 1 public,
// donor-visible). Stored as text[] on `child` and `child_proposal`
// (migrated from text in this session's SQL migration).

export const AREAS_OF_INTEREST = [
  "studies",
  "reading",
  "drawing_art",
  "music",
  "sports_general",
  "cricket",
  "football",
  "science",
  "math",
  "computers",
  "religious_studies",
  "gardening",
  "cooking",
  "dance",
  "crafts",
  "writing_poetry",
  "photography",
  "public_speaking",
  "volunteering",
  "swimming",
] as const;

export type AreaOfInterest = (typeof AREAS_OF_INTEREST)[number];

export const AREA_OF_INTEREST_OPTIONS: ReadonlyArray<{
  value: AreaOfInterest;
  label: string;
}> = [
  { value: "studies", label: "Studies" },
  { value: "reading", label: "Reading" },
  { value: "drawing_art", label: "Drawing / art" },
  { value: "music", label: "Music" },
  { value: "sports_general", label: "Sports (general)" },
  { value: "cricket", label: "Cricket" },
  { value: "football", label: "Football" },
  { value: "science", label: "Science" },
  { value: "math", label: "Math" },
  { value: "computers", label: "Computers" },
  { value: "religious_studies", label: "Religious studies" },
  { value: "gardening", label: "Gardening" },
  { value: "cooking", label: "Cooking" },
  { value: "dance", label: "Dance" },
  { value: "crafts", label: "Crafts" },
  { value: "writing_poetry", label: "Writing / poetry" },
  { value: "photography", label: "Photography" },
  { value: "public_speaking", label: "Public speaking" },
  { value: "volunteering", label: "Volunteering" },
  { value: "swimming", label: "Swimming" },
];

// ─── 3. Priority support ────────────────────────────────────────────
//
// Triages how urgent the child's situation is. `urgent` triggers the
// `priority_notes` field in the form; admin uses these to surface
// urgent profiles for fast-tracked review.

export const PRIORITY_SUPPORT = ["none", "standard", "urgent"] as const;

export type PrioritySupport = (typeof PRIORITY_SUPPORT)[number];

export const PRIORITY_SUPPORT_OPTIONS: ReadonlyArray<{
  value: PrioritySupport;
  label: string;
  helper?: string;
}> = [
  { value: "none", label: "None", helper: "Standard intake process" },
  {
    value: "standard",
    label: "Standard",
    helper: "Worth flagging but not urgent",
  },
  {
    value: "urgent",
    label: "Urgent",
    helper: "Needs admin attention this week",
  },
];

// ─── 4. Parent loss ─────────────────────────────────────────────────
//
// Required on all children; documents which parents the child has
// lost. Tier 2/3 — sponsor-after-consent.

export const PARENT_LOSS = ["father", "mother", "both", "unknown"] as const;

export type ParentLoss = (typeof PARENT_LOSS)[number];

export const PARENT_LOSS_OPTIONS: ReadonlyArray<{
  value: ParentLoss;
  label: string;
}> = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "both", label: "Both" },
  { value: "unknown", label: "Unknown" },
];

// ─── 5. Guardian employment type ────────────────────────────────────
//
// Structured dropdown that REPLACES the free-text `guardian_employment`
// as the primary way of capturing guardian work. The free-text column
// stays as an optional qualifier (e.g. type=small_business,
// employment="tea stall"). Tier 3 admin-only.

export const GUARDIAN_EMPLOYMENT_TYPES = [
  "day_labor",
  "agriculture_farming",
  "small_business",
  "rickshaw_transport",
  "garment_worker",
  "domestic_worker",
  "teacher",
  "religious_scholar",
  "unemployed",
  "retired",
  "other",
] as const;

export type GuardianEmploymentType = (typeof GUARDIAN_EMPLOYMENT_TYPES)[number];

export const GUARDIAN_EMPLOYMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: GuardianEmploymentType;
  label: string;
}> = [
  { value: "day_labor", label: "Day labor" },
  { value: "agriculture_farming", label: "Agriculture / farming" },
  { value: "small_business", label: "Small business" },
  { value: "rickshaw_transport", label: "Rickshaw / transport" },
  { value: "garment_worker", label: "Garment worker" },
  { value: "domestic_worker", label: "Domestic worker" },
  { value: "teacher", label: "Teacher" },
  { value: "religious_scholar", label: "Religious scholar" },
  { value: "unemployed", label: "Unemployed" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

// ─── 6. Guardian relationships (extended) ───────────────────────────
//
// Existing 11-value enum from Sessions 44-46, EXTENDED with
// `father` and `mother` (front-loaded) so DI can record cases where
// a biological parent is still alive and acts as guardian. The
// Directus enum dropdown was extended via the same script that
// registered the new fields (002-register-fields.sh).
//
// Order matters — the form renders in this order in the dropdown.

export const GUARDIAN_RELATIONSHIPS = [
  "father",
  "mother",
  "paternal_uncle",
  "maternal_uncle",
  "paternal_aunt",
  "maternal_aunt",
  "paternal_grandparent",
  "maternal_grandparent",
  "older_sibling",
  "extended_family",
  "community_member",
  "orphanage_only",
  "other",
] as const;

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const GUARDIAN_RELATIONSHIP_OPTIONS: ReadonlyArray<{
  value: GuardianRelationship;
  label: string;
}> = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "paternal_uncle", label: "Paternal uncle" },
  { value: "maternal_uncle", label: "Maternal uncle" },
  { value: "paternal_aunt", label: "Paternal aunt" },
  { value: "maternal_aunt", label: "Maternal aunt" },
  { value: "paternal_grandparent", label: "Paternal grandparent" },
  { value: "maternal_grandparent", label: "Maternal grandparent" },
  { value: "older_sibling", label: "Older sibling" },
  { value: "extended_family", label: "Extended family" },
  { value: "community_member", label: "Community member" },
  { value: "orphanage_only", label: "Orphanage only" },
  { value: "other", label: "Other" },
];
