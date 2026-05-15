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

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { PhotoUploadField } from "./PhotoUploadField";
import { BdDistrictField } from "./BdDistrictField";
import type { BdDistrictOption } from "@/lib/di-children";

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

const GUARDIAN_RELATIONSHIP_OPTIONS = [
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
] as const;

// ─── Shared style tokens ────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[120px] resize-y leading-relaxed`;
const selectClass = inputClass;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

// ─── Public types ───────────────────────────────────────────────────

export interface ChildFormDivisionOption {
  code: string;
  name: string;
}

// Mirrors ChildEditSnapshot from di-children.ts but kept here as the
// component's contract so the form module is self-describing.
export interface ChildFormExistingChild {
  id: string;
  display_name: string;
  gender: string | null;
  date_of_birth: string | null;
  photo_consent: boolean | null;
  current_photo_uuid: string | null;
  bd_division_code: string | null;
  bd_district_code: string | null;
  district_internal: string | null;
  education_level: string | null;
  class_grade: string | null;
  areas_of_interest: string | null;
  story: string;
  support_type: string | null;
  monthly_cost: number | null;
  blood_group: string | null;
  vaccination_status: string | null;
  last_medical_checkup: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  household_income_source: string | null;
  monthly_household_income_bdt: number | null;
  guardian_relationship: string | null;
  guardian_employment: string | null;
  guardian_summary_internal: string | null;
  additional_family_notes: string | null;
  last_visit_date: string | null;
}

export type ChildFormMode = "create" | "edit";

export interface ChildFormProps {
  mode: ChildFormMode;
  divisions: ChildFormDivisionOption[];
  districts: BdDistrictOption[];
  existing?: ChildFormExistingChild;
}

// ─── Internal form state ────────────────────────────────────────────

interface FormState {
  // Identity
  display_name: string;
  gender: string;
  date_of_birth: string;
  photo_uuid: string | null;
  photo_consent: boolean;
  // Location
  bd_division: string;
  bd_district: string;
  district_internal: string;
  // Education
  education_level: string;
  class_grade: string;
  areas_of_interest: string;
  // Story
  story: string;
  // Support
  support_type: string;
  monthly_cost: string; // text in form, parsed on submit
  // Health
  blood_group: string;
  vaccination_status: string;
  last_medical_checkup: string;
  disability_status: string;
  disability_notes: string;
  // Family
  siblings_count: string;
  sibling_position: string;
  siblings_notes: string;
  household_size: string;
  // Socioeconomic
  household_income_source: string;
  monthly_household_income_bdt: string;
  // Guardian
  guardian_relationship: string;
  guardian_employment: string;
  guardian_summary_internal: string;
  additional_family_notes: string;
  // Field visit
  last_visit_date: string;
}

function blankState(): FormState {
  return {
    display_name: "",
    gender: "",
    date_of_birth: "",
    photo_uuid: null,
    photo_consent: false, // Always default FALSE on every load.
    bd_division: "",
    bd_district: "",
    district_internal: "",
    education_level: "",
    class_grade: "",
    areas_of_interest: "",
    story: "",
    support_type: "",
    monthly_cost: "",
    blood_group: "",
    vaccination_status: "",
    last_medical_checkup: "",
    disability_status: "",
    disability_notes: "",
    siblings_count: "",
    sibling_position: "",
    siblings_notes: "",
    household_size: "",
    household_income_source: "",
    monthly_household_income_bdt: "",
    guardian_relationship: "",
    guardian_employment: "",
    guardian_summary_internal: "",
    additional_family_notes: "",
    last_visit_date: "",
  };
}

