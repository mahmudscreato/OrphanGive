// Session 51 — proposal diff display helpers.
//
// Maps each editable child column to:
//   - a friendly label
//   - its Tier classification (1 / 2 / 3) — drives the per-row pill
//     and the phone redaction
//   - a value formatter (slugs → labels, arrays → comma-joined,
//     booleans → Yes/No, null → "—")
//
// Tier classifications match the Session 49 audit doc exactly. If
// the audit doc reclassifies a field, this file is the second place
// to update.

import {
  getAreasOfInterestLabels,
  getBloodGroupLabel,
  getDisabilityStatusLabel,
  getEducationLevelLabel,
  getGenderLabel,
  getGuardianEmploymentTypeLabel,
  getGuardianRelationshipLabel,
  getHouseholdIncomeSourceLabel,
  getParentLossLabel,
  getPrioritySupportLabel,
  getSupportTypeLabel,
  getVaccinationStatusLabel,
} from "./form-constants";

export type FieldTier = 1 | 2 | 3;

export interface FieldMeta {
  field: string;
  label: string;
  tier: FieldTier;
  /** Format a raw value for display. Receives null/undefined for
   * cleared fields and returns "—" so the diff renders cleanly. */
  format: (value: unknown) => string;
  /** When true, the new-value side is rendered as the literal
   * string "Updated" instead of the actual value. Reserved for
   * Tier 3 PII columns (guardian phones) — admin can see the value
   * elsewhere if they need to verify it; on the diff screen we
   * redact it so a screen-share / over-shoulder glance doesn't leak. */
  redactNewValue?: boolean;
}

// ─── Value formatters ──────────────────────────────────────────────

const DASH = "—";

function fmtPlain(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length > 0 ? s : DASH;
}

function fmtBool(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  // Handle the common JSON-truthy strings just in case.
  if (v === "true" || v === 1) return "Yes";
  if (v === "false" || v === 0) return "No";
  return fmtPlain(v);
}

function fmtNumber(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Intl.NumberFormat("en-US").format(v);
  }
  return fmtPlain(v);
}

function fmtMoneyBdt(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v === "number" && Number.isFinite(v)) {
    return `BDT ${new Intl.NumberFormat("en-US").format(v)}`;
  }
  return fmtPlain(v);
}

function fmtDate(v: unknown): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v !== "string") return fmtPlain(v);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function fmtArrayInterests(v: unknown): string {
  if (!v) return DASH;
  if (!Array.isArray(v)) {
    // Postgres text[] sometimes round-trips as the literal string
    // "{a,b,c}" via Directus REST. Best-effort parse.
    const s = String(v).trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      const parts = s.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean);
      return getAreasOfInterestLabels(parts).join(", ") || DASH;
    }
    return fmtPlain(v);
  }
  const labels = getAreasOfInterestLabels(v as string[]);
  return labels.length > 0 ? labels.join(", ") : DASH;
}

function fmtPhoto(v: unknown): string {
  if (!v || typeof v !== "string") return DASH;
  // The diff UI doesn't try to render the image (admin can open the
  // proposal page if they want a preview); we just mark the change.
  return "(new photo uploaded)";
}

// Wrap a single-arg label helper into a defensive formatter. The
// label helpers accept their narrow enum type OR a generic string;
// proposal values come in as `unknown` so we coerce to string before
// delegating.
function fmtEnum(
  labelFn: (v: string | null | undefined) => string,
): (v: unknown) => string {
  return (v) => {
    if (v === null || v === undefined) return DASH;
    const out = labelFn(String(v));
    return out && out.length > 0 ? out : DASH;
  };
}

// ─── Field metadata ────────────────────────────────────────────────

