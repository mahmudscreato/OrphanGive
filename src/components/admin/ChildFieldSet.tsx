// Shared admin child field-set — the full 39-field editable set, grouped
// (Identity/Photo/Location/Education/Story/Care/Health/Family/Guardian/Visit).
//
// Backs BOTH AdminChildCreateForm (seeded empty, POSTs /api/admin/children)
// and AdminChildEditForm (seeded from current values, POSTs
// /api/admin/children/[id]/edit) so create + edit render IDENTICAL fields.
//
// The parent owns the network call: it passes onSubmit(payload) which does
// the fetch + redirect and returns an error string (or null on success).
// Server behaviour is unchanged — create requires display_name
// (createChildAsAdmin), edit rejects blanking required fields
// (editChildAsAdmin). This is a UI component only.
//
// NOTE: this is an ADMIN component — the DI ChildForm is untouched.

"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { BANGLADESH_DIVISIONS } from "@/lib/children-data";
import type { BdDistrictOption } from "@/lib/di-children";
import { PhotoUploadField } from "@/components/di/PhotoUploadField";
import {
  AREA_OF_INTEREST_OPTIONS,
  BLOOD_GROUP_OPTIONS,
  DISABILITY_STATUS_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  GENDER_OPTIONS,
  GUARDIAN_EMPLOYMENT_TYPE_OPTIONS,
  GUARDIAN_RELATIONSHIP_OPTIONS,
  HOUSEHOLD_INCOME_SOURCE_OPTIONS,
  PARENT_LOSS_OPTIONS,
  PRIORITY_SUPPORT_OPTIONS,
  SUPPORT_TYPE_OPTIONS,
  VACCINATION_STATUS_OPTIONS,
} from "@/lib/form-constants";

type Opt = { value: string; label: string };
type FormState = Record<string, string>;

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft/40 transition-all disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.12em] uppercase text-slate font-medium mb-1.5";
const errorClass = "mt-1 text-[12px] text-[#A02B2B]";

// Every scalar field the admin edit endpoint accepts. Blank string = unset.
const EMPTY: FormState = {
  display_name: "",
  gender: "",
  date_of_birth: "",
  bd_division: "",
  bd_district: "",
  district_internal: "",
  permanent_address: "",
  education_level: "",
  class_grade: "",
  school_name_raw: "",
  story: "",
  support_type: "",
  monthly_cost: "",
  priority_support: "",
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
  guardian_full_name_encrypted: "",
  guardian_relationship: "",
  guardian_employment_type: "",
  guardian_employment: "",
  guardian_phone: "",
  guardian_phone_alt: "",
  guardian_summary_internal: "",
  additional_family_notes: "",
  last_visit_date: "",
  submission_date: "",
};

// Numeric fields (sent as integers). All others are strings/enums/dates.
const NUM_FIELDS = new Set([
  "monthly_cost",
  "siblings_count",
  "sibling_position",
  "household_size",
  "monthly_household_income_bdt",
]);

// Schema-non-nullable fields — cannot be cleared to null (only present or
// absent). Matches adminChildFieldsSchema: these use .optional() without
// .nullable(). We never send them as null.
const NON_NULLABLE = new Set([
  "display_name",
  "story",
  "guardian_summary_internal",
]);

export interface ChildInitialValues {
  /** Seed for the scalar fields (from the current child on edit). */
  fields?: Partial<FormState>;
  areas?: string[];
  photoUuid?: string | null;
  photoConsent?: boolean;
}

