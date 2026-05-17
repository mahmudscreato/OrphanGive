// Session 44 — Shared Edit/Add child form (client).
//
// One component, two modes:
//   - mode='edit'   pre-fills from `existing`; bd_division dropdown is
//                   the full division list; submitting a no-op diff
//                   surfaces the server's NoChangesError as a friendly
//                   inline message
//   - mode='create' starts blank; bd_division dropdown is restricted
//                   to `allowedDivisions`; photo is required; required
//                   fields are enforced client-side
//
// On success: redirects to /di/submissions?just_submitted=<id> so the
// Submissions page can render the success banner.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { PhotoUploadField } from "./PhotoUploadField";

// ─── Static option lists ────────────────────────────────────────────

const SUPPORT_TYPE_OPTIONS = [
  { value: "education", label: "Education" },
  { value: "food", label: "Food" },
  { value: "healthcare", label: "Healthcare" },
  { value: "clothing", label: "Clothing" },
  { value: "general_care", label: "General care" },
  { value: "other", label: "Other" },
] as const;

// ─── Shared style tokens (mirrors donor ProfileSections.tsx) ────────

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[140px] resize-y leading-relaxed`;
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

export interface ChildFormExistingChild {
  id: string;
  display_name: string;
  date_of_birth: string | null;
  bd_division_code: string | null;
  district_internal: string | null;
  support_type: string | null;
  monthly_cost: number | null;
  education_level: string | null;
  story: string;
  guardian_summary_internal: string | null;
  last_visit_date: string | null;
  current_photo_uuid: string | null;
}

export type ChildFormMode = "create" | "edit";

export interface ChildFormProps {
  mode: ChildFormMode;
  divisions: ChildFormDivisionOption[];
  existing?: ChildFormExistingChild;
  // For create mode the parent passes only the allowed-divisions list;
  // for edit we want the full eight, but the same prop carries them.
}

// ─── Internal form state shape ──────────────────────────────────────

interface FormState {
  display_name: string;
  date_of_birth: string;
  bd_division: string;
  district_internal: string;
  support_type: string;
  monthly_cost: string; // text in form, parsed on submit
  education_level: string;
  story: string;
  guardian_summary_internal: string;
  last_visit_date: string;
  photo_uuid: string | null;
}

function blankState(): FormState {
  return {
    display_name: "",
    date_of_birth: "",
    bd_division: "",
    district_internal: "",
    support_type: "",
    monthly_cost: "",
    education_level: "",
    story: "",
    guardian_summary_internal: "",
    last_visit_date: "",
    photo_uuid: null,
  };
}

function stateFromExisting(c: ChildFormExistingChild): FormState {
  return {
    display_name: c.display_name ?? "",
    date_of_birth: c.date_of_birth ?? "",
    bd_division: c.bd_division_code ?? "",
    district_internal: c.district_internal ?? "",
    support_type: c.support_type ?? "",
    monthly_cost: c.monthly_cost === null ? "" : String(c.monthly_cost),
    education_level: c.education_level ?? "",
    story: c.story ?? "",
    guardian_summary_internal: c.guardian_summary_internal ?? "",
    last_visit_date: c.last_visit_date ?? "",
    photo_uuid: c.current_photo_uuid,
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

export function ChildForm({ mode, divisions, existing }: ChildFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(
    existing ? stateFromExisting(existing) : blankState(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
    // Clear field-level error on edit.
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

    // Required fields (CREATE) / non-empty if edited (EDIT)
    if (mode === "create") {
      if (!form.display_name.trim()) e.display_name = "Required.";
      if (!form.date_of_birth) e.date_of_birth = "Required.";
      if (!form.bd_division) e.bd_division = "Required.";
      if (!form.district_internal.trim()) e.district_internal = "Required.";
      if (!form.support_type) e.support_type = "Required.";
      if (!form.monthly_cost.trim()) e.monthly_cost = "Required.";
      if (form.story.trim().length < 50) {
        e.story = "Story must be at least 50 characters.";
      }
      if (!form.guardian_summary_internal.trim()) {
        e.guardian_summary_internal = "Required.";
      }
      if (!form.photo_uuid) e.Photo = "A photo is required for new children.";
    } else {
      // Edit: enforce shape only when value is non-empty
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
    if (form.last_visit_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.last_visit_date)) {
      e.last_visit_date = "Use the date picker.";
    }
    if (form.monthly_cost) {
      const n = Number(form.monthly_cost);
      if (!Number.isInteger(n) || n < 0) {
        e.monthly_cost = "Whole number ≥ 0.";
      }
    }

    return e;
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
        const body =
          mode === "create"
            ? {
                operation: "create" as const,
                fields: {
                  display_name: form.display_name.trim(),
                  date_of_birth: form.date_of_birth,
                  bd_division: form.bd_division,
                  district_internal: form.district_internal.trim(),
                  support_type: form.support_type,
                  monthly_cost: Number(form.monthly_cost),
                  story: form.story.trim(),
                  guardian_summary_internal:
                    form.guardian_summary_internal.trim(),
                  ...(form.education_level.trim()
                    ? { education_level: form.education_level.trim() }
                    : {}),
                  ...(form.last_visit_date
                    ? { last_visit_date: form.last_visit_date }
                    : {}),
                },
                photoUuid: form.photo_uuid!,
              }
            : {
                operation: "update" as const,
                childId: existing!.id,
                fields: dirtyFieldsForUpdate(form, existing!),
                photoUuid: form.photo_uuid,
              };

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
            // Surface zod issues field-by-field where possible.
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

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Photo card */}
      <Card>
        <SectionHeader>Photo</SectionHeader>
        <PhotoUploadField
          currentPhotoUuid={form.photo_uuid}
          onUuidChange={(uuid) => set("photo_uuid", uuid)}
          required={mode === "create"}
          externalError={errors.Photo ?? null}
        />
      </Card>

      {/* Identity card */}
      <Card>
        <SectionHeader>Identity</SectionHeader>

        <Field>
          <label className={labelClass} htmlFor="display_name">
            Display name
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

        <Field>
          <label className={labelClass} htmlFor="date_of_birth">
            Date of birth
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
      </Card>

      {/* Location card */}
      <Card>
        <SectionHeader>Location</SectionHeader>

        <Field>
          <label className={labelClass} htmlFor="bd_division">
            Division
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
          <label className={labelClass} htmlFor="district_internal">
            District (internal)
          </label>
          <input
            id="district_internal"
            type="text"
            className={inputClass}
            value={form.district_internal}
            onChange={(e) => set("district_internal", e.target.value)}
            placeholder="e.g. Dhaka, Chittagong, Comilla"
            disabled={pending}
          />
          <p className={helperClass}>Not shown to donors.</p>
          {errors.district_internal ? (
            <p className={errorClass}>{errors.district_internal}</p>
          ) : null}
        </Field>
      </Card>

      {/* Care card */}
      <Card>
        <SectionHeader>Care plan</SectionHeader>

        <Field>
          <label className={labelClass} htmlFor="support_type">
            Support type
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
            Monthly cost (BDT)
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
            placeholder="e.g. Class 5"
            disabled={pending}
          />
          <p className={helperClass}>Optional.</p>
        </Field>

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
      </Card>

      {/* Story card */}
      <Card>
        <SectionHeader>Story</SectionHeader>

        <Field>
          <label className={labelClass} htmlFor="story">
            Story (donor-facing)
          </label>
          <textarea
            id="story"
            className={textareaClass}
            value={form.story}
            onChange={(e) => set("story", e.target.value)}
            placeholder="Tell their story — warmly, but without identifying details that could narrow them in their community."
            disabled={pending}
            rows={6}
          />
          <p className={helperClass}>
            Donors see this. Aim for 2–4 short paragraphs.{" "}
            {form.story.length > 0 ? `${form.story.length}/2000` : null}
          </p>
          {errors.story ? <p className={errorClass}>{errors.story}</p> : null}
        </Field>

        <Field>
          <label className={labelClass} htmlFor="guardian_summary_internal">
            Guardian context (internal)
          </label>
          <textarea
            id="guardian_summary_internal"
            className={textareaClass}
            value={form.guardian_summary_internal}
            onChange={(e) => set("guardian_summary_internal", e.target.value)}
            placeholder="Family situation, who the child lives with, anything the admin should know."
            disabled={pending}
            rows={5}
          />
          <p className={helperClass}>Not shown to donors.</p>
          {errors.guardian_summary_internal ? (
            <p className={errorClass}>
              {errors.guardian_summary_internal}
            </p>
          ) : null}
        </Field>
      </Card>

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

// ─── Small layout helpers ───────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[20px] text-ink leading-tight">
      {children}
    </h2>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// ─── Diff helper for UPDATE submit body ─────────────────────────────
//
// The server recomputes the diff anyway (and rejects empty diffs), so
// this is a UX optimisation: don't even send unchanged fields. It
// makes the bad_request payload tighter and lets the server hit
// NoChangesError sooner if the form was submitted unchanged.

function dirtyFieldsForUpdate(
  form: FormState,
  existing: ChildFormExistingChild,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  const same = (a: string, b: string | null | undefined) =>
    a.trim() === (b ?? "").toString().trim();

  if (!same(form.display_name, existing.display_name)) {
    out.display_name = form.display_name.trim();
  }
  if (form.date_of_birth !== (existing.date_of_birth ?? "")) {
    out.date_of_birth = form.date_of_birth || null;
  }
  if (form.bd_division !== (existing.bd_division_code ?? "")) {
    out.bd_division = form.bd_division;
  }
  if (!same(form.district_internal, existing.district_internal)) {
    out.district_internal = form.district_internal.trim();
  }
  if (form.support_type !== (existing.support_type ?? "")) {
    out.support_type = form.support_type;
  }
  const submittedCost = form.monthly_cost.trim()
    ? Number(form.monthly_cost)
    : null;
  if (submittedCost !== existing.monthly_cost) {
    out.monthly_cost = submittedCost;
  }
  if (!same(form.education_level, existing.education_level)) {
    out.education_level = form.education_level.trim() || null;
  }
  if (!same(form.story, existing.story)) {
    out.story = form.story.trim();
  }
  if (
    !same(form.guardian_summary_internal, existing.guardian_summary_internal)
  ) {
    out.guardian_summary_internal = form.guardian_summary_internal.trim();
  }
  if (form.last_visit_date !== (existing.last_visit_date ?? "")) {
    out.last_visit_date = form.last_visit_date || null;
  }
  return out;
}