const FIELD_META: Record<string, FieldMeta> = {
  // Identity
  display_name: { field: "display_name", label: "Display name", tier: 1, format: fmtPlain },
  first_name: { field: "first_name", label: "First name", tier: 3, format: fmtPlain },
  gender: { field: "gender", label: "Gender", tier: 1, format: fmtEnum(getGenderLabel) },
  date_of_birth: {
    field: "date_of_birth",
    label: "Date of birth",
    tier: 2,
    format: fmtDate,
  },
  photo_consent: {
    field: "photo_consent",
    label: "Photo consent",
    tier: 1,
    format: fmtBool,
  },
  Photo: { field: "Photo", label: "Photo", tier: 1, format: fmtPhoto },

  // Location
  bd_division: { field: "bd_division", label: "Division", tier: 1, format: fmtPlain },
  bd_district: { field: "bd_district", label: "District", tier: 1, format: fmtPlain },
  district_internal: {
    field: "district_internal",
    label: "District (internal)",
    tier: 3,
    format: fmtPlain,
  },
  permanent_address: {
    field: "permanent_address",
    label: "Permanent address",
    tier: 3,
    format: fmtPlain,
  },

  // Education
  education_level: {
    field: "education_level",
    label: "Education level",
    tier: 1,
    format: fmtEnum(getEducationLevelLabel),
  },
  class_grade: { field: "class_grade", label: "Class / grade", tier: 1, format: fmtPlain },
  educational_organization: {
    field: "educational_organization",
    label: "School (linked)",
    tier: 2,
    format: (v) => {
      if (!v) return DASH;
      // M2O column: stored as either the school UUID directly OR as
      // an expanded { id, name } object. Support both shapes.
      if (typeof v === "string") return v; // UUID — admin clicks through to detail for the name
      if (typeof v === "object") {
        const o = v as { name?: string | null; id?: string };
        return o.name?.trim() || o.id || DASH;
      }
      return fmtPlain(v);
    },
  },
  school_name_raw: {
    field: "school_name_raw",
    label: "School (free-text fallback)",
    tier: 2,
    format: fmtPlain,
  },
  areas_of_interest: {
    field: "areas_of_interest",
    label: "Interests",
    tier: 1,
    format: fmtArrayInterests,
  },

  // Story / support
  story: { field: "story", label: "Story (donor-facing)", tier: 1, format: fmtPlain },
  support_type: {
    field: "support_type",
    label: "Support type",
    tier: 1,
    format: fmtEnum(getSupportTypeLabel),
  },
  monthly_cost: {
    field: "monthly_cost",
    label: "Monthly cost",
    tier: 1,
    format: fmtMoneyBdt,
  },
  priority_support: {
    field: "priority_support",
    label: "Priority",
    tier: 1,
    format: fmtEnum(getPrioritySupportLabel),
  },
  priority_notes: {
    field: "priority_notes",
    label: "Priority notes",
    tier: 3,
    format: fmtPlain,
  },

  // Health
  blood_group: {
    field: "blood_group",
    label: "Blood group",
    tier: 2,
    format: fmtEnum(getBloodGroupLabel),
  },
  vaccination_status: {
    field: "vaccination_status",
    label: "Vaccinations",
    tier: 2,
    format: fmtEnum(getVaccinationStatusLabel),
  },
  last_medical_checkup: {
    field: "last_medical_checkup",
    label: "Last medical checkup",
    tier: 3,
    format: fmtDate,
  },
  disability_status: {
    field: "disability_status",
    label: "Disability status",
    tier: 2,
    format: fmtEnum(getDisabilityStatusLabel),
  },
  disability_notes: {
    field: "disability_notes",
    label: "Disability notes",
    tier: 2,
    format: fmtPlain,
  },

  // Family
  parent_loss: {
    field: "parent_loss",
    label: "Parent loss",
    tier: 2,
    format: fmtEnum(getParentLossLabel),
  },
  siblings_count: {
    field: "siblings_count",
    label: "Siblings (count)",
    tier: 2,
    format: fmtNumber,
  },
  sibling_position: {
    field: "sibling_position",
    label: "Sibling position",
    tier: 2,
    format: fmtNumber,
  },
  siblings_notes: {
    field: "siblings_notes",
    label: "Siblings notes",
    tier: 2,
    format: fmtPlain,
  },
  household_size: {
    field: "household_size",
    label: "Household size",
    tier: 2,
    format: fmtNumber,
  },

  // Socioeconomic
  household_income_source: {
    field: "household_income_source",
    label: "Household income source",
    tier: 2,
    format: fmtEnum(getHouseholdIncomeSourceLabel),
  },
  monthly_household_income_bdt: {
    field: "monthly_household_income_bdt",
    label: "Monthly household income",
    tier: 3,
    format: fmtMoneyBdt,
  },

  // Guardian
  guardian_relationship: {
    field: "guardian_relationship",
    label: "Guardian relationship",
    tier: 2,
    format: fmtEnum(getGuardianRelationshipLabel),
  },
  guardian_employment_type: {
    field: "guardian_employment_type",
    label: "Guardian employment type",
    tier: 3,
    format: fmtEnum(getGuardianEmploymentTypeLabel),
  },
  guardian_employment: {
    field: "guardian_employment",
    label: "Guardian employment (free-text)",
    tier: 3,
    format: fmtPlain,
  },
  // PHONE REDACTION (Session 51 brief): the new-value side is rendered
  // as the literal string "Updated" instead of the actual phone number.
  // Why: admin can see the value elsewhere (the live child row, or
  // the Directus admin UI) if they need to verify it. On the diff
  // screen we redact so a screen-share / over-shoulder glance doesn't
  // leak the number. The OLD value is also redacted by the formatter
  // for consistency — it would otherwise reveal the previous number
  // to anyone who could see the diff page.
  guardian_phone: {
    field: "guardian_phone",
    label: "Guardian phone",
    tier: 3,
    format: () => "Updated",
    redactNewValue: true,
  },
  guardian_phone_alt: {
    field: "guardian_phone_alt",
    label: "Guardian phone (secondary)",
    tier: 3,
    format: () => "Updated",
    redactNewValue: true,
  },
  guardian_summary_internal: {
    field: "guardian_summary_internal",
    label: "Guardian context (internal)",
    tier: 3,
    format: fmtPlain,
  },
  additional_family_notes: {
    field: "additional_family_notes",
    label: "Additional family notes",
    tier: 3,
    format: fmtPlain,
  },

  // Submission
  last_visit_date: {
    field: "last_visit_date",
    label: "Last visit date",
    tier: 3,
    format: fmtDate,
  },
  submission_date: {
    field: "submission_date",
    label: "Submission date",
    tier: 3,
    format: fmtDate,
  },
};

/**
 * Lookup the metadata for a field. Returns a Tier-1 plain-format
 * fallback for unknown columns (so a future schema add doesn't
 * break the diff page — it just renders unstyled). Logs a warn so
 * we notice unknowns in dev.
 */
export function getFieldMeta(field: string): FieldMeta {
  const meta = FIELD_META[field];
  if (meta) return meta;
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[proposal-diff-display] no metadata for field "${field}"`);
  }
  return {
    field,
    label: field,
    tier: 1,
    format: fmtPlain,
  };
}
