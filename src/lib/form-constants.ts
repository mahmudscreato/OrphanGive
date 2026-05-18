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
// Session 48b — consolidation completed. The 6 enums that Session 48a
// flagged for follow-up (SUPPORT_TYPES, BLOOD_GROUPS, VACCINATION_STATUSES,
// DISABILITY_STATUSES, GENDERS, HOUSEHOLD_INCOME_SOURCES) now live
// here too. Server-side Zod schemas in /api/di/proposals/route.ts
// import from this module; the form's inline OPTIONS arrays are
// re-exported from here so future label tweaks land in one place.

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

// ─── 7. Support types (Session 48b — moved from inline) ─────────────
//
// Coarse buckets for what kind of help is being requested. Stored on
// `child.support_type` and `child_proposal.support_type`. Tier 1
// public-visible.

export const SUPPORT_TYPES = [
  "education",
  "food",
  "healthcare",
  "clothing",
  "general_care",
  "other",
] as const;

export type SupportType = (typeof SUPPORT_TYPES)[number];

export const SUPPORT_TYPE_OPTIONS: ReadonlyArray<{
  value: SupportType;
  label: string;
}> = [
  { value: "education", label: "Education" },
  { value: "food", label: "Food" },
  { value: "healthcare", label: "Healthcare" },
  { value: "clothing", label: "Clothing" },
  { value: "general_care", label: "General care" },
  { value: "other", label: "Other" },
];

// ─── 8. Genders (Session 48b — moved from inline) ───────────────────

export const GENDERS = ["male", "female"] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_OPTIONS: ReadonlyArray<{
  value: Gender;
  label: string;
}> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

// ─── 9. Blood groups (Session 48b — moved from inline) ──────────────
//
// Standard ABO + Rh notation. `unknown` covers unrecorded — the
// commonest entry in Bangladesh because routine blood typing isn't
// universal.

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "unknown",
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

// Blood-group "options" intentionally use the value as the label too
// (the canonical notation is already the friendliest display form).
export const BLOOD_GROUP_OPTIONS: ReadonlyArray<{
  value: BloodGroup;
  label: string;
}> = BLOOD_GROUPS.map((b) => ({ value: b, label: b }));

// ─── 10. Vaccination statuses (Session 48b — moved from inline) ─────

export const VACCINATION_STATUSES = [
  "up_to_date",
  "partial",
  "unknown",
  "not_started",
] as const;

export type VaccinationStatus = (typeof VACCINATION_STATUSES)[number];

export const VACCINATION_STATUS_OPTIONS: ReadonlyArray<{
  value: VaccinationStatus;
  label: string;
}> = [
  { value: "up_to_date", label: "Up to date" },
  { value: "partial", label: "Partial" },
  { value: "unknown", label: "Unknown" },
  { value: "not_started", label: "Not started" },
];

// ─── 11. Disability statuses (Session 48b — moved from inline) ──────
//
// Self-reported categorisation. Selecting anything other than `none`
// surfaces the conditional `disability_notes` textarea on the form.

export const DISABILITY_STATUSES = [
  "none",
  "physical",
  "visual",
  "hearing",
  "cognitive",
  "multiple",
  "other",
] as const;

export type DisabilityStatus = (typeof DISABILITY_STATUSES)[number];

export const DISABILITY_STATUS_OPTIONS: ReadonlyArray<{
  value: DisabilityStatus;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "physical", label: "Physical" },
  { value: "visual", label: "Visual" },
  { value: "hearing", label: "Hearing" },
  { value: "cognitive", label: "Cognitive" },
  { value: "multiple", label: "Multiple" },
  { value: "other", label: "Other" },
];

// ─── 12. Household income sources (Session 48b — moved from inline) ─

export const HOUSEHOLD_INCOME_SOURCES = [
  "none",
  "day_labor",
  "agriculture",
  "small_business",
  "remittance",
  "mixed",
  "unknown",
] as const;

export type HouseholdIncomeSource = (typeof HOUSEHOLD_INCOME_SOURCES)[number];

export const HOUSEHOLD_INCOME_SOURCE_OPTIONS: ReadonlyArray<{
  value: HouseholdIncomeSource;
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "day_labor", label: "Day labor" },
  { value: "agriculture", label: "Agriculture" },
  { value: "small_business", label: "Small business" },
  { value: "remittance", label: "Remittance" },
  { value: "mixed", label: "Mixed" },
  { value: "unknown", label: "Unknown" },
];

