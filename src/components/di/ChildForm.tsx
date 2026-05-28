// Session 44 — original 11-field shared form.
// Session 46-fix-2 — refactored to 10 sections covering the full
// 28-field DI surface. Mode='edit' pre-fills from `existing`;
// mode='create' starts blank with bd_division dropdown restricted
// to assignedDivisions.
//
// On success: redirects to /di/submissions?just_submitted=<id>.
//
// Sections:
//   1. Identity        display_name, gender, date_of_birth, photo, photo_consent
//   2. Location        bd_division, bd_district (cascade), district_internal
//   3. Education       education_level, class_grade, areas_of_interest
//   4. Story           story (donor-facing)
//   5. Support plan    support_type, monthly_cost
//   6. Health          blood_group, vaccination_status, last_medical_checkup,
//                      disability_status, disability_notes (conditional)
//   7. Family          siblings_count, sibling_position, siblings_notes,
//                      household_size
//   8. Socioeconomic   household_income_source, monthly_household_income_bdt
//   9. Guardian        guardian_relationship, guardian_employment,
//                      guardian_summary_internal, additional_family_notes
//   10. Field visit    last_visit_date

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Loader2, Save } from "lucide-react";
import { PhotoUploadField } from "./PhotoUploadField";
import { BdDistrictField } from "./BdDistrictField";
import { SchoolPicker } from "./SchoolPicker";
import { IntakePhotoGrid } from "./IntakePhotoGrid";
import { DocumentsSection } from "./DocumentsSection";
import type { BdDistrictOption } from "@/lib/di-children";
import type { IntakePhotoSummary } from "@/lib/di-intake-photos";
import type { DocumentSummary } from "@/lib/di-documents";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/form-constants";
// Session 48a — single source of truth for the new + extended enums.
import {
  AREA_OF_INTEREST_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  GUARDIAN_EMPLOYMENT_TYPE_OPTIONS,
  GUARDIAN_RELATIONSHIP_OPTIONS,
  PARENT_LOSS_OPTIONS,
  PRIORITY_SUPPORT_OPTIONS,
} from "@/lib/form-constants";

// ─── Static option lists (mirror server zod schemas) ────────────────

const SUPPORT_TYPE_OPTIONS = [
  { value: "education", label: "Education" },
  { value: "food", label: "Food" },
  { value: "healthcare", label: "Healthcare" },
  { value: "clothing", label: "Clothing" },
  { value: "general_care", label: "General care" },
  { value: "other", label: "Other" },
] as const;

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
] as const;

const BLOOD_GROUP_OPTIONS = [
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

const VACCINATION_OPTIONS = [
  { value: "up_to_date", label: "Up to date" },
  { value: "partial", label: "Partial" },
  { value: "unknown", label: "Unknown" },
  { value: "not_started", label: "Not started" },
] as const;

const DISABILITY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "physical", label: "Physical" },
  { value: "visual", label: "Visual" },
  { value: "hearing", label: "Hearing" },
  { value: "cognitive", label: "Cognitive" },
  { value: "multiple", label: "Multiple" },
  { value: "other", label: "Other" },
] as const;

const HOUSEHOLD_INCOME_OPTIONS = [
  { value: "none", label: "None" },
  { value: "day_labor", label: "Day labor" },
  { value: "agriculture", label: "Agriculture" },
  { value: "small_business", label: "Small business" },
  { value: "remittance", label: "Remittance" },
  { value: "mixed", label: "Mixed" },
  { value: "unknown", label: "Unknown" },
] as const;

// Session 48a — local GUARDIAN_RELATIONSHIP_OPTIONS removed; the
// shared one from form-constants.ts (now extended with father +
// mother as the first two entries) is imported above.

// ─── Shared style tokens ────────────────────────────────────────────

// Session 63 — aria-invalid variants on the base classes give us
// red-border error styling on any input that gets aria-invalid="true"
// without per-field className branching. The form sets the attribute
// via the errProps() helper below; Tailwind v4 supports the
// aria-invalid: variant natively.
const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60 aria-invalid:border-rose-500 aria-invalid:focus:border-rose-500 aria-invalid:focus:ring-rose-100";
const textareaClass = `${inputClass} min-h-[120px] resize-y leading-relaxed`;
const selectClass = inputClass;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