function stateFromExisting(c: ChildFormExistingChild): FormState {
  return {
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
    education_level: c.education_level ?? "",
    class_grade: c.class_grade ?? "",
    areas_of_interest: c.areas_of_interest ?? "",
    story: c.story ?? "",
    support_type: c.support_type ?? "",
    monthly_cost: c.monthly_cost === null ? "" : String(c.monthly_cost),
    blood_group: c.blood_group ?? "",
    vaccination_status: c.vaccination_status ?? "",
    last_medical_checkup: c.last_medical_checkup ?? "",
    disability_status: c.disability_status ?? "",
    disability_notes: c.disability_notes ?? "",
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
    guardian_employment: c.guardian_employment ?? "",
    guardian_summary_internal: c.guardian_summary_internal ?? "",
    additional_family_notes: c.additional_family_notes ?? "",
    last_visit_date: c.last_visit_date ?? "",
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
}: ChildFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(
    existing ? stateFromExisting(existing) : blankState(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
    if (errors[key as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as string];
        return next;
      });
    }
  }

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};

    if (mode === "create") {
      // Required-on-create per Mahmud's V1 decision.
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
      if (!form.photo_uuid) e.Photo = "A photo is required for new children.";
    } else {
      // Edit: shape-only checks on non-empty values.
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

    if (form.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) {
      e.date_of_birth = "Use the date picker.";
    }
    if (
      form.last_visit_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(form.last_visit_date)
    ) {
      e.last_visit_date = "Use the date picker.";
    }
    if (
      form.last_medical_checkup &&
      !/^\d{4}-\d{2}-\d{2}$/.test(form.last_medical_checkup)
    ) {
      e.last_medical_checkup = "Use the date picker.";
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
          // Required
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
          // Optional — included only when non-empty
          ...(form.gender ? { gender: form.gender } : {}),
          photo_consent: form.photo_consent,
          ...(form.education_level.trim()
            ? { education_level: form.education_level.trim() }
            : {}),
          ...(form.class_grade.trim()
            ? { class_grade: form.class_grade.trim() }
            : {}),
          ...(form.areas_of_interest.trim()
            ? { areas_of_interest: form.areas_of_interest.trim() }
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
          ...(form.guardian_employment.trim()
            ? { guardian_employment: form.guardian_employment.trim() }
            : {}),
          ...(form.additional_family_notes.trim()
            ? { additional_family_notes: form.additional_family_notes.trim() }
            : {}),
          ...(form.last_visit_date
            ? { last_visit_date: form.last_visit_date }
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

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const localErrors = clientValidate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    startTransition(async () => {
      try {
        const body = buildSubmitBody();
        const res = await fetch("/api/di/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            field?: string;
            divisionCode?: string;
            issues?: Array<{ path?: string; message?: string }>;
          };
          if (errBody.error === "no_changes") {
            setServerError(
              "No fields have actually changed. Edit something before submitting.",
            );
          } else if (errBody.error === "division_not_allowed") {
            setErrors((e) => ({
              ...e,
              bd_division:
                "You're not assigned to this division. Ask your admin to enable it.",
            }));
          } else if (
            errBody.error === "missing_required_field" &&
            errBody.field
          ) {
            setErrors((e) => ({
              ...e,
              [errBody.field as string]: "Required.",
            }));
          } else if (errBody.error === "invalid_value" && errBody.field) {
            setErrors((e) => ({
              ...e,
              [errBody.field as string]: errBody.message ?? "Invalid value.",
            }));
          } else if (errBody.error === "not_found") {
            setServerError(
              "This child isn't in your care anymore. Refresh and try again.",
            );
          } else if (errBody.error === "bad_request" && errBody.issues) {
            const zodErrors: Record<string, string> = {};
            for (const i of errBody.issues) {
              const path = i.path?.split(".").pop() ?? "";
              if (path) zodErrors[path] = i.message ?? "Invalid.";
            }
            if (Object.keys(zodErrors).length > 0) {
              setErrors((e) => ({ ...e, ...zodErrors }));
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
      {/* Section 1 — Identity */}
      <Section title="Identity">
        <Field>
          <label className={labelClass} htmlFor="display_name">
            Display name *
          </label>
          <input
            id="display_name"
            type="text"
            className={inputClass}
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            placeholder="e.g. Fahim Khan"
            disabled={pending}
          />
          <p className={helperClass}>Use what&apos;s safe to share publicly.</p>
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

      {/* Section 2 — Location */}
      <Section title="Location">
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
            District (internal) {mode === "create" ? "*" : null}
          </label>
          <input
            id="district_internal"
            type="text"
            className={inputClass}
            value={form.district_internal}
            onChange={(e) => set("district_internal", e.target.value)}
            placeholder="Optional internal label, e.g. neighbourhood"
            disabled={pending}
          />
          <p className={helperClass}>Not shown to donors.</p>
          {errors.district_internal ? (
            <p className={errorClass}>{errors.district_internal}</p>
          ) : null}
        </Field>
      </Section>

      {/* Section 3 — Education */}
      <Section title="Education">
        <FieldRow>
          <Field>
            <label className={labelClass} htmlFor="education_level">
              Education level
            </label>
            <input
              id="education_level"
              type="text"
              className={inputClass}
              value={form.education_level}
              onChange={(e) => set("education_level", e.target.value)}
              placeholder="e.g. Primary / Madrasa / Vocational"
              disabled={pending}
            />
          </Field>

          <Field>
            <label className={labelClass} htmlFor="class_grade">
              Class / grade
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
          <label className={labelClass} htmlFor="areas_of_interest">
            Areas of interest
          </label>
          <textarea
            id="areas_of_interest"
            className={textareaClass}
            value={form.areas_of_interest}
            onChange={(e) => set("areas_of_interest", e.target.value)}
            placeholder="What they enjoy or want to learn. Shown to donors."
            disabled={pending}
            rows={3}
          />
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
          />
          <p className={helperClass}>
            Donors see this. Aim for 2–4 short paragraphs.{" "}
            {form.story.length > 0 ? `${form.story.length}/2000` : null}
          </p>
          {errors.story ? <p className={errorClass}>{errors.story}</p> : null}
        </Field>
      </Section>

      {/* Section 5 — Support plan */}
      <Section title="Support plan">
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
              Monthly cost (BDT) *
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
            />
            <p className={helperClass}>Approximate monthly need.</p>
            {errors.monthly_cost ? (
              <p className={errorClass}>{errors.monthly_cost}</p>
            ) : null}
          </Field>
        </FieldRow>
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

      {/* Section 7 — Family */}
      <Section title="Family">
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
        <FieldRow>
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

          <Field>
            <label className={labelClass} htmlFor="guardian_employment">
              Guardian&apos;s work
            </label>
            <input
              id="guardian_employment"
              type="text"
              className={inputClass}
              value={form.guardian_employment}
              onChange={(e) => set("guardian_employment", e.target.value)}
              placeholder="e.g. Day labor / Garment factory / Homemaker"
              disabled={pending}
            />
          </Field>
        </FieldRow>

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

      {/* Section 10 — Field visit */}
      <Section title="Field visit">
        <Field>
          <label className={labelClass} htmlFor="last_visit_date">
            Last visit date
          </label>
          <input
            id="last_visit_date"
            type="date"
            className={inputClass}
            value={form.last_visit_date}
            onChange={(e) => set("last_visit_date", e.target.value)}
            disabled={pending}
          />
          <p className={helperClass}>Optional. When you last met this child.</p>
          {errors.last_visit_date ? (
            <p className={errorClass}>{errors.last_visit_date}</p>
          ) : null}
        </Field>
      </Section>

      {/* Server error banner */}
      {serverError ? (
        <div className="rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#9A2424]">
          {serverError}
        </div>
      ) : null}

      {/* Submit */}
      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
        <a
          href={mode === "edit" ? `/di/children/${existing!.id}` : "/di/children"}
          className="text-center md:text-left text-[14px] text-slate hover:text-tangerine-deeper transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
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

  // Location
  if (form.bd_division !== (existing.bd_division_code ?? "")) {
    out.bd_division = form.bd_division;
  }
  if (form.bd_district !== (existing.bd_district_code ?? "")) {
    out.bd_district = form.bd_district;
  }
  if (!sameStr(form.district_internal, existing.district_internal)) {
    out.district_internal = form.district_internal.trim();
  }

  // Education + interests
  if (!sameStr(form.education_level, existing.education_level)) {
    out.education_level = form.education_level.trim() || null;
  }
  if (!sameStr(form.class_grade, existing.class_grade)) {
    out.class_grade = form.class_grade.trim();
  }
  if (!sameStr(form.areas_of_interest, existing.areas_of_interest)) {
    out.areas_of_interest = form.areas_of_interest.trim();
  }

  // Story
  if (!sameStr(form.story, existing.story)) {
    out.story = form.story.trim();
  }

  // Support plan
  if (form.support_type !== (existing.support_type ?? "")) {
    out.support_type = form.support_type;
  }
  const submittedCost = form.monthly_cost.trim()
    ? Number(form.monthly_cost)
    : null;
  if (submittedCost !== existing.monthly_cost) {
    out.monthly_cost = submittedCost;
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

  // Family
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

  // Guardian
  if (form.guardian_relationship !== (existing.guardian_relationship ?? "")) {
    out.guardian_relationship = form.guardian_relationship || undefined;
  }
  if (!sameStr(form.guardian_employment, existing.guardian_employment)) {
    out.guardian_employment = form.guardian_employment.trim();
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

  // Field visit
  if (form.last_visit_date !== (existing.last_visit_date ?? "")) {
    out.last_visit_date = form.last_visit_date || null;
  }

  return out;
}