// ─── 13. Document types (Session 49 + 52d) ──────────────────────────
//
// Tier 3 admin-only documents. Stored on
// `child_document.document_type`. Status enum below tracks the
// approve/reject lifecycle.
//
// Session 52d — split parent_death_certificate into
// father_death_certificate + mother_death_certificate to match
// real-world Bangladesh document collection (they're physically
// distinct documents). The legacy `parent_death_certificate` value
// stays in the enum as the "unknown / both" catch-all for the
// `parent_loss='unknown'` form path AND for backward compatibility
// with any pre-52d rows already in the database. Per-row visibility
// in DocumentsSection is driven conditionally by the form's
// current `parent_loss` value (see DOCUMENTS_FOR_PARENT_LOSS below).
//
// Status enum mirrors child_intake_photo + (Session 49 brief shape):
// pending / approved / rejected / archived. Note this differs from
// the legacy `child_document.status` enum (`pending_review`,
// `verified`, etc.) — see migrations/session-49/001-documents.sql
// for the full reconciliation story.

export const DOCUMENT_TYPES = [
  // Session 52d — split certs come first because they're the common
  // case after parent_loss is set.
  "father_death_certificate",
  "mother_death_certificate",
  // Legacy combined / unknown-parent catch-all. Used only when
  // parent_loss === 'unknown'.
  "parent_death_certificate",
  "child_birth_certificate",
  "guardian_nid",
  "school_recommendation",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  father_death_certificate: "Father's death certificate",
  mother_death_certificate: "Mother's death certificate",
  parent_death_certificate: "Death certificate (unknown parent)",
  child_birth_certificate: "Child birth certificate",
  guardian_nid: "Guardian National ID",
  school_recommendation: "School recommendation letter",
};

export const DOCUMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: DocumentType;
  label: string;
}> = DOCUMENT_TYPES.map((value) => ({
  value,
  label: DOCUMENT_TYPE_LABELS[value],
}));

// Session 52d — which document types the DI form should show as
// rows based on the current `parent_loss` value. The non-parent-
// related types (`child_birth_certificate`, `guardian_nid`,
// `school_recommendation`) appear in every case. Used by
// DocumentsSection to conditionally render the correct slots and
// by the form's "Submitting without N documents" soft warning to
// adapt which types count as expected.
export type ParentLossValue = "father" | "mother" | "both" | "unknown" | "";
export function documentTypesForParentLoss(
  parentLoss: string | null | undefined,
): DocumentType[] {
  // Three always-required types regardless of parent_loss.
  const always: DocumentType[] = [
    "child_birth_certificate",
    "guardian_nid",
    "school_recommendation",
  ];
  // Death-cert slot(s) vary.
  let deathCerts: DocumentType[];
  switch (parentLoss) {
    case "father":
      deathCerts = ["father_death_certificate"];
      break;
    case "mother":
      deathCerts = ["mother_death_certificate"];
      break;
    case "both":
      deathCerts = ["father_death_certificate", "mother_death_certificate"];
      break;
    case "unknown":
      deathCerts = ["parent_death_certificate"];
      break;
    default:
      // Before parent_loss is set, show no death-cert slot (form
      // forces parent_loss to be set before submit anyway). The DI
      // can still upload the other three types in the meantime.
      deathCerts = [];
  }
  return [...deathCerts, ...always];
}

export const DOCUMENT_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "archived",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// ─── Label-lookup helpers (Session 50) ──────────────────────────────
//
// Single source of truth for "enum value → human label" across the
// codebase. Donor-side components (EducationSection, ProfileHero,
// future Tier 1/2 sections) and DI-side dropdowns now share these
// helpers instead of maintaining duplicate label maps.
//
// Defensive shape: every helper accepts `null | undefined` and
// returns `""` for falsy input. For an unknown enum value (data
// drift; e.g. an admin-edited row with a value that's no longer in
// our list) the helper returns the raw value verbatim — better than
// blanking out a real piece of data, even if the styling looks
// slug-y for that one row.

function lookup<T extends string>(
  table: Record<T, string>,
  value: T | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const v = value as T;
  return table[v] ?? String(value);
}