export function ChildFieldSet({
  districts,
  initial = {},
  mode,
  submitLabel,
  submittingLabel,
  cancelHref,
  intro,
  onSubmit,
}: {
  districts: BdDistrictOption[];
  initial?: ChildInitialValues;
  mode: "create" | "edit";
  submitLabel: string;
  submittingLabel: string;
  cancelHref: string;
  intro?: React.ReactNode;
  /** Returns an error string to display, or null on success (parent navigates). */
  onSubmit: (payload: Record<string, unknown>) => Promise<string | null>;
}) {
  const isEdit = mode === "edit";
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => {
    const seed: FormState = { ...EMPTY };
    const f = initial.fields ?? {};
    for (const k of Object.keys(EMPTY)) {
      const v = f[k];
      if (typeof v === "string") seed[k] = v;
    }
    return seed;
  });
  const [areas, setAreas] = useState<string[]>(initial.areas ?? []);
  const initialPhotoUuid = initial.photoUuid ?? null;
  const [photoUuid, setPhotoUuid] = useState<string | null>(initialPhotoUuid);
  const [photoConsent, setPhotoConsent] = useState(initial.photoConsent ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) {
      setErrors((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    }
  }

  const districtOptions = useMemo(
    () =>
      form.bd_division
        ? districts
            .filter((d) => d.division === form.bd_division)
            .map((d) => ({ value: d.code, label: d.name }))
        : [],
    [districts, form.bd_division],
  );

  const priorityActive =
    form.priority_support !== "" && form.priority_support !== "none";
  const photoChanged = photoUuid !== initialPhotoUuid && !!photoUuid;

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.display_name.trim()) e.display_name = "Required.";
    const story = form.story.trim();
    if (story.length > 0 && story.length < 50)
      e.story = "Story must be at least 50 characters (or leave blank).";
    if (priorityActive && !form.priority_notes.trim())
      e.priority_notes = "Required when priority is standard or urgent.";
    const guardianPhone = form.guardian_phone.trim();
    if (guardianPhone.length > 0 && guardianPhone.length < 7)
      e.guardian_phone = "Enter a valid phone number.";
    // Consent required only when a NEW photo is uploaded (create, or replace
    // on edit). An unchanged existing photo isn't re-consented here.
    if (photoChanged && !photoConsent)
      e.photo_consent = "Tick the consent box to use this photo, or remove it.";
    for (const nk of NUM_FIELDS) {
      const raw = form[nk].trim();
      if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0))
        e[nk] = "Whole number ≥ 0.";
    }
    return e;
  }

  function buildPayload(): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    const initFields = initial.fields ?? {};

    for (const k of Object.keys(EMPTY)) {
      const v = form[k].trim();
      if (v !== "") {
        p[k] = NUM_FIELDS.has(k) ? Math.round(Number(v)) : v;
      } else if (
        isEdit &&
        !NON_NULLABLE.has(k) &&
        (initFields[k] ?? "").trim() !== ""
      ) {
        // Edit only: a previously-set NULLABLE field was cleared → send null
        // so editChildAsAdmin clears it (required fields are guarded there).
        p[k] = null;
      }
      // else: omit (create-blank, or non-nullable cleared → left unchanged)
    }

    // areas_of_interest: send when changed (edit) / present (create).
    const initAreas = initial.areas ?? [];
    const areasChanged =
      areas.length !== initAreas.length ||
      areas.some((a) => !initAreas.includes(a));
    if (isEdit ? areasChanged : areas.length > 0) {
      p.areas_of_interest = areas.length > 0 ? areas : null;
    }

    // Photo + consent only when a new photo was uploaded (create/replace).
    if (photoChanged) {
      p.Photo = photoUuid;
      p.photo_consent = photoConsent;
    }
    return p;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    startTransition(async () => {
      const err = await onSubmit(buildPayload());
      if (err) setServerError(err);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {serverError ? (
        <div
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}

      {intro}

      <Section title="Identity">
        <Text label="First / display name *" k="display_name" form={form} set={set} err={errors} placeholder="e.g. Fahim" />
        <SelectField label="Gender" k="gender" form={form} set={set} opts={GENDER_OPTIONS} />
        <DateField label="Date of birth" k="date_of_birth" form={form} set={set} />
      </Section>

      {/* Profile photo — Tier-1 public, but ONLY after publish + consent.
          Uploads via the admin endpoint (reuses the DI uploader component +
          the same server-side file handling). Private until published. */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
        <h2 className="font-display text-[17px] text-ink mb-1">Profile photo</h2>
        <p className="text-[12.5px] text-ink-soft mb-4">
          {isEdit
            ? "Upload a new file to replace the current photo. Shown to donors only after the child is published and consent is recorded."
            : "Optional. JPEG / PNG / WebP, up to 5 MB. Shown to donors only after the child is published and consent is recorded — private until then."}
        </p>
        <PhotoUploadField
          currentPhotoUuid={photoUuid}
          onUuidChange={setPhotoUuid}
          uploadUrl="/api/admin/uploads/photo"
        />
        {photoChanged ? (
          <label className="mt-4 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={photoConsent}
              onChange={(e) => setPhotoConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft"
            />
            <span className="text-[13.5px] text-ink leading-snug">
              The parent / guardian has consented to this photo being shown to
              donors.{" "}
              <span className="text-[#A02B2B]">Required to keep this photo.</span>
            </span>
          </label>
        ) : null}
        {errors.photo_consent ? (
          <p className={errorClass}>{errors.photo_consent}</p>
        ) : null}
      </section>

      <Section title="Location">
        <SelectField
          label="Division"
          k="bd_division"
          form={form}
          set={(k, v) => {
            set(k, v);
            set("bd_district", ""); // reset district on division change
          }}
          opts={BANGLADESH_DIVISIONS as unknown as readonly Opt[]}
        />
        <SelectField
          label="District"
          k="bd_district"
          form={form}
          set={set}
          opts={districtOptions}
          disabled={!form.bd_division}
          placeholder={form.bd_division ? "Select…" : "Pick a division first"}
        />
        <Text label="Full address (internal)" k="district_internal" form={form} set={set} placeholder="House / road / village / area" />
        <TextArea label="Permanent address (internal)" k="permanent_address" form={form} set={set} />
      </Section>

      <Section title="Education">
        <SelectField label="Education level" k="education_level" form={form} set={set} opts={EDUCATION_LEVEL_OPTIONS} />
        <Text label="Class / grade" k="class_grade" form={form} set={set} placeholder="e.g. Class 5" />
        <Text label="School name (free text)" k="school_name_raw" form={form} set={set} />
        <CheckboxGrid label="Areas of interest" opts={AREA_OF_INTEREST_OPTIONS} value={areas} onChange={setAreas} />
      </Section>

      <Section title="Story (donor-facing)">
        <TextArea label="Story" k="story" form={form} set={set} err={errors} rows={6} placeholder="At least 50 characters. Warm, without identifying details." full />
      </Section>

      <Section title="Support needed">
        <SelectField label="Support type" k="support_type" form={form} set={set} opts={SUPPORT_TYPE_OPTIONS} />
        <Num label="Cost (BDT/month)" k="monthly_cost" form={form} set={set} err={errors} placeholder="e.g. 1500" />
        <SelectField label="Priority" k="priority_support" form={form} set={set} opts={PRIORITY_SUPPORT_OPTIONS} />
        {priorityActive ? (
          <TextArea label="Priority notes *" k="priority_notes" form={form} set={set} err={errors} />
        ) : null}
      </Section>

      <Section title="Health">
        <SelectField label="Blood group" k="blood_group" form={form} set={set} opts={BLOOD_GROUP_OPTIONS} />
        <SelectField label="Vaccination status" k="vaccination_status" form={form} set={set} opts={VACCINATION_STATUS_OPTIONS} />
        <DateField label="Last medical checkup" k="last_medical_checkup" form={form} set={set} />
        <SelectField label="Disability status" k="disability_status" form={form} set={set} opts={DISABILITY_STATUS_OPTIONS} />
        <TextArea label="Disability notes" k="disability_notes" form={form} set={set} />
      </Section>

      <Section title="Family">
        <SelectField label="Who has the child lost?" k="parent_loss" form={form} set={set} opts={PARENT_LOSS_OPTIONS} />
        <Num label="Siblings (count)" k="siblings_count" form={form} set={set} err={errors} />
        <Num label="Sibling position" k="sibling_position" form={form} set={set} err={errors} />
        <Num label="Household size" k="household_size" form={form} set={set} err={errors} />
        <SelectField label="Income source" k="household_income_source" form={form} set={set} opts={HOUSEHOLD_INCOME_SOURCE_OPTIONS} />
        <Num label="Monthly household income (BDT)" k="monthly_household_income_bdt" form={form} set={set} err={errors} />
        <TextArea label="Siblings notes" k="siblings_notes" form={form} set={set} />
      </Section>

      <Section title="Guardian">
        <Text label="Guardian's full name (private — reveal-gated)" k="guardian_full_name_encrypted" form={form} set={set} placeholder="Only shown to donors via an approved reveal" />
        <SelectField label="Relationship to child" k="guardian_relationship" form={form} set={set} opts={GUARDIAN_RELATIONSHIP_OPTIONS} />
        <SelectField label="Guardian's work type" k="guardian_employment_type" form={form} set={set} opts={GUARDIAN_EMPLOYMENT_TYPE_OPTIONS} />
        <Text label="Work detail" k="guardian_employment" form={form} set={set} placeholder="e.g. tea stall" />
        <Text label="Guardian phone (internal)" k="guardian_phone" form={form} set={set} err={errors} placeholder="+8801XXXXXXXXX" />
        <Text label="Secondary phone" k="guardian_phone_alt" form={form} set={set} />
        <TextArea label="Guardian context (internal)" k="guardian_summary_internal" form={form} set={set} full />
        <TextArea label="Additional family notes (internal)" k="additional_family_notes" form={form} set={set} full />
      </Section>

      <Section title="Visit">
        <DateField label="Last visit date" k="last_visit_date" form={form} set={set} />
        <DateField label="Submission date" k="submission_date" form={form} set={set} />
      </Section>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-tangerine text-white font-medium text-[15px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {pending ? submittingLabel : submitLabel}
        </button>
        <a href={cancelHref} className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors">
          Cancel
        </a>
      </div>
    </form>
  );
}

// ─── Field primitives ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6">
      <h2 className="font-display text-[17px] text-ink mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

type FieldProps = {
  label: string;
  k: string;
  form: FormState;
  set: (k: string, v: string) => void;
  err?: Record<string, string>;
  placeholder?: string;
};

function Text({ label, k, form, set, err, placeholder }: FieldProps) {
  return (
    <div>
      <label className={labelClass} htmlFor={k}>{label}</label>
      <input id={k} type="text" value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} placeholder={placeholder} />
      {err?.[k] ? <p className={errorClass}>{err[k]}</p> : null}
    </div>
  );
}

function Num({ label, k, form, set, err, placeholder }: FieldProps) {
  return (
    <div>
      <label className={labelClass} htmlFor={k}>{label}</label>
      <input id={k} type="number" min={0} value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} placeholder={placeholder} />
      {err?.[k] ? <p className={errorClass}>{err[k]}</p> : null}
    </div>
  );
}

function DateField({ label, k, form, set }: FieldProps) {
  return (
    <div>
      <label className={labelClass} htmlFor={k}>{label}</label>
      <input id={k} type="date" value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} />
    </div>
  );
}

function TextArea({
  label,
  k,
  form,
  set,
  err,
  rows = 3,
  placeholder,
  full,
}: FieldProps & { rows?: number; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : undefined}>
      <label className={labelClass} htmlFor={k}>{label}</label>
      <textarea id={k} rows={rows} value={form[k]} onChange={(e) => set(k, e.target.value)} className={inputClass} placeholder={placeholder} />
      {err?.[k] ? <p className={errorClass}>{err[k]}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  k,
  form,
  set,
  opts,
  disabled,
  placeholder = "Select…",
}: FieldProps & { opts: readonly Opt[]; disabled?: boolean }) {
  return (
    <div>
      <label className={labelClass} htmlFor={k}>{label}</label>
      <select id={k} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={disabled} className={`${inputClass} appearance-none bg-white pr-9`}>
        <option value="">{placeholder}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function CheckboxGrid({
  label,
  opts,
  value,
  onChange,
}: {
  label: string;
  opts: readonly Opt[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div className="md:col-span-2">
      <span className={labelClass}>{label}</span>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
        {opts.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13.5px] text-ink cursor-pointer">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