// Session 63 — human-readable labels for the error summary panel.
// Keys mirror the error map keys (which mirror the server's `field`
// names). Anything missing falls back to the raw key.
const FIELD_LABELS: Record<string, string> = {
  // P1.3 — first_name is the public name (cards / profile / OG).
  // display_name is the internal record name.
  first_name: "First name (public)",
  display_name: "Display name (internal)",
  gender: "Gender",
  date_of_birth: "Date of birth",
  photo_consent: "Photo consent",
  Photo: "Photo",
  photoUuid: "Photo",
  bd_division: "Division",
  bd_district: "District",
  district_internal: "Address (internal note)",
  permanent_address: "Permanent address",
  education_level: "Education level",
  class_grade: "Class / grade",
  educational_organization: "School",
  school_name_raw: "School name",
  areas_of_interest: "Areas of interest",
  story: "Story",
  support_type: "Support type",
  monthly_cost: "Monthly cost (BDT)",
  priority_support: "Priority",
  priority_notes: "Priority notes",
  blood_group: "Blood group",
  vaccination_status: "Vaccination status",
  last_medical_checkup: "Last medical check-up",
  disability_status: "Disability status",
  disability_notes: "Disability notes",
  parent_loss: "Parent loss",
  siblings_count: "Siblings count",
  sibling_position: "Sibling position",
  siblings_notes: "Siblings notes",
  household_size: "Household size",
  household_income_source: "Household income source",
  monthly_household_income_bdt: "Monthly household income (BDT)",
  guardian_relationship: "Guardian relationship",
  guardian_employment_type: "Guardian employment type",
  guardian_employment: "Guardian employment",
  guardian_phone: "Guardian phone",
  guardian_phone_alt: "Guardian phone (alt)",
  guardian_summary_internal: "Guardian summary (internal)",
  additional_family_notes: "Additional family notes",
  last_visit_date: "Last visit date",
  submission_date: "Submission date",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// Session 63 — authoritative display order. Drives the summary panel
// (so errors list in the same order as the form sections) and the
// scrollToFirstError pick. Must stay aligned with the JSX section
// order below; entries not in this list still render but fall to the
// bottom of the summary in undefined order.
const FIELD_ORDER: ReadonlyArray<string> = [
  // Identity
  // P1.3 — first_name first so the error-summary panel lists the
  // public name above the internal display_name.
  "first_name",
  "display_name",
  "gender",
  "date_of_birth",
  "Photo",
  "photo_consent",
  // Location
  "bd_division",
  "bd_district",
  "district_internal",
  "permanent_address",
  // Education + interests
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  // Story
  "story",
  // Support
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  // Health
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  // Family
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  // Socioeconomic
  "household_income_source",
  "monthly_household_income_bdt",
  // Guardian
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  // Visit
  "last_visit_date",
  "submission_date",
];

// Session 63 — server returns `field: "photoUuid"` for the missing-photo
// case; the form keys this error under `Photo` (the input's id and the
// IntakePhotoGrid's external-error prop name). Add other rename
// mappings here if the server's vocab drifts from the form's later.
const SERVER_TO_FORM_FIELD: Record<string, string> = {
  photoUuid: "Photo",
};

function remapServerField(field: string): string {
  return SERVER_TO_FORM_FIELD[field] ?? field;
}

// Session 63 — companion to SERVER_TO_FORM_FIELD: when the user edits
// a form-state field, also wipe any error keyed under its alias. The
// set() function consults this so editing `photo_uuid` clears the
// `Photo` error.
const FORM_KEY_TO_ERROR_KEY: Record<string, string> = {
  photo_uuid: "Photo",
};

// ─── Public types ───────────────────────────────────────────────────

export interface ChildFormDivisionOption {
  code: string;
  name: string;
}

// Mirrors ChildEditSnapshot from di-children.ts but kept here as the
// component's contract so the form module is self-describing.
//
// Session 48a — added 13 new fields plus the `educational_organization`
// linked-school M2O. `areas_of_interest` is now string[] (text[] at
// the DB layer); the form binds to a Set<string> internally.
export interface ChildFormExistingChild {
  id: string;
  // P1.3 — first_name is the new public-facing name; existing rows
  // may have it null until the DI edits the profile.
  first_name: string | null;
  display_name: string;
  gender: string | null;
  date_of_birth: string | null;
  photo_consent: boolean | null;
  current_photo_uuid: string | null;
  bd_division_code: string | null;
  bd_district_code: string | null;
  district_internal: string | null;
  permanent_address: string | null;
  education_level: string | null;
  class_grade: string | null;
  educational_organization: string | null;
  school_name_raw: string | null;
  areas_of_interest: string[] | null;
  story: string;
  support_type: string | null;
  monthly_cost: number | null;
  priority_support: string | null;
  priority_notes: string | null;
  blood_group: string | null;
  vaccination_status: string | null;
  last_medical_checkup: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  parent_loss: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  household_income_source: string | null;
  monthly_household_income_bdt: number | null;
  guardian_relationship: string | null;
  guardian_employment_type: string | null;
  guardian_employment: string | null;
  guardian_phone: string | null;
  guardian_phone_alt: string | null;
  guardian_summary_internal: string | null;
  additional_family_notes: string | null;
  last_visit_date: string | null;
  submission_date: string | null;
}

export type ChildFormMode = "create" | "edit";

export interface ChildFormProps {
  mode: ChildFormMode;
  divisions: ChildFormDivisionOption[];
  districts: BdDistrictOption[];
  existing?: ChildFormExistingChild;
  // Session 48b — draft pre-fill. When draftId + existingDraft are
  // present, the form is in "resume draft" mode:
  //   - pre-fills from existingDraft (raw child_proposal row) on
  //     top of `existing` if present
  //   - amber banner at top
  //   - Save as draft → PATCH /api/di/proposals/[draftId]
  //   - Submit → POST /api/di/proposals/[draftId]/submit (which
  //     re-runs strict validation, then deletes the draft on success)
  //
  // When draftId is null (the common case), Save as draft → POST
  // /api/di/proposals mode=draft (which returns a new id we then
  // hold for subsequent saves) and Submit → POST mode=submit.
  draftId?: string | null;
  existingDraft?: Record<string, unknown> | null;
  // Session 48b — initial intake photo set, fetched server-side on
  // the edit page. The IntakePhotoGrid manages its own state after
  // hydration. In create mode this stays empty; the grid renders a
  // hint explaining intake photos open up after admin approval
  // (because child_intake_photo.child is NOT NULL — there's no
  // child UUID to attach to until then).
  intakePhotos?: IntakePhotoSummary[];
  // Session 49 — initial verification documents set. Same edit-only
  // hydration pattern: edit page fetches via listDocumentsForChild,
  // create mode passes [] and the section renders the "open up
  // after approval" hint card.
  documents?: DocumentSummary[];
}

// ─── Internal form state ────────────────────────────────────────────

interface FormState {
  // Identity
  // P1.3 — first_name (public) + display_name (internal).
  first_name: string;
  display_name: string;
  gender: string;
  date_of_birth: string;
  photo_uuid: string | null;
  photo_consent: boolean;
  // Current location (Session 48a — added permanent_address)
  bd_division: string;
  bd_district: string;
  district_internal: string;
  permanent_address: string;
  // Education (Session 48a — education_level is now an enum value;
  // educational_organization is a school UUID; school_name_raw is
  // the free-text fallback; areas_of_interest is a Set of slugs)
  education_level: string;
  class_grade: string;
  educational_organization: string;
  school_name_raw: string;
  areas_of_interest: Set<string>;
  // Story
  story: string;
  // Support needed (Session 48a — priority columns)
  support_type: string;
  monthly_cost: string; // text in form, parsed on submit
  priority_support: string;
  priority_notes: string;
  // Health
  blood_group: string;
  vaccination_status: string;
  last_medical_checkup: string;
  disability_status: string;
  disability_notes: string;
  // Family (Session 48a — added parent_loss)
  parent_loss: string;
  siblings_count: string;
  sibling_position: string;
  siblings_notes: string;
  household_size: string;
  // Socioeconomic
  household_income_source: string;
  monthly_household_income_bdt: string;
  // Guardian (Session 48a — added employment_type, phones)
  guardian_relationship: string;
  guardian_employment_type: string;
  guardian_employment: string;
  guardian_phone: string;
  guardian_phone_alt: string;
  guardian_summary_internal: string;
  additional_family_notes: string;
  // Submission date (was "Field visit"). Form binds to submission_date
  // exclusively; the server mirrors to last_visit_date for backward
  // compat.
  submission_date: string;
}

function blankState(): FormState {
  return {
    first_name: "",
    display_name: "",
    gender: "",
    date_of_birth: "",
    photo_uuid: null,
    photo_consent: false, // Always default FALSE on every load.
    bd_division: "",
    bd_district: "",
    district_internal: "",
    permanent_address: "",
    education_level: "",
    class_grade: "",
    educational_organization: "",
    school_name_raw: "",
    areas_of_interest: new Set<string>(),
    story: "",
    support_type: "",
    monthly_cost: "",
    priority_support: "none", // Default "none" so priority_notes stays hidden initially.
    priority_notes: "",
    blood_group: "",
    vaccination_status: "",
    last_medical_checkup: "",
    disability_status: "",
    disability_notes: "",
    parent_loss: "",
    siblings_count: "",
    sibling_position: "",
    siblings_notes: "",
    household_size: "",
    household_income_source: "",
    monthly_household_income_bdt: "",
    guardian_relationship: "",
    guardian_employment_type: "",
    guardian_employment: "",
    guardian_phone: "",
    guardian_phone_alt: "",
    guardian_summary_internal: "",
    additional_family_notes: "",
    submission_date: "",
  };
}

function stateFromExisting(c: ChildFormExistingChild): FormState {
  return {
    first_name: c.first_name ?? "",
    display_name: c.display_name ?? "",
    gender: c.gender ?? "",
    date_of_birth: c.date_of_birth ?? "",
    photo_uuid: c.current_photo_uuid,
    // Session 46-fix-2 design decision — photo_consent defaults FALSE
    // on every form load even in edit mode. DI must re-tick consent
    // each submission so the boolean represents an active, recent
    // affirmation rather than a stale carry-over from an earlier form.
    photo_consent: false,
    bd_division: c.bd_division_code ?? "",
    bd_district: c.bd_district_code ?? "",
    district_internal: c.district_internal ?? "",
    permanent_address: c.permanent_address ?? "",
    education_level: c.education_level ?? "",
    class_grade: c.class_grade ?? "",
    educational_organization: c.educational_organization ?? "",
    school_name_raw: c.school_name_raw ?? "",
    areas_of_interest: new Set<string>(
      Array.isArray(c.areas_of_interest) ? c.areas_of_interest : [],
    ),
    story: c.story ?? "",
    support_type: c.support_type ?? "",
    monthly_cost: c.monthly_cost === null ? "" : String(c.monthly_cost),
    priority_support: c.priority_support ?? "none",
    priority_notes: c.priority_notes ?? "",
    blood_group: c.blood_group ?? "",
    vaccination_status: c.vaccination_status ?? "",
    last_medical_checkup: c.last_medical_checkup ?? "",
    disability_status: c.disability_status ?? "",
    disability_notes: c.disability_notes ?? "",
    parent_loss: c.parent_loss ?? "",
    siblings_count:
      c.siblings_count === null ? "" : String(c.siblings_count),
    sibling_position:
      c.sibling_position === null ? "" : String(c.sibling_position),
    siblings_notes: c.siblings_notes ?? "",
    household_size:
      c.household_size === null ? "" : String(c.household_size),
    household_income_source: c.household_income_source ?? "",
    monthly_household_income_bdt:
      c.monthly_household_income_bdt === null
        ? ""
        : String(c.monthly_household_income_bdt),
    guardian_relationship: c.guardian_relationship ?? "",
    guardian_employment_type: c.guardian_employment_type ?? "",
    guardian_employment: c.guardian_employment ?? "",
    guardian_phone: c.guardian_phone ?? "",
    guardian_phone_alt: c.guardian_phone_alt ?? "",
    guardian_summary_internal: c.guardian_summary_internal ?? "",
    additional_family_notes: c.additional_family_notes ?? "",
    // Session 48a — pre-fill submission_date from the new column,
    // falling back to last_visit_date for children that pre-date the
    // submission_date column.
    submission_date: c.submission_date ?? c.last_visit_date ?? "",
  };
}

// Session 48a — small immutable Set toggle for the areas_of_interest
// checkbox grid. Returns a new Set so React re-renders on flip.
function toggleSetMember(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Session 48b — adapter from a raw child_proposal row (draft) to the
// ChildFormExistingChild shape stateFromExisting expects. The row
// uses different column names than the ChildEditSnapshot path:
//   - `Photo` (raw uuid) instead of `current_photo_uuid`
//   - `bd_division` / `bd_district` (slug strings) instead of the
//     `_code` suffixed keys
//   - everything else is column-name-equivalent
//
// `live` is the optional live child snapshot (edit mode); the draft
// values OVERLAY on top of live so a partial draft still pre-fills
// the unchanged fields with their current live values. For create
// mode `live` is undefined — only the draft's own values populate.
function draftRowToExistingShape(
  row: Record<string, unknown>,
  live?: ChildFormExistingChild,
): ChildFormExistingChild {
  // Helper that prefers the draft's value, falling back to live, then
  // null. String values are coerced to "" → null so the form's
  // text-input pre-fill doesn't show literal "null".
  const pick = <K extends keyof ChildFormExistingChild>(
    key: K,
    rowKey?: string,
  ): ChildFormExistingChild[K] => {
    const k = rowKey ?? (key as string);
    const v = row[k];
    if (v !== undefined && v !== null) return v as ChildFormExistingChild[K];
    if (live) return live[key];
    return null as never;
  };

  return {
    id: (row.id as string) ?? live?.id ?? "",
    first_name: pick("first_name"),
    display_name: pick("display_name"),
    gender: pick("gender"),
    date_of_birth: pick("date_of_birth"),
    photo_consent: pick("photo_consent"),
    current_photo_uuid: (row.Photo as string | null) ?? live?.current_photo_uuid ?? null,
    bd_division_code: pick("bd_division_code", "bd_division"),
    bd_district_code: pick("bd_district_code", "bd_district"),
    district_internal: pick("district_internal"),
    permanent_address: pick("permanent_address"),
    education_level: pick("education_level"),
    class_grade: pick("class_grade"),
    educational_organization: pick("educational_organization"),
    school_name_raw: pick("school_name_raw"),
    areas_of_interest: pick("areas_of_interest"),
    story: pick("story"),
    support_type: pick("support_type"),
    monthly_cost: pick("monthly_cost"),
    priority_support: pick("priority_support"),
    priority_notes: pick("priority_notes"),
    blood_group: pick("blood_group"),
    vaccination_status: pick("vaccination_status"),
    last_medical_checkup: pick("last_medical_checkup"),
    disability_status: pick("disability_status"),
    disability_notes: pick("disability_notes"),
    parent_loss: pick("parent_loss"),
    siblings_count: pick("siblings_count"),
    sibling_position: pick("sibling_position"),
    siblings_notes: pick("siblings_notes"),
    household_size: pick("household_size"),
    household_income_source: pick("household_income_source"),
    monthly_household_income_bdt: pick("monthly_household_income_bdt"),
    guardian_relationship: pick("guardian_relationship"),
    guardian_employment_type: pick("guardian_employment_type"),
    guardian_employment: pick("guardian_employment"),
    guardian_phone: pick("guardian_phone"),
    guardian_phone_alt: pick("guardian_phone_alt"),
    guardian_summary_internal: pick("guardian_summary_internal"),
    additional_family_notes: pick("additional_family_notes"),
    last_visit_date: pick("last_visit_date"),
    submission_date: pick("submission_date"),
  };
}

function calcAge(dob: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

// ─── Component ──────────────────────────────────────────────────────

export function ChildForm({
  mode,
  divisions,
  districts,
  existing,
  draftId: initialDraftId = null,
  existingDraft = null,
  intakePhotos = [],
  documents = [],
}: ChildFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Session 48b — initial state honours the precedence:
  //   1. existingDraft (if resuming a draft) overlaid on `existing`
  //      for edit-mode drafts, or standalone for create-mode drafts
  //   2. existing live child snapshot (vanilla edit mode)
  //   3. blank (vanilla create mode)
  const [form, setForm] = useState<FormState>(() => {
    if (existingDraft) {
      return stateFromExisting(
        draftRowToExistingShape(existingDraft, existing),
      );
    }
    return existing ? stateFromExisting(existing) : blankState();
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  // Session 48b — draftId becomes mutable component state. Starts
  // from the URL param (initialDraftId); on first "Save as draft"
  // from a fresh form it gets populated with the new id, so
  // subsequent saves PATCH the same draft instead of creating
  // duplicates.
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(
    existingDraft ? new Date() : null,
  );
  const [draftSavedTick, setDraftSavedTick] = useState(0);
  // Session 49 — current set of missing document types reported up
  // by DocumentsSection. Used to render the soft warning above the
  // submit button. Documents are optional for both draft + submit;
  // this is information, not a blocker.
  const [missingDocTypes, setMissingDocTypes] = useState<DocumentType[]>([]);
  // Session 52a — `effectiveChildId` is the id used for documents +
  // intake-photo attachments. Resolution order:
  //   1. EDIT mode: `existing.id` (always present).
  //   2. CREATE mode + resumed draft with a stub: draft's
  //      target_child (server pre-created the stub at draft-save
  //      time per Session 52a).
  //   3. CREATE mode + fresh form: null, until the user clicks
  //      Save as draft for the first time — that response populates
  //      this state via setEffectiveChildId.
  // When null, IntakePhotoGrid + DocumentsSection render their
  // "save a draft first" hint cards (defensive fallback).
  const [effectiveChildId, setEffectiveChildId] = useState<string | null>(
    () => {
      if (existing?.id) return existing.id;
      const draftTarget = (existingDraft as { target_child?: string | null } | null)
        ?.target_child;
      return typeof draftTarget === "string" && draftTarget.length > 0
        ? draftTarget
        : null;
    },
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
    // Session 63 — clear the matching error AND any alias keys when
    // the form field changes. Alias example: the photo error lives
    // under `Photo` (matches the PhotoUploadField's externalError
    // prop + the server's MissingRequiredFieldError("photoUuid")
    // remap), but the form state key is `photo_uuid`. Without the
    // alias clear, uploading a photo would leave the rose-50 summary
    // panel still listing "Photo — Required.".
    const formKey = key as string;
    const errorKey = FORM_KEY_TO_ERROR_KEY[formKey] ?? formKey;
    if (errors[formKey] || (errorKey !== formKey && errors[errorKey])) {
      setErrors((e) => {
        const next = { ...e };
        delete next[formKey];
        delete next[errorKey];
        return next;
      });
    }
  }

  // Session 63 — spread `{...errProps("display_name")}` into any
  // input/textarea/select to opt into the red aria-invalid border
  // styling. Omits the attribute entirely when there's no error so we
  // don't ever render the misleading aria-invalid="false" (which some
  // screen readers still announce).
  function errProps(fieldKey: string): { "aria-invalid"?: true } {
    return errors[fieldKey] ? { "aria-invalid": true } : {};
  }

  // Session 63 — auto-scroll to the first error after a failed submit.
  // The form is several screens tall — without this, the new summary
  // panel appears at the bottom but the user's looking at section 1,
  // so they have no idea why submit "did nothing". Scrolls the field
  // into the middle of the viewport and (when focusable) focuses it.
  function scrollToFirstError(errorMap: Record<string, string>): void {
    const keys = Object.keys(errorMap);
    if (keys.length === 0) return;
    // Match the summary panel's order: walk the form's authoritative
    // field list and pick the first one with an error. Keeps the
    // scroll target stable instead of dependent on JS object iteration
    // order.
    const firstKey =
      FIELD_ORDER.find((k) => errorMap[k]) ?? keys[0]!;
    // Defer to next tick so React has flushed the aria-invalid attrs
    // before we look up the node.
    setTimeout(() => {
      const el = document.getElementById(firstKey);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Best-effort focus — falls through silently if the element
      // isn't focusable (e.g. a wrapping div for a custom widget).
      if ("focus" in el && typeof (el as HTMLElement).focus === "function") {
        try {
          (el as HTMLElement).focus({ preventScroll: true });
        } catch {
          // ignore
        }
      }
    }, 0);
  }

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};

    if (mode === "create") {
      // Required-on-create per Mahmud's V1 decision (Session 48a
      // added parent_loss + guardian_phone to the required set).
      // P1.3 — first_name required so the new profile is never
      // published without a public-facing name.
      if (!form.first_name.trim()) e.first_name = "Required.";
      if (!form.display_name.trim()) e.display_name = "Required.";
      if (!form.date_of_birth) e.date_of_birth = "Required.";
      if (!form.bd_division) e.bd_division = "Required.";
      if (!form.bd_district) e.bd_district = "Required.";
      if (!form.district_internal.trim()) e.district_internal = "Required.";
      if (!form.support_type) e.support_type = "Required.";
      if (!form.monthly_cost.trim()) e.monthly_cost = "Required.";
      if (form.story.trim().length < 50) {
        e.story = "Story must be at least 50 characters.";
      }
      if (!form.guardian_summary_internal.trim()) {
        e.guardian_summary_internal = "Required.";
      }
      if (!form.guardian_relationship) e.guardian_relationship = "Required.";
      if (!form.parent_loss) e.parent_loss = "Required.";
      if (!form.guardian_phone.trim()) e.guardian_phone = "Required.";
      if (!form.photo_uuid) e.Photo = "A photo is required for new children.";
    } else {
      // Edit: shape-only checks on non-empty values.
      if (form.first_name && !form.first_name.trim()) {
        e.first_name = "Cannot be blank.";
      }
      if (form.display_name && !form.display_name.trim()) {
        e.display_name = "Cannot be blank.";
      }
      if (
        form.story &&
        form.story.trim().length > 0 &&
        form.story.trim().length < 50
      ) {
        e.story = "Story must be at least 50 characters.";
      }
    }

    // Cross-field rule (both modes): if priority_support is non-none,
    // priority_notes is required. Same rule the server enforces.
    if (
      form.priority_support &&
      form.priority_support !== "none" &&
      !form.priority_notes.trim()
    ) {
      e.priority_notes = "Required when priority is standard or urgent.";
    }

    // Date format checks across all date fields.
    for (const k of [
      "date_of_birth",
      "last_medical_checkup",
      "submission_date",
    ] as const) {
      if (form[k] && !/^\d{4}-\d{2}-\d{2}$/.test(form[k])) {
        e[k] = "Use the date picker.";
      }
    }
    if (form.monthly_cost) {
      const n = Number(form.monthly_cost);
      if (!Number.isInteger(n) || n < 0) {
        e.monthly_cost = "Whole number ≥ 0.";
      }
    }
    for (const k of [
      "siblings_count",
      "sibling_position",
      "household_size",
      "monthly_household_income_bdt",
    ] as const) {
      if (form[k]) {
        const n = Number(form[k]);
        if (!Number.isInteger(n) || n < 0) {
          e[k] = "Whole number ≥ 0.";
        }
      }
    }

    // Phone shape — extremely permissive (just guard against obvious
    // typos). Server doesn't gate this further.
    for (const k of ["guardian_phone", "guardian_phone_alt"] as const) {
      if (form[k] && form[k].trim().length > 0) {
        if (!/^[+\d\s()-]{7,32}$/.test(form[k].trim())) {
          e[k] = "Use digits, +, spaces, hyphens, or parentheses (7–32 chars).";
        }
      }
    }

    // Photo-consent guard: if a photo is present and DI hasn't ticked
    // consent, surface a warning (not a hard block on edit). On
    // create, the brief mandates consent must be true to upload.
    if (mode === "create" && form.photo_uuid && !form.photo_consent) {
      e.photo_consent =
        "Tick to confirm parent has consented to this photo being shown to donors.";
    }

    return e;
  }

  function buildSubmitBody() {
    const num = (s: string): number | null =>
      s.trim() === "" ? null : Number(s);

    if (mode === "create") {
      return {
        operation: "create" as const,
        fields: {
          // Required (Session 48a — added parent_loss + guardian_phone;
          // P1.3 — added first_name as the public-facing required name)
          first_name: form.first_name.trim(),
          display_name: form.display_name.trim(),
          date_of_birth: form.date_of_birth,
          bd_division: form.bd_division,
          bd_district: form.bd_district,
          district_internal: form.district_internal.trim(),
          support_type: form.support_type,
          monthly_cost: Number(form.monthly_cost),
          story: form.story.trim(),
          guardian_summary_internal: form.guardian_summary_internal.trim(),
          guardian_relationship: form.guardian_relationship,
          parent_loss: form.parent_loss,
          guardian_phone: form.guardian_phone.trim(),
          // Optional — included only when non-empty
          ...(form.gender ? { gender: form.gender } : {}),
          photo_consent: form.photo_consent,
          ...(form.permanent_address.trim()
            ? { permanent_address: form.permanent_address.trim() }
            : {}),
          ...(form.education_level
            ? { education_level: form.education_level }
            : {}),
          ...(form.class_grade.trim()
            ? { class_grade: form.class_grade.trim() }
            : {}),
          ...(form.educational_organization
            ? { educational_organization: form.educational_organization }
            : {}),
          ...(form.school_name_raw.trim()
            ? { school_name_raw: form.school_name_raw.trim() }
            : {}),
          ...(form.areas_of_interest.size > 0
            ? { areas_of_interest: Array.from(form.areas_of_interest) }
            : {}),
          ...(form.priority_support
            ? { priority_support: form.priority_support }
            : {}),
          ...(form.priority_notes.trim()
            ? { priority_notes: form.priority_notes.trim() }
            : {}),
          ...(form.blood_group ? { blood_group: form.blood_group } : {}),
          ...(form.vaccination_status
            ? { vaccination_status: form.vaccination_status }
            : {}),
          ...(form.last_medical_checkup
            ? { last_medical_checkup: form.last_medical_checkup }
            : {}),
          ...(form.disability_status
            ? { disability_status: form.disability_status }
            : {}),
          ...(form.disability_notes.trim()
            ? { disability_notes: form.disability_notes.trim() }
            : {}),
          ...(form.siblings_count
            ? { siblings_count: num(form.siblings_count) }
            : {}),
          ...(form.sibling_position
            ? { sibling_position: num(form.sibling_position) }
            : {}),
          ...(form.siblings_notes.trim()
            ? { siblings_notes: form.siblings_notes.trim() }
            : {}),
          ...(form.household_size
            ? { household_size: num(form.household_size) }
            : {}),
          ...(form.household_income_source
            ? { household_income_source: form.household_income_source }
            : {}),
          ...(form.monthly_household_income_bdt
            ? {
                monthly_household_income_bdt: num(
                  form.monthly_household_income_bdt,
                ),
              }
            : {}),
          ...(form.guardian_employment_type
            ? { guardian_employment_type: form.guardian_employment_type }
            : {}),
          ...(form.guardian_employment.trim()
            ? { guardian_employment: form.guardian_employment.trim() }
            : {}),
          ...(form.guardian_phone_alt.trim()
            ? { guardian_phone_alt: form.guardian_phone_alt.trim() }
            : {}),
          ...(form.additional_family_notes.trim()
            ? { additional_family_notes: form.additional_family_notes.trim() }
            : {}),
          // Session 48a — submission_date is the canonical column;
          // server mirrors to last_visit_date so we don't send both
          // explicitly here.
          ...(form.submission_date
            ? { submission_date: form.submission_date }
            : {}),
        },
        photoUuid: form.photo_uuid!,
      };
    }

    // UPDATE: the server recomputes diff anyway and rejects empty
    // diffs, but sending only the dirty subset keeps the request
    // tight and makes NoChangesError fire faster on no-op submits.
    return {
      operation: "update" as const,
      childId: existing!.id,
      fields: dirtyFieldsForUpdate(form, existing!),
      photoUuid: form.photo_uuid,
    };
  }

  // Session 48b — build the loose draft body. Mirrors the structure
  // of buildSubmitBody but keeps fields in their raw form state so
  // the server's draft path can store anything the DI typed without
  // tripping required-field rules.
  function buildDraftBody() {
    const num = (s: string): number | null =>
      s.trim() === "" ? null : Number(s);
    const fields: Record<string, unknown> = {
      // Identity
      // P1.3 — first_name included only when non-empty so drafts
      // don't trip required-field rules; the create flow requires it
      // at submit time.
      ...(form.first_name.trim()
        ? { first_name: form.first_name.trim() }
        : {}),
      ...(form.display_name.trim()
        ? { display_name: form.display_name.trim() }
        : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      ...(form.date_of_birth ? { date_of_birth: form.date_of_birth } : {}),
      photo_consent: form.photo_consent,
      // Location
      ...(form.bd_division ? { bd_division: form.bd_division } : {}),
      ...(form.bd_district ? { bd_district: form.bd_district } : {}),
      ...(form.district_internal.trim()
        ? { district_internal: form.district_internal.trim() }
        : {}),
      ...(form.permanent_address.trim()
        ? { permanent_address: form.permanent_address.trim() }
        : {}),
      // Education
      ...(form.education_level
        ? { education_level: form.education_level }
        : {}),
      ...(form.class_grade.trim()
        ? { class_grade: form.class_grade.trim() }
        : {}),
      ...(form.educational_organization
        ? { educational_organization: form.educational_organization }
        : {}),
      ...(form.school_name_raw.trim()
        ? { school_name_raw: form.school_name_raw.trim() }
        : {}),
      ...(form.areas_of_interest.size > 0
        ? { areas_of_interest: Array.from(form.areas_of_interest) }
        : {}),
      // Story
      ...(form.story.trim() ? { story: form.story.trim() } : {}),
      // Support
      ...(form.support_type ? { support_type: form.support_type } : {}),
      ...(form.monthly_cost.trim()
        ? { monthly_cost: Number(form.monthly_cost) }
        : {}),
      ...(form.priority_support
        ? { priority_support: form.priority_support }
        : {}),
      ...(form.priority_notes.trim()
        ? { priority_notes: form.priority_notes.trim() }
        : {}),
      // Health
      ...(form.blood_group ? { blood_group: form.blood_group } : {}),
      ...(form.vaccination_status
        ? { vaccination_status: form.vaccination_status }
        : {}),
      ...(form.last_medical_checkup
        ? { last_medical_checkup: form.last_medical_checkup }
        : {}),
      ...(form.disability_status
        ? { disability_status: form.disability_status }
        : {}),
      ...(form.disability_notes.trim()
        ? { disability_notes: form.disability_notes.trim() }
        : {}),
      // Family
      ...(form.parent_loss ? { parent_loss: form.parent_loss } : {}),
      ...(form.siblings_count
        ? { siblings_count: num(form.siblings_count) }
        : {}),
      ...(form.sibling_position
        ? { sibling_position: num(form.sibling_position) }
        : {}),
      ...(form.siblings_notes.trim()
        ? { siblings_notes: form.siblings_notes.trim() }
        : {}),
      ...(form.household_size
        ? { household_size: num(form.household_size) }
        : {}),
      // Socioeconomic
      ...(form.household_income_source
        ? { household_income_source: form.household_income_source }
        : {}),
      ...(form.monthly_household_income_bdt
        ? {
            monthly_household_income_bdt: num(
              form.monthly_household_income_bdt,
            ),
          }
        : {}),
      // Guardian
      ...(form.guardian_relationship
        ? { guardian_relationship: form.guardian_relationship }
        : {}),
      ...(form.guardian_employment_type
        ? { guardian_employment_type: form.guardian_employment_type }
        : {}),
      ...(form.guardian_employment.trim()
        ? { guardian_employment: form.guardian_employment.trim() }
        : {}),
      ...(form.guardian_phone.trim()
        ? { guardian_phone: form.guardian_phone.trim() }
        : {}),
      ...(form.guardian_phone_alt.trim()
        ? { guardian_phone_alt: form.guardian_phone_alt.trim() }
        : {}),
      ...(form.guardian_summary_internal.trim()
        ? { guardian_summary_internal: form.guardian_summary_internal.trim() }
        : {}),
      ...(form.additional_family_notes.trim()
        ? { additional_family_notes: form.additional_family_notes.trim() }
        : {}),
      // Submission date
      ...(form.submission_date
        ? { submission_date: form.submission_date }
        : {}),
    };

    // Session 52d Bug 2 fix — translate the form's `mode` prop
    // (`"edit"` / `"create"`, the URL-driven vocabulary) to the
    // proposal `operation` enum the server expects (`"update"` /
    // `"create"`). Pre-52d this sent `operation: "edit"` which the
    // draftBodySchema rejected (Invalid enum value) and the form
    // surfaced as the generic "Couldn't save your draft" toast on
    // every edit-existing-child save attempt. buildSubmitBody
    // already does this translation correctly (line ~756), which is
    // why Submit-for-approval worked while Save-as-draft didn't.
    const operation = mode === "edit" ? "update" : "create";
    return {
      mode: "draft" as const,
      operation,
      ...(operation === "update" && existing ? { childId: existing.id } : {}),
      fields,
      photoUuid: form.photo_uuid,
    };
  }

  // Session 48b — Save as draft handler. Either creates a fresh
  // draft (POST mode=draft) or updates an existing one (PATCH
  // /[draftId]). Stays on the page; sets a "saved" toast via
  // draftSavedAt + draftSavedTick.
  async function onSaveDraft() {
    setServerError(null);
    setSavingDraft(true);
    try {
      // Session 52a design contract: drafts ALWAYS save regardless
      // of whether the form has any changes vs the existing child.
      // The data-layer createDraftProposal / updateDraftProposal do
      // not run change-detection. If for any reason the server
      // returned a no_changes-like error here, we'd still mark the
      // save as "ok" rather than surface the change-detection
      // message — drafts are user checkpoints, not approval
      // submissions, and the user should never be blocked from
      // saving one. (No code path currently returns no_changes from
      // the draft endpoints; the guard below is defensive.)
      if (draftId) {
        // Update existing draft via PATCH.
        const draftBody = buildDraftBody();
        const res = await fetch(`/api/di/proposals/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: draftBody.fields,
            photoUuid: draftBody.photoUuid,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          // Defensive: any future no_changes leak is treated as a
          // no-op success for the draft path (see contract above).
          if (body.error === "no_changes") {
            setDraftSavedAt(new Date());
            setDraftSavedTick((t) => t + 1);
            return;
          }
          setServerError("Couldn't save your draft. Try again in a moment.");
          return;
        }
      } else {
        // Fresh draft via POST mode=draft.
        const res = await fetch("/api/di/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDraftBody()),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (body.error === "no_changes") {
            // Same contract — no_changes never blocks a draft save.
            setDraftSavedAt(new Date());
            setDraftSavedTick((t) => t + 1);
            return;
          }
          setServerError("Couldn't save your draft. Try again in a moment.");
          return;
        }
        const ok = (await res.json()) as {
          proposalId?: string;
          childId?: string;
        };
        if (ok.proposalId) {
          setDraftId(ok.proposalId);
          // Update URL so a page refresh resumes the draft cleanly
          // (no router.push — that would unmount the form and lose
          // local state). history.replaceState is the right tool.
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("draftId", ok.proposalId);
            window.history.replaceState(null, "", url.toString());
          }
        }
        // Session 52a Bug 3 — fresh CREATE drafts now return the
        // stub child id so the form can immediately unlock
        // documents + intake photo uploads against it.
        if (ok.childId) {
          setEffectiveChildId(ok.childId);
        }
      }
      setDraftSavedAt(new Date());
      setDraftSavedTick((t) => t + 1);
    } catch {
      setServerError("Network issue. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const localErrors = clientValidate();
    if (Object.keys(localErrors).length > 0) {
      // Session 63 — scroll the user up to the offending field so the
      // disabled-feeling-but-actually-blocked submit isn't mysterious.
      setErrors(localErrors);
      scrollToFirstError(localErrors);
      return;
    }

    startTransition(async () => {
      try {
        // Session 48b — submit-from-draft routes through the
        // /[draftId]/submit endpoint which re-runs strict validation
        // and discards the draft on success. Vanilla submit posts
        // straight to the existing /api/di/proposals endpoint.
        const url = draftId
          ? `/api/di/proposals/${draftId}/submit`
          : "/api/di/proposals";
        const init: RequestInit = draftId
          ? { method: "POST" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildSubmitBody()),
            };
        const res = await fetch(url, init);

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            field?: string;
            divisionCode?: string;
            // Session 51.5 — server now echoes the DI's allowed
            // divisions so we can render a concrete "you can only
            // create children in X, Y" message inline on the field.
            allowedCodes?: string[];
            // Session 63 — aggregate validation payload.
            fields?: Array<{ field?: string; message?: string }>;
            issues?: Array<{ path?: string; message?: string }>;
          };
          if (errBody.error === "no_changes") {
            // Session 52a — directing the user at "Save as draft" is
            // the friendly recourse: drafts have no change-detection,
            // so they can keep their checkpoint without editing
            // anything. The Submit button keeps the strict check
            // (only proposals with actual changes go to admin).
            setServerError(
              "No fields have actually changed since you opened the form. Use \"Save as draft\" if you just want a checkpoint, or edit a field before submitting for review.",
            );
          } else if (errBody.error === "division_not_allowed") {
            const allowed = errBody.allowedCodes ?? [];
            const allowedFriendly = allowed.length > 0
              ? allowed
                  .map((c) =>
                    divisions.find((d) => d.code === c)?.name ?? c,
                  )
                  .join(", ")
              : null;
            const msg = allowedFriendly
              ? `You can only create children in your assigned divisions: ${allowedFriendly}.`
              : "You don't have any assigned divisions yet. Ask your admin to set them up before creating a new child.";
            setErrors((e) => {
              const next = { ...e, bd_division: msg };
              scrollToFirstError(next);
              return next;
            });
          } else if (
            // Session 63 — aggregate validation result. Server collects
            // every problem and sends them at once so the DI can fix
            // them all in a single pass.
            errBody.error === "validation_failed" &&
            Array.isArray(errBody.fields) &&
            errBody.fields.length > 0
          ) {
            const aggregated: Record<string, string> = {};
            for (const f of errBody.fields) {
              if (!f.field) continue;
              const key = remapServerField(f.field);
              aggregated[key] = f.message?.trim() || "Invalid.";
            }
            if (Object.keys(aggregated).length > 0) {
              setErrors((e) => {
                const next = { ...e, ...aggregated };
                scrollToFirstError(next);
                return next;
              });
            } else {
              // Defensive: validation_failed with zero usable fields
              // shouldn't happen — flag it visibly rather than going
              // silently green.
              setServerError(
                "Submission failed validation but no specific fields were reported. Please refresh and try again.",
              );
            }
          } else if (
            // Legacy single-error shape — kept for the unlikely case
            // a deeper code path still throws MissingRequiredFieldError
            // / InvalidValueError individually.
            errBody.error === "missing_required_field" &&
            errBody.field
          ) {
            const key = remapServerField(errBody.field);
            setErrors((e) => {
              const next = { ...e, [key]: "Required." };
              scrollToFirstError(next);
              return next;
            });
          } else if (errBody.error === "invalid_value" && errBody.field) {
            const key = remapServerField(errBody.field);
            const msg = errBody.message ?? "Invalid value.";
            setErrors((e) => {
              const next = { ...e, [key]: msg };
              scrollToFirstError(next);
              return next;
            });
          } else if (errBody.error === "not_found") {
            setServerError(
              "This child isn't in your care anymore. Refresh and try again.",
            );
          } else if (errBody.error === "bad_request" && errBody.issues) {
            const zodErrors: Record<string, string> = {};
            for (const i of errBody.issues) {
              const path = i.path?.split(".").pop() ?? "";
              if (path) zodErrors[remapServerField(path)] = i.message ?? "Invalid.";
            }
            if (Object.keys(zodErrors).length > 0) {
              setErrors((e) => {
                const next = { ...e, ...zodErrors };
                scrollToFirstError(next);
                return next;
              });
            } else {
              setServerError("Something didn't pass validation.");
            }
          } else {
            setServerError(
              "Submission failed. Please try again in a moment.",
            );
          }
          return;
        }

        const ok = (await res.json()) as { proposalId?: string };
        const next = ok.proposalId
          ? (`/di/submissions?just_submitted=${ok.proposalId}` as Route)
          : ("/di/submissions" as Route);
        router.push(next);
        router.refresh();
      } catch {
        setServerError(
          "Something went wrong sending this off. Please try again.",
        );
      }
    });
  }

  const computedAge = calcAge(form.date_of_birth);
  const showDisabilityNotes =
    form.disability_status && form.disability_status !== "none";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Session 48b — draft-mode banner. Only renders when the form
          is bound to a draft (initial ?draftId= or after first
          Save-as-draft creates one). Uses native amber styling per
          the visual brief; relative-time string updates whenever
          draftSavedTick bumps (tick used as a force-refresh handle). */}
      {draftId ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3"
          role="status"
        >
          <Save
            className="w-4 h-4 text-amber-700 stroke-[1.75] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0 text-[13.5px] text-amber-900 leading-snug">
            <span className="font-medium">Editing draft</span>
            {draftSavedAt ? (
              <span className="text-amber-800/80">
                {" — last saved "}
                <DraftSavedAt at={draftSavedAt} tick={draftSavedTick} />
              </span>
            ) : (
              <span className="text-amber-800/80">
                {" — not yet saved this session"}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {/* Section 1 — Identity */}
      <Section title="Identity">
        {/* P1.3 — first_name is the ONLY name rendered on Tier-1
            (public) surfaces: homepage cards, /children browse,
            /children/[id] profile, OG metadata. Required on create.
            DI must enter ONLY a first name here. */}
        <Field>
          <label className={labelClass} htmlFor="first_name">
            First name (shown publicly) *
          </label>
          <input
            id="first_name"
            type="text"
            className={inputClass}
            value={form.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            placeholder="e.g. Fahim"
            maxLength={64}
            disabled={pending}
            {...errProps("first_name")}
          />
          <p className={helperClass}>
            <strong>First name only.</strong> Never enter a surname here.
            This is the name donors see on cards, the profile, and in
            social previews.
          </p>
          {errors.first_name ? (
            <p className={errorClass}>{errors.first_name}</p>
          ) : null}
        </Field>
        <Field>
          <label className={labelClass} htmlFor="display_name">
            Display name (internal) *
          </label>
          <input
            id="display_name"
            type="text"
            className={inputClass}
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            placeholder="e.g. Fahim Khan"
            disabled={pending}
            {...errProps("display_name")}
          />
          <p className={helperClass}>
            Internal record name — visible to admin and DI only. Never
            shown on public surfaces.
          </p>
          {errors.display_name ? (
            <p className={errorClass}>{errors.display_name}</p>
          ) : null}
        </Field>

        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="gender">
              Gender
            </label>
            <select
              id="gender"
              className={selectClass}
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              disabled={pending}
            >
              <option value="">Select…</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <label className={labelClass} htmlFor="date_of_birth">
              Date of birth *
            </label>
            <div className="flex items-center gap-3">
              <input
                id="date_of_birth"
                type="date"
                className={inputClass}
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
                disabled={pending}
                {...errProps("date_of_birth")}
              />
              {computedAge !== null ? (
                <span className="text-[13px] text-ink-soft whitespace-nowrap">
                  {computedAge} years old
                </span>
              ) : null}
            </div>
            {errors.date_of_birth ? (
              <p className={errorClass}>{errors.date_of_birth}</p>
            ) : null}
          </Field>
        </FieldRow>

        <Field>
          <PhotoUploadField
            currentPhotoUuid={form.photo_uuid}
            onUuidChange={(uuid) => set("photo_uuid", uuid)}
            required={mode === "create"}
            externalError={errors.Photo ?? null}
          />
        </Field>

        {/* Photo consent — Session 46-fix-2 — defaults FALSE on every
            form load, tangerine-tinted block to mark importance. */}
        <Field>
          <label
            htmlFor="photo_consent"
            className="flex items-start gap-3 p-4 rounded-xl bg-tangerine-mist/40 border border-tangerine-soft cursor-pointer hover:bg-tangerine-mist/60 transition-colors"
          >
            <input
              id="photo_consent"
              type="checkbox"
              className="mt-1 w-5 h-5 accent-tangerine"
              checked={form.photo_consent}
              onChange={(e) => set("photo_consent", e.target.checked)}
              disabled={pending}
            />
            <div className="flex-1">
              <div className="text-[14.5px] text-ink font-medium">
                Parent has consented to this photo being shown to donors.
              </div>
              <div className="text-[12.5px] text-ink-soft mt-0.5">
                Required for any photo to appear on the public site. Re-tick
                each submission so consent stays current.
              </div>
            </div>
          </label>
          {errors.photo_consent ? (
            <p className={errorClass}>{errors.photo_consent}</p>
          ) : null}
        </Field>
      </Section>

      {/* Section 2 — Current location (Session 48a renamed; added
          permanent_address Tier 3 textarea below the existing fields) */}
      <Section title="Current location">
        <Field>
          <label className={labelClass} htmlFor="bd_division">
            Division *
          </label>
          <select
            id="bd_division"
            className={selectClass}
            value={form.bd_division}
            onChange={(e) => set("bd_division", e.target.value)}
            disabled={pending}
            {...errProps("bd_division")}
          >
            <option value="">Select a division…</option>
            {divisions.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          {mode === "create" ? (
            <p className={helperClass}>
              You can only add new children in your assigned divisions.
            </p>
          ) : null}
          {errors.bd_division ? (
            <p className={errorClass}>{errors.bd_division}</p>
          ) : null}
        </Field>

        <Field>
          <BdDistrictField
            selectedDivision={form.bd_division}
            value={form.bd_district}
            onChange={(code) => set("bd_district", code)}
            districts={districts}
            disabled={pending}
            required={mode === "create"}
            error={errors.bd_district ?? null}
          />
        </Field>

        <Field>
          <label className={labelClass} htmlFor="district_internal">
            Full address {mode === "create" ? "*" : null}
          </label>
          <input
            id="district_internal"
            type="text"
            className={inputClass}
            value={form.district_internal}
            onChange={(e) => set("district_internal", e.target.value)}
            placeholder="House / road / village / area"
            disabled={pending}
            {...errProps("district_internal")}
          />
          <p className={helperClass}>Not shown to donors.</p>
          {errors.district_internal ? (
            <p className={errorClass}>{errors.district_internal}</p>
          ) : null}
        </Field>

        {/* Tier 3 — permanent_address. Internal-only, never shown to
            donors. Optional. */}
        <Tier3Field>
          <label className={labelClass} htmlFor="permanent_address">
            Permanent address — internal
          </label>
          <textarea
            id="permanent_address"
            className={textareaClass}
            value={form.permanent_address}
            onChange={(e) => set("permanent_address", e.target.value)}
            placeholder="Family's permanent address (village, district, etc.)"
            disabled={pending}
            rows={2}
          />
          <p className={helperClass}>
            Optional. Captured for admin records — never displayed to
            donors.
          </p>
        </Tier3Field>
      </Section>

      {/* Section 3 — Education (Session 48a — education_level is now
          a dropdown; new educational_organization SchoolPicker M2O
          + school_name_raw fallback; areas_of_interest is now a
          checkbox grid backed by the AREA_OF_INTEREST_OPTIONS list
          from form-constants.ts). */}
      <Section title="Education">
        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="education_level">
              Education level
            </label>
            <select
              id="education_level"
              className={selectClass}
              value={form.education_level}
              onChange={(e) => set("education_level", e.target.value)}
              disabled={pending}
            >
              <option value="">Select…</option>
              {EDUCATION_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <label className={labelClass} htmlFor="class_grade">
              Class / grade (optional)
            </label>
            <input
              id="class_grade"
              type="text"
              className={inputClass}
              value={form.class_grade}
              onChange={(e) => set("class_grade", e.target.value)}
              placeholder="e.g. Class 5 / Grade 3"
              disabled={pending}
            />
          </Field>
        </FieldRow>

        <Field>
          <label className={labelClass}>School / institution</label>
          <SchoolPicker
            value={form.educational_organization}
            onChange={(id) => set("educational_organization", id)}
            disabled={pending}
            defaultDivision={form.bd_division}
            defaultDistrict={form.bd_district}
          />
          <p className={helperClass}>
            Pick from the list, or add a new one if not yet recorded.
            Optional.
          </p>
        </Field>

        <Field>
          <label className={labelClass} htmlFor="school_name_raw">
            School name (free-text fallback)
          </label>
          <input
            id="school_name_raw"
            type="text"
            className={inputClass}
            value={form.school_name_raw}
            onChange={(e) => set("school_name_raw", e.target.value)}
            placeholder="Type school name if you couldn't find it above"
            disabled={pending}
          />
          <p className={helperClass}>
            Use this only when the school dropdown doesn&apos;t yet have a
            matching row. Admin will link it later.
          </p>
        </Field>

        <Field>
          <label className={labelClass}>Areas of interest</label>
          <p className={helperClass + " mb-3 mt-0"}>
            Tick anything that fits — donors love seeing these. Tier 1
            public.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {AREA_OF_INTEREST_OPTIONS.map((opt) => {
              const checked = form.areas_of_interest.has(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? "bg-tangerine-mist/40 border-tangerine-soft"
                      : "bg-white border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-tangerine"
                    checked={checked}
                    onChange={() =>
                      set(
                        "areas_of_interest",
                        toggleSetMember(form.areas_of_interest, opt.value),
                      )
                    }
                    disabled={pending}
                  />
                  <span className="text-[13.5px] text-ink leading-snug">
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        </Field>
      </Section>

      {/* Section 4 — Story (donor-facing) */}
      <Section title="Story (donor-facing)">
        <Field>
          <label className={labelClass} htmlFor="story">
            Story *
          </label>
          <textarea
            id="story"
            className={textareaClass}
            value={form.story}
            onChange={(e) => set("story", e.target.value)}
            placeholder="Tell their story warmly without revealing identifying details that could narrow them in their community."
            disabled={pending}
            rows={6}
            {...errProps("story")}
          />
          <p className={helperClass}>
            Donors see this. Aim for 2–4 short paragraphs.{" "}
            {form.story.length > 0 ? `${form.story.length}/2000` : null}
          </p>
          {errors.story ? <p className={errorClass}>{errors.story}</p> : null}
        </Field>
      </Section>

      {/* Section 4b — Intake photos (Session 48b).
          Onboarding evidence photos. Lives between Story and
          Support needed because reviewers want the visual context
          right after the donor-facing narrative. In create mode the
          grid renders a hint card explaining intake photos open up
          after admin approval (the child_intake_photo.child column
          is NOT NULL — no child UUID to attach to until then). */}
      <Section title="Intake photos">
        <p className="text-[13px] text-ink-soft mb-3 leading-relaxed">
          Add 3–5 photos from your initial visit so admin can verify
          the profile. These are kept internal — donors never see
          them.
        </p>
        <IntakePhotoGrid
          childId={effectiveChildId}
          initial={intakePhotos}
        />
      </Section>

      {/* Section 5 — Support needed (Session 48a renamed from
          "Support plan"; "Monthly cost" relabel → "Cost"; new
          priority_support dropdown + conditional priority_notes
          textarea — matches the disability_notes hide-when-none
          pattern Session 46-fix-2 already established). */}
      <Section title="Support needed">
        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="support_type">
              Support type *
            </label>
            <select
              id="support_type"
              className={selectClass}
              value={form.support_type}
              onChange={(e) => set("support_type", e.target.value)}
              disabled={pending}
              {...errProps("support_type")}
            >
              <option value="">Select a type…</option>
              {SUPPORT_TYPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {errors.support_type ? (
              <p className={errorClass}>{errors.support_type}</p>
            ) : null}
          </Field>

          <Field>
            <label className={labelClass} htmlFor="monthly_cost">
              Cost (BDT/month) *
            </label>
            <input
              id="monthly_cost"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={inputClass}
              value={form.monthly_cost}
              onChange={(e) => set("monthly_cost", e.target.value)}
              placeholder="e.g. 1500"
              disabled={pending}
              {...errProps("monthly_cost")}
            />
            <p className={helperClass}>Approximate monthly need.</p>
            {errors.monthly_cost ? (
              <p className={errorClass}>{errors.monthly_cost}</p>
            ) : null}
          </Field>
        </FieldRow>

        <Field>
          <label className={labelClass} htmlFor="priority_support">
            Priority
          </label>
          <select
            id="priority_support"
            className={selectClass}
            value={form.priority_support}
            onChange={(e) => set("priority_support", e.target.value)}
            disabled={pending}
          >
            {PRIORITY_SUPPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className={helperClass}>
            {PRIORITY_SUPPORT_OPTIONS.find(
              (o) => o.value === form.priority_support,
            )?.helper ?? ""}
          </p>
        </Field>

        {/* Conditional — only renders when priority is non-none.
            Server enforces the same rule. */}
        {form.priority_support && form.priority_support !== "none" ? (
          <Tier3Field>
            <label className={labelClass} htmlFor="priority_notes">
              Priority notes *
            </label>
            <textarea
              id="priority_notes"
              className={textareaClass}
              value={form.priority_notes}
              onChange={(e) => set("priority_notes", e.target.value)}
              placeholder="Why is this child a priority? Brief context for admin."
              disabled={pending}
              rows={3}
              {...errProps("priority_notes")}
            />
            <p className={helperClass}>
              Required when priority is standard or urgent. Internal-only.
            </p>
            {errors.priority_notes ? (
              <p className={errorClass}>{errors.priority_notes}</p>
            ) : null}
          </Tier3Field>
        ) : null}
      </Section>

      {/* Section 6 — Health */}
      <Section title="Health">
        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="blood_group">
              Blood group
            </label>
            <select
              id="blood_group"
              className={selectClass}
              value={form.blood_group}
              onChange={(e) => set("blood_group", e.target.value)}
              disabled={pending}
            >
              <option value="">Select…</option>
              {BLOOD_GROUP_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <label className={labelClass} htmlFor="vaccination_status">
              Vaccination status
            </label>
            <select
              id="vaccination_status"
              className={selectClass}
              value={form.vaccination_status}
              onChange={(e) => set("vaccination_status", e.target.value)}
              disabled={pending}
            >
              <option value="">Select…</option>
              {VACCINATION_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <Field>
          <label className={labelClass} htmlFor="last_medical_checkup">
            Last medical checkup
          </label>
          <input
            id="last_medical_checkup"
            type="date"
            className={inputClass}
            value={form.last_medical_checkup}
            onChange={(e) => set("last_medical_checkup", e.target.value)}
            disabled={pending}
            {...errProps("last_medical_checkup")}
          />
          {errors.last_medical_checkup ? (
            <p className={errorClass}>{errors.last_medical_checkup}</p>
          ) : null}
        </Field>

        <Field>
          <label className={labelClass} htmlFor="disability_status">
            Disability status
          </label>
          <select
            id="disability_status"
            className={selectClass}
            value={form.disability_status}
            onChange={(e) => set("disability_status", e.target.value)}
            disabled={pending}
          >
            <option value="">Select…</option>
            {DISABILITY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        {showDisabilityNotes ? (
          <Field>
            <label className={labelClass} htmlFor="disability_notes">
              Disability notes
            </label>
            <textarea
              id="disability_notes"
              className={textareaClass}
              value={form.disability_notes}
              onChange={(e) => set("disability_notes", e.target.value)}
              placeholder="Brief notes admin should see when reviewing — kind of support, mobility, accommodations."
              disabled={pending}
              rows={3}
            />
            <p className={helperClass}>Not shown to donors.</p>
          </Field>
        ) : null}
      </Section>

      {/* Section 7 — Family (Session 48a — added parent_loss above
          the existing siblings/household fields). */}
      <Section title="Family">
        <Field>
          <label className={labelClass} htmlFor="parent_loss">
            Who has the child lost? {mode === "create" ? "*" : null}
          </label>
          <select
            id="parent_loss"
            className={selectClass}
            value={form.parent_loss}
            onChange={(e) => set("parent_loss", e.target.value)}
            disabled={pending}
            {...errProps("parent_loss")}
          >
            <option value="">Select…</option>
            {PARENT_LOSS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.parent_loss ? (
            <p className={errorClass}>{errors.parent_loss}</p>
          ) : null}
        </Field>

        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="siblings_count">
              Siblings (count)
            </label>
            <input
              id="siblings_count"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={inputClass}
              value={form.siblings_count}
              onChange={(e) => set("siblings_count", e.target.value)}
              disabled={pending}
              {...errProps("siblings_count")}
            />
            {errors.siblings_count ? (
              <p className={errorClass}>{errors.siblings_count}</p>
            ) : null}
          </Field>

          <Field>
            <label className={labelClass} htmlFor="sibling_position">
              Sibling position
            </label>
            <input
              id="sibling_position"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={inputClass}
              value={form.sibling_position}
              onChange={(e) => set("sibling_position", e.target.value)}
              placeholder="e.g. 1 = eldest"
              disabled={pending}
              {...errProps("sibling_position")}
            />
            <p className={helperClass}>Is this child the eldest, youngest…</p>
            {errors.sibling_position ? (
              <p className={errorClass}>{errors.sibling_position}</p>
            ) : null}
          </Field>
        </FieldRow>

        <Field>
          <label className={labelClass} htmlFor="siblings_notes">
            Siblings notes
          </label>
          <textarea
            id="siblings_notes"
            className={textareaClass}
            value={form.siblings_notes}
            onChange={(e) => set("siblings_notes", e.target.value)}
            placeholder="Optional notes on siblings."
            disabled={pending}
            rows={2}
          />
        </Field>

        <Field>
          <label className={labelClass} htmlFor="household_size">
            Household size
          </label>
          <input
            id="household_size"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={inputClass}
            value={form.household_size}
            onChange={(e) => set("household_size", e.target.value)}
            disabled={pending}
            {...errProps("household_size")}
          />
          <p className={helperClass}>Total people in the household.</p>
          {errors.household_size ? (
            <p className={errorClass}>{errors.household_size}</p>
          ) : null}
        </Field>
      </Section>

      {/* Section 8 — Socioeconomic */}
      <Section title="Socioeconomic">
        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="household_income_source">
              Income source
            </label>
            <select
              id="household_income_source"
              className={selectClass}
              value={form.household_income_source}
              onChange={(e) => set("household_income_source", e.target.value)}
              disabled={pending}
            >
              <option value="">Select…</option>
              {HOUSEHOLD_INCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <label
              className={labelClass}
              htmlFor="monthly_household_income_bdt"
            >
              Monthly household income (BDT)
            </label>
            <input
              id="monthly_household_income_bdt"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={inputClass}
              value={form.monthly_household_income_bdt}
              onChange={(e) =>
                set("monthly_household_income_bdt", e.target.value)
              }
              disabled={pending}
              {...errProps("monthly_household_income_bdt")}
            />
            <p className={helperClass}>Approximate. Not shown to donors.</p>
            {errors.monthly_household_income_bdt ? (
              <p className={errorClass}>
                {errors.monthly_household_income_bdt}
              </p>
            ) : null}
          </Field>
        </FieldRow>
      </Section>

      {/* Section 9 — Guardian */}
      <Section title="Guardian">
        <Field>
          <label className={labelClass} htmlFor="guardian_relationship">
            Relationship to child {mode === "create" ? "*" : null}
          </label>
          <select
            id="guardian_relationship"
            className={selectClass}
            value={form.guardian_relationship}
            onChange={(e) => set("guardian_relationship", e.target.value)}
            disabled={pending}
            {...errProps("guardian_relationship")}
          >
            <option value="">Select…</option>
            {GUARDIAN_RELATIONSHIP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          {errors.guardian_relationship ? (
            <p className={errorClass}>{errors.guardian_relationship}</p>
          ) : null}
        </Field>

        {/* Session 48a — guardian_employment_type (structured) +
            guardian_employment (free-text qualifier) — both Tier 3.
            Type is the dropdown DI picks from; the free-text adds
            specifics ("small_business" + "tea stall"). */}
        <Tier3Field>
          <FieldRow>
            <Field>
              <label
                className={labelClass}
                htmlFor="guardian_employment_type"
              >
                Guardian&apos;s work type
              </label>
              <select
                id="guardian_employment_type"
                className={selectClass}
                value={form.guardian_employment_type}
                onChange={(e) =>
                  set("guardian_employment_type", e.target.value)
                }
                disabled={pending}
              >
                <option value="">Select…</option>
                {GUARDIAN_EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <label className={labelClass} htmlFor="guardian_employment">
                Detail (optional)
              </label>
              <input
                id="guardian_employment"
                type="text"
                className={inputClass}
                value={form.guardian_employment}
                onChange={(e) => set("guardian_employment", e.target.value)}
                placeholder="e.g. tea stall / nightshift"
                disabled={pending}
              />
              <p className={helperClass}>
                Free-text qualifier alongside the type above.
              </p>
            </Field>
          </FieldRow>
        </Tier3Field>

        {/* Session 48a — guardian phone numbers, both Tier 3.
            Primary is mandatory at submit; alt is always optional. */}
        <Tier3Field>
          <FieldRow>
            <Field>
              <label className={labelClass} htmlFor="guardian_phone">
                <span className="text-[#9A2424]">*</span> Guardian phone
              </label>
              <input
                id="guardian_phone"
                type="tel"
                className={inputClass}
                value={form.guardian_phone}
                onChange={(e) => set("guardian_phone", e.target.value)}
                placeholder="+8801XXXXXXXXX"
                disabled={pending}
                {...errProps("guardian_phone")}
              />
              <p className={helperClass}>
                Internal only — never shown to donors.
              </p>
              {errors.guardian_phone ? (
                <p className={errorClass}>{errors.guardian_phone}</p>
              ) : null}
            </Field>

            <Field>
              <label className={labelClass} htmlFor="guardian_phone_alt">
                Secondary phone (optional)
              </label>
              <input
                id="guardian_phone_alt"
                type="tel"
                className={inputClass}
                value={form.guardian_phone_alt}
                onChange={(e) => set("guardian_phone_alt", e.target.value)}
                placeholder="Optional secondary contact"
                disabled={pending}
                {...errProps("guardian_phone_alt")}
              />
              {errors.guardian_phone_alt ? (
                <p className={errorClass}>{errors.guardian_phone_alt}</p>
              ) : null}
            </Field>
          </FieldRow>
        </Tier3Field>

        <Field>
          <label
            className={labelClass}
            htmlFor="guardian_summary_internal"
          >
            Guardian context (internal) *
          </label>
          <textarea
            id="guardian_summary_internal"
            className={textareaClass}
            value={form.guardian_summary_internal}
            onChange={(e) => set("guardian_summary_internal", e.target.value)}
            placeholder="Family situation, who the child lives with, anything the admin should know."
            disabled={pending}
            rows={4}
            {...errProps("guardian_summary_internal")}
          />
          <p className={helperClass}>Not shown to donors.</p>
          {errors.guardian_summary_internal ? (
            <p className={errorClass}>
              {errors.guardian_summary_internal}
            </p>
          ) : null}
        </Field>

        <Field>
          <label className={labelClass} htmlFor="additional_family_notes">
            Additional family notes
          </label>
          <textarea
            id="additional_family_notes"
            className={textareaClass}
            value={form.additional_family_notes}
            onChange={(e) => set("additional_family_notes", e.target.value)}
            placeholder="Anything else worth recording about the family."
            disabled={pending}
            rows={3}
          />
          <p className={helperClass}>Not shown to donors.</p>
        </Field>
      </Section>

      {/* Section 9a — Documents (Session 49).
          Tier 3 evidence collection for parent death cert, child
          birth cert, guardian NID, school recommendation. Optional
          for both draft + submit; missing documents surface a soft
          warning above Submit, never block. The component handles
          its own upload, notes, delete, and replace flows; the
          parent only tracks missing-types for the warning render. */}
      <Section title="Documents (internal)">
        <p className="text-[13px] text-ink-soft mb-3 leading-relaxed">
          Four verification documents we collect during the initial
          visit. Optional — submit without them if you don&apos;t
          have everything yet, and admin will follow up.
        </p>
        <DocumentsSection
          childId={effectiveChildId}
          initial={documents}
          onMissingChange={setMissingDocTypes}
          // Session 52d — drives which death-certificate row(s)
          // render. As the DI flips parent_loss, the visible
          // slots update conditionally (existing uploads to
          // now-hidden types persist in the DB).
          parentLoss={form.parent_loss}
        />
      </Section>

      {/* Section 10 — Submission date (Session 48a renamed from
          "Field visit"; binds to the new `submission_date` column.
          Server mirrors to last_visit_date for backward compat). */}
      <Section title="Submission date">
        <Field>
          <label className={labelClass} htmlFor="submission_date">
            Submission date
          </label>
          <input
            id="submission_date"
            type="date"
            className={inputClass}
            value={form.submission_date}
            onChange={(e) => set("submission_date", e.target.value)}
            disabled={pending}
            {...errProps("submission_date")}
          />
          <p className={helperClass}>
            Optional. The date this profile was prepared.
          </p>
          {errors.submission_date ? (
            <p className={errorClass}>{errors.submission_date}</p>
          ) : null}
        </Field>
      </Section>

      {/* Server error banner */}
      {serverError ? (
        <div className="rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#9A2424]">
          {serverError}
        </div>
      ) : null}

      {/* Session 49 — soft warning when verification documents are
          missing. Information only; doesn't block submission. Hidden
          in create mode (where the section itself is locked behind
          a hint card) — only render when there's an existing child. */}
      {existing && missingDocTypes.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3">
          <p className="text-[13.5px] text-amber-900 leading-relaxed">
            <span className="font-semibold">Submitting without {missingDocTypes.length} {missingDocTypes.length === 1 ? "document" : "documents"}:</span>{" "}
            {missingDocTypes
              .map((t) => DOCUMENT_TYPE_LABELS[t].toLowerCase())
              .join(", ")}
            . Admin will follow up — this won&apos;t block approval.
          </p>
        </div>
      ) : null}

      {/* Session 63 — validation summary panel. Renders whenever the
          field-error map has entries (either local clientValidate() or
          a server validation_failed response populated it). Lists
          every offending field in section order so the DI can sweep
          top-to-bottom rather than guessing which input lit up red.
          The per-field red border + helper text under each input is
          still there — this panel is the "what's wrong overall" view.
          Cleared automatically as the DI fixes each field, since
          set() drops the corresponding error key on edit. */}
      <ErrorSummaryPanel errors={errors} />

      {/* Submit + Save as draft (Session 48b).
          Layout: on mobile, the buttons stack column-reverse so Submit
          is at the bottom (closest to the user's thumb on tap), Save
          as draft sits above it, Cancel above that. On desktop the
          row reads Cancel · Save draft · Submit left-to-right with
          Submit as the rightmost primary action. */}
      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
        <a
          href={mode === "edit" ? `/di/children/${existing!.id}` : "/di/children"}
          className="text-center md:text-left text-[14px] text-slate hover:text-tangerine-deeper transition-colors"
        >
          Cancel
        </a>
        <button
          type="button"
          onClick={() => void onSaveDraft()}
          disabled={savingDraft || pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[14.5px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {savingDraft ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {savingDraft
            ? "Saving…"
            : draftId
              ? "Save draft"
              : "Save as draft"}
        </button>
        <button
          type="submit"
          disabled={pending || savingDraft}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : null}
          {mode === "edit"
            ? "Submit for approval"
            : "Submit new child for approval"}
        </button>
      </div>
    </form>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
      <h2 className="font-display text-[18px] text-ink leading-tight">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  // Two-column row on md+, stacked on mobile.
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// Session 48b — relative time for the "Editing draft — last saved Xm
// ago" banner. Re-renders every 30s (and whenever `tick` bumps from
// a fresh save) so the relative string stays roughly fresh. Tiny
// component so the banner doesn't have to know about the timer.
function DraftSavedAt({ at, tick }: { at: Date; tick: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    // Re-render every 30s while the banner is mounted.
    const id = setInterval(() => force((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // tick is intentionally consumed in the render path (referenced
  // below) so a parent-driven save also forces a re-render.
  void tick;
  return <>{relativeTimeAgo(at)}</>;
}

function relativeTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

// Session 48a — Tier 3 visual treatment. Wraps a field so DI sees an
// amber left-border accent + a small "Internal only" badge near the
// label. Use sparingly; only fields that contain Tier 3 PII (admin-
// only data per the privacy spec) get this treatment.
//
// The brief calls these out:
//   permanent_address, priority_notes, guardian_phone,
//   guardian_phone_alt, guardian_employment_type, guardian_employment.
function Tier3Field({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pl-3 border-l-[3px] border-amber-300/70">
      <div className="mb-1.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Internal only
        </span>
      </div>
      {children}
    </div>
  );
}

// Session 63 — summary panel listing every field-level error.
// Sits above the submit button so the user sees the full to-fix
// list right before the affordance that triggered the validation.
// Sorted by FIELD_ORDER so the bullets read in the same top-to-bottom
// order as the form sections, then anything not in FIELD_ORDER falls
// to the bottom in original-insertion order (Object.keys is reliable
// for string keys in modern JS engines).
function ErrorSummaryPanel({ errors }: { errors: Record<string, string> }) {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;

  const ordered: string[] = [];
  for (const k of FIELD_ORDER) {
    if (errors[k]) ordered.push(k);
  }
  for (const k of keys) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 mb-2"
      role="alert"
      aria-live="polite"
    >
      <p className="text-[13.5px] font-semibold text-rose-900 mb-2">
        Please fix {ordered.length === 1 ? "this" : `these ${ordered.length}`} before
        submitting:
      </p>
      <ul className="list-disc list-inside space-y-1 text-[13.5px] text-rose-900 leading-snug">
        {ordered.map((field) => (
          <li key={field}>
            <span className="font-medium">{fieldLabel(field)}</span>
            {errors[field] && errors[field] !== "Required."
              ? ` — ${errors[field]}`
              : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── UPDATE-mode dirty-fields builder ───────────────────────────────
//
// The server recomputes the diff anyway and rejects empty submissions
// (NoChangesError → 400), but pre-trimming to dirty fields:
//   1. Tightens the request body
//   2. Means a pure-no-op submit hits NoChangesError immediately
//      rather than after a Directus roundtrip
//
// `same` treats null / undefined / "" as equivalent for string fields.

function dirtyFieldsForUpdate(
  form: FormState,
  existing: ChildFormExistingChild,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sameStr = (a: string, b: string | null | undefined) =>
    a.trim() === (b ?? "").toString().trim();
  const numFor = (s: string): number | null =>
    s.trim() === "" ? null : Number(s);

  // Identity
  // P1.3 — first_name diffed against existing.first_name (may be null
  // on legacy rows that pre-date this column).
  if (!sameStr(form.first_name, existing.first_name)) {
    out.first_name = form.first_name.trim();
  }
  if (!sameStr(form.display_name, existing.display_name)) {
    out.display_name = form.display_name.trim();
  }
  if (form.gender !== (existing.gender ?? "")) {
    out.gender = form.gender || undefined;
  }
  if (form.date_of_birth !== (existing.date_of_birth ?? "")) {
    out.date_of_birth = form.date_of_birth || null;
  }
  // photo_consent is always sent (since it defaults FALSE on every
  // load — a stale TRUE is intentionally cleared).
  if (form.photo_consent !== (existing.photo_consent ?? false)) {
    out.photo_consent = form.photo_consent;
  }

  // Current location (Session 48a — added permanent_address)
  if (form.bd_division !== (existing.bd_division_code ?? "")) {
    out.bd_division = form.bd_division;
  }
  if (form.bd_district !== (existing.bd_district_code ?? "")) {
    out.bd_district = form.bd_district;
  }
  if (!sameStr(form.district_internal, existing.district_internal)) {
    out.district_internal = form.district_internal.trim();
  }
  if (!sameStr(form.permanent_address, existing.permanent_address)) {
    out.permanent_address = form.permanent_address.trim();
  }

  // Education + interests (Session 48a — education_level is now an
  // enum slug; areas_of_interest is text[] compared by sorted-join)
  if (form.education_level !== (existing.education_level ?? "")) {
    out.education_level = form.education_level || null;
  }
  if (!sameStr(form.class_grade, existing.class_grade)) {
    out.class_grade = form.class_grade.trim();
  }
  if (
    form.educational_organization !==
    (existing.educational_organization ?? "")
  ) {
    out.educational_organization = form.educational_organization || null;
  }
  if (!sameStr(form.school_name_raw, existing.school_name_raw)) {
    out.school_name_raw = form.school_name_raw.trim();
  }
  // Compare interests as sorted lists (order doesn't matter at the
  // database layer either).
  const submittedInterests = Array.from(form.areas_of_interest).sort();
  const existingInterests = (existing.areas_of_interest ?? []).slice().sort();
  if (submittedInterests.join("|") !== existingInterests.join("|")) {
    out.areas_of_interest = submittedInterests;
  }

  // Story
  if (!sameStr(form.story, existing.story)) {
    out.story = form.story.trim();
  }

  // Support needed (Session 48a — priority columns)
  if (form.support_type !== (existing.support_type ?? "")) {
    out.support_type = form.support_type;
  }
  const submittedCost = form.monthly_cost.trim()
    ? Number(form.monthly_cost)
    : null;
  if (submittedCost !== existing.monthly_cost) {
    out.monthly_cost = submittedCost;
  }
  if (form.priority_support !== (existing.priority_support ?? "none")) {
    out.priority_support = form.priority_support;
  }
  if (!sameStr(form.priority_notes, existing.priority_notes)) {
    out.priority_notes = form.priority_notes.trim();
  }

  // Health
  if (form.blood_group !== (existing.blood_group ?? "")) {
    out.blood_group = form.blood_group || undefined;
  }
  if (form.vaccination_status !== (existing.vaccination_status ?? "")) {
    out.vaccination_status = form.vaccination_status || undefined;
  }
  if (form.last_medical_checkup !== (existing.last_medical_checkup ?? "")) {
    out.last_medical_checkup = form.last_medical_checkup || null;
  }
  if (form.disability_status !== (existing.disability_status ?? "")) {
    out.disability_status = form.disability_status || undefined;
  }
  if (!sameStr(form.disability_notes, existing.disability_notes)) {
    out.disability_notes = form.disability_notes.trim();
  }

  // Family (Session 48a — added parent_loss)
  if (form.parent_loss !== (existing.parent_loss ?? "")) {
    out.parent_loss = form.parent_loss || undefined;
  }
  const submittedSiblings = numFor(form.siblings_count);
  if (submittedSiblings !== existing.siblings_count) {
    out.siblings_count = submittedSiblings;
  }
  const submittedSiblingPos = numFor(form.sibling_position);
  if (submittedSiblingPos !== existing.sibling_position) {
    out.sibling_position = submittedSiblingPos;
  }
  if (!sameStr(form.siblings_notes, existing.siblings_notes)) {
    out.siblings_notes = form.siblings_notes.trim();
  }
  const submittedHouseholdSize = numFor(form.household_size);
  if (submittedHouseholdSize !== existing.household_size) {
    out.household_size = submittedHouseholdSize;
  }

  // Socioeconomic
  if (
    form.household_income_source !== (existing.household_income_source ?? "")
  ) {
    out.household_income_source = form.household_income_source || undefined;
  }
  const submittedIncome = numFor(form.monthly_household_income_bdt);
  if (submittedIncome !== existing.monthly_household_income_bdt) {
    out.monthly_household_income_bdt = submittedIncome;
  }

  // Guardian (Session 48a — added employment_type, phones)
  if (form.guardian_relationship !== (existing.guardian_relationship ?? "")) {
    out.guardian_relationship = form.guardian_relationship || undefined;
  }
  if (
    form.guardian_employment_type !==
    (existing.guardian_employment_type ?? "")
  ) {
    out.guardian_employment_type = form.guardian_employment_type || undefined;
  }
  if (!sameStr(form.guardian_employment, existing.guardian_employment)) {
    out.guardian_employment = form.guardian_employment.trim();
  }
  if (!sameStr(form.guardian_phone, existing.guardian_phone)) {
    out.guardian_phone = form.guardian_phone.trim();
  }
  if (!sameStr(form.guardian_phone_alt, existing.guardian_phone_alt)) {
    out.guardian_phone_alt = form.guardian_phone_alt.trim();
  }
  if (
    !sameStr(form.guardian_summary_internal, existing.guardian_summary_internal)
  ) {
    out.guardian_summary_internal = form.guardian_summary_internal.trim();
  }
  if (
    !sameStr(form.additional_family_notes, existing.additional_family_notes)
  ) {
    out.additional_family_notes = form.additional_family_notes.trim();
  }

  // Submission date (Session 48a — was "Field visit" / last_visit_date;
  // form binds to submission_date now, server mirrors to last_visit_date)
  const existingSubmission = existing.submission_date ?? existing.last_visit_date ?? "";
  if (form.submission_date !== existingSubmission) {
    out.submission_date = form.submission_date || null;
  }

  return out;
}