// Build a value→label map from an OPTIONS array. Cheap; computed
// once at module load. Used internally by the label functions.
function tableFromOptions<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
): Record<T, string> {
  const out = {} as Record<T, string>;
  for (const o of options) out[o.value] = o.label;
  return out;
}

const EDUCATION_LEVEL_LABELS = tableFromOptions(EDUCATION_LEVEL_OPTIONS);
const AREA_OF_INTEREST_LABELS = tableFromOptions(AREA_OF_INTEREST_OPTIONS);
const PRIORITY_SUPPORT_LABELS = tableFromOptions(PRIORITY_SUPPORT_OPTIONS);
const PARENT_LOSS_LABELS = tableFromOptions(PARENT_LOSS_OPTIONS);
const GUARDIAN_EMPLOYMENT_TYPE_LABELS = tableFromOptions(
  GUARDIAN_EMPLOYMENT_TYPE_OPTIONS,
);
const GUARDIAN_RELATIONSHIP_LABELS = tableFromOptions(
  GUARDIAN_RELATIONSHIP_OPTIONS,
);
const SUPPORT_TYPE_LABELS = tableFromOptions(SUPPORT_TYPE_OPTIONS);
const GENDER_LABELS = tableFromOptions(GENDER_OPTIONS);
const BLOOD_GROUP_LABELS = tableFromOptions(BLOOD_GROUP_OPTIONS);
const VACCINATION_STATUS_LABELS = tableFromOptions(VACCINATION_STATUS_OPTIONS);
const DISABILITY_STATUS_LABELS = tableFromOptions(DISABILITY_STATUS_OPTIONS);
const HOUSEHOLD_INCOME_SOURCE_LABELS = tableFromOptions(
  HOUSEHOLD_INCOME_SOURCE_OPTIONS,
);

export function getEducationLevelLabel(
  value: EducationLevel | string | null | undefined,
): string {
  return lookup(EDUCATION_LEVEL_LABELS, value);
}

// Session 52b — short labels for donor-facing copy that pairs the
// level with class_grade. The full EDUCATION_LEVEL_LABELS reads as
// "Junior secondary (Class 6–8)" which is informative on a dropdown
// but redundant when class_grade is rendered alongside ("Class 7,
// Junior secondary (Class 6-8)"). Short labels drop the class-range
// parenthesis so the donor sees "Junior secondary, class 7".
export const EDUCATION_LEVEL_SHORT_LABELS: Record<EducationLevel, string> = {
  not_enrolled: "Not enrolled",
  primary_1_5: "Primary",
  junior_secondary_6_8: "Junior secondary",
  secondary_9_10: "Secondary",
  higher_secondary_11_12: "Higher secondary",
  madrasa_ibtidayee: "Madrasa (Ibtidayee)",
  madrasa_dakhil: "Madrasa (Dakhil)",
  madrasa_alim: "Madrasa (Alim)",
  vocational: "Vocational",
  other: "Other",
};

export function getEducationLevelShortLabel(
  value: EducationLevel | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const v = value as EducationLevel;
  return EDUCATION_LEVEL_SHORT_LABELS[v] ?? String(value);
}

/**
 * Session 52b — donor-facing "schooling line" composer.
 * Combines `education_level` (short label) with `class_grade` into
 * one readable phrase.
 *
 *   "Junior secondary, class 7"       (both present)
 *   "Class 7"                          (level missing, grade present)
 *   "Junior secondary"                (level present, grade missing)
 *   ""                                 (both missing)
 *
 * Used by EducationSection + ProfileHero so the two surfaces stay
 * consistent. Caller decides whether/how to surface an empty
 * string (typically omit the line entirely).
 */
export function composeSchoolingLine(
  educationLevel: string | null | undefined,
  classGrade: string | null | undefined,
): string {
  const levelLabel = getEducationLevelShortLabel(educationLevel);
  const grade = classGrade?.trim() || "";
  if (levelLabel && grade) return `${levelLabel}, class ${grade}`;
  if (grade) return `Class ${grade}`;
  if (levelLabel) return levelLabel;
  return "";
}

export function getAreaOfInterestLabel(
  value: AreaOfInterest | string | null | undefined,
): string {
  return lookup(AREA_OF_INTEREST_LABELS, value);
}

/** Map an array of area-of-interest slugs to display labels. Empty
 * input returns []; preserves order. */
