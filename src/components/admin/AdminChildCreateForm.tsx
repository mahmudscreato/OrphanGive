// Admin direct-CREATE child form.
//
// Covers the full admin-editable field set (AdminChildEditableFields). POSTs
// to /api/admin/children which writes a child row at status='awaiting_intake'
// (NOT public), attributed to the creating admin. On success the admin is
// routed to /admin/children/[id] to review and PUBLISH via the existing
// reactivate action (which enforces the required-field gate).
//
// Not covered here (added later, separate flows): the child Photo +
// photo_consent, verification documents, intake photos, and the school
// picker (educational_organization). school_name_raw captures the school as
// free text in the meantime.

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { BANGLADESH_DIVISIONS } from "@/lib/children-data";
import type { BdDistrictOption } from "@/lib/di-children";
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

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft/40 transition-all disabled:opacity-60";
const labelClass =
  "block font-mono text-[11px] tracking-[0.12em] uppercase text-slate font-medium mb-1.5";
const errorClass = "mt-1 text-[12px] text-[#A02B2B]";

// Flat string state for every scalar field; areas_of_interest is separate.
type FormState = Record<string, string>;

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

export function AdminChildCreateForm({
  districts,
}: {
  districts: BdDistrictOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [areas, setAreas] = useState<string[]>([]);
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

  // District options cascade off the selected division.
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
    for (const nk of [
      "monthly_cost",
      "siblings_count",
      "sibling_position",
      "household_size",
      "monthly_household_income_bdt",
    ]) {
      const raw = form[nk].trim();
      if (raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0))
        e[nk] = "Whole number ≥ 0.";
    }
    return e;
  }

  function buildPayload(): Record<string, unknown> {
    const p: Record<string, unknown> = { display_name: form.display_name.trim() };
    const str = (k: string) => {
      const v = form[k].trim();
      if (v) p[k] = v;
    };
    const num = (k: string) => {
      const v = form[k].trim();
      if (v !== "") p[k] = Math.round(Number(v));
    };
    [
      "gender",
      "date_of_birth",
      "bd_division",
      "bd_district",
      "district_internal",
      "permanent_address",
      "education_level",
      "class_grade",
      "school_name_raw",
      "story",
      "support_type",
      "priority_support",
      "priority_notes",
      "blood_group",
      "vaccination_status",
      "last_medical_checkup",
      "disability_status",
      "disability_notes",
      "parent_loss",
      "siblings_notes",
      "household_income_source",
      "guardian_relationship",
      "guardian_employment_type",
      "guardian_employment",
      "guardian_phone",
      "guardian_phone_alt",
      "guardian_summary_internal",
      "additional_family_notes",
      "last_visit_date",
      "submission_date",
    ].forEach(str);
    [
      "monthly_cost",
      "siblings_count",
      "sibling_position",
      "household_size",
      "monthly_household_income_bdt",
    ].forEach(num);
    if (areas.length > 0) p.areas_of_interest = areas;
    return p;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/children", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const data = (await res.json().catch(() => ({}))) as {
          childId?: string;
          error?: string;
          message?: string;
          issues?: Array<{ path?: string; message?: string }>;
        };
        if (!res.ok || !data.childId) {
          setServerError(
            data.issues?.[0]
              ? `${data.issues[0].path}: ${data.issues[0].message}`
              : data.message ?? "Couldn't create the child. Try again.",
          );
          return;
        }
        // Land on the detail page to review + publish.
        router.push(`/admin/children/${data.childId}`);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      {serverError ? (
        <div
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        This creates the child as <strong>Awaiting intake</strong> — not public
        and not sponsorable. Review on the next screen, then <strong>Publish</strong>{" "}
        to make it live (required fields are enforced at publish).
      </p>

      <Section title="Identity">
        <Text label="First / display name *" k="display_name" form={form} set={set} err={errors} placeholder="e.g. Fahim" />
        <SelectField label="Gender" k="gender" form={form} set={set} opts={GENDER_OPTIONS} />
        <DateField label="Date of birth" k="date_of_birth" form={form} set={set} />
      </Section>

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
          {pending ? "Creating…" : "Create child (awaiting intake)"}
        </button>
        <a href="/admin/children" className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors">
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