export function getAreasOfInterestLabels(
  values: ReadonlyArray<AreaOfInterest | string> | null | undefined,
): string[] {
  if (!values || values.length === 0) return [];
  return values.map((v) => getAreaOfInterestLabel(v));
}

export function getPrioritySupportLabel(
  value: PrioritySupport | string | null | undefined,
): string {
  return lookup(PRIORITY_SUPPORT_LABELS, value);
}

export function getParentLossLabel(
  value: ParentLoss | string | null | undefined,
): string {
  return lookup(PARENT_LOSS_LABELS, value);
}

export function getGuardianEmploymentTypeLabel(
  value: GuardianEmploymentType | string | null | undefined,
): string {
  return lookup(GUARDIAN_EMPLOYMENT_TYPE_LABELS, value);
}

export function getGuardianRelationshipLabel(
  value: GuardianRelationship | string | null | undefined,
): string {
  return lookup(GUARDIAN_RELATIONSHIP_LABELS, value);
}

export function getSupportTypeLabel(
  value: SupportType | string | null | undefined,
): string {
  return lookup(SUPPORT_TYPE_LABELS, value);
}

// Session 57.1 — donor-facing color coding for support_type pills.
// The reference design palette suggested terracotta/red/green/amber
// tones distinct per need; we map those intents to the existing OG
// palette so no rogue hex codes get introduced. Each entry is a
// pair of Tailwind classes (bg + text) chosen to clear AA on the
// warmth-50 page canvas.
//
// Education     → tangerine-soft / tangerine-deeper  (warm orange)
// Food          → moss-soft     / moss-deep          (olive green)
// Healthcare    → tangerine-mist / tangerine-deep    (soft peach)
// Clothing      → warmth-100   / warmth-text         (warm beige)
// General care  → sky/30        / sky-deep           (soft blue)
// Other (+null) → warmth-100   / warmth-text         (neutral warm)
export const NEED_COLOR_MAP: Record<
  string,
  { bg: string; text: string; ring: string }
> = {
  education: {
    bg: "bg-tangerine-soft/60",
    text: "text-tangerine-deeper",
    ring: "ring-tangerine-deeper/20",
  },
  food: {
    bg: "bg-moss-soft/70",
    text: "text-moss-deep",
    ring: "ring-moss-deep/20",
  },
  healthcare: {
    bg: "bg-tangerine-mist",
    text: "text-tangerine-deep",
    ring: "ring-tangerine-deep/20",
  },
  clothing: {
    bg: "bg-warmth-100",
    text: "text-warmth-text",
    ring: "ring-warmth-accent/25",
  },
  general_care: {
    bg: "bg-sky/30",
    text: "text-sky-deep",
    ring: "ring-sky-deep/20",
  },
  other: {
    bg: "bg-warmth-100",
    text: "text-warmth-text",
    ring: "ring-warmth-accent/25",
  },
};

/**
 * Resolve a support_type slug to its donor-facing color pair.
 * Unknown / null values fall through to the neutral "other"
 * warm-beige variant so the pill always renders.
 */
export function getNeedColor(value: string | null | undefined): {
  bg: string;
  text: string;
  ring: string;
} {
  if (!value) return NEED_COLOR_MAP.other!;
  return NEED_COLOR_MAP[value] ?? NEED_COLOR_MAP.other!;
}

export function getGenderLabel(
  value: Gender | string | null | undefined,
): string {
  return lookup(GENDER_LABELS, value);
}

export function getBloodGroupLabel(
  value: BloodGroup | string | null | undefined,
): string {
  return lookup(BLOOD_GROUP_LABELS, value);
}

export function getVaccinationStatusLabel(
  value: VaccinationStatus | string | null | undefined,
): string {
  return lookup(VACCINATION_STATUS_LABELS, value);
}

export function getDisabilityStatusLabel(
  value: DisabilityStatus | string | null | undefined,
): string {
  return lookup(DISABILITY_STATUS_LABELS, value);
}

export function getHouseholdIncomeSourceLabel(
  value: HouseholdIncomeSource | string | null | undefined,
): string {
  return lookup(HOUSEHOLD_INCOME_SOURCE_LABELS, value);
}

// Documents already export DOCUMENT_TYPE_LABELS as a plain object;
// add a value-defensive helper for symmetry with the other enums.
export function getDocumentTypeLabel(
  value: DocumentType | string | null | undefined,
): string {
  return lookup(DOCUMENT_TYPE_LABELS, value);
}
