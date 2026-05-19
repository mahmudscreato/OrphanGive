// Session 66 — Admin direct-edit form for child records.
//
// Why a dedicated form (and not reuse src/components/di/ChildForm):
//   The DI form POSTs to /api/di/proposals (creates a child_proposal
//   row that admin then reviews). Admin edits bypass that queue
//   entirely — they POST to /api/admin/children/[id]/edit which
//   writes the child row directly. Different submit path + different
//   error vocabulary means reusing the DI form would require a
//   `mode` prop and downstream branching that's larger than just
//   writing a focused admin form.
//
// V1 scope: covers the most-edited fields, not all 41. Admin can
// still go to Directus admin for the long tail. The set below is
// what the brief explicitly asked for plus the cross-field
// (priority_support / priority_notes) the DI form already enforces.
//
// On a successful save, router.push back to /admin/children/[id] so
// admin lands on the freshly-refreshed detail page.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";

type AnyDict = Record<string, unknown>;

interface ApiError {
  error?: string;
  message?: string;
  issues?: Array<{ path?: string; message?: string }>;
}

interface InitialValues {
  display_name: string;
  story: string;
  support_type: string;
  monthly_cost: string;
  priority_support: string;
  priority_notes: string;
  blood_group: string;
  vaccination_status: string;
  last_medical_checkup: string;
  disability_status: string;
  disability_notes: string;
  additional_family_notes: string;
}

export function AdminChildEditForm({
  childId,
  initial,
}: {
  childId: string;
  initial: InitialValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<InitialValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  function set<K extends keyof InitialValues>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as string];
        return next;
      });
    }
  }

  function clientValidate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.display_name.trim()) e.display_name = "Required.";
    if (form.story.trim().length > 0 && form.story.trim().length < 50) {
      e.story = "Story must be at least 50 characters.";
    }
    if (form.monthly_cost.trim().length > 0) {
      const n = Number(form.monthly_cost);
      if (!Number.isInteger(n) || n < 0) {
        e.monthly_cost = "Whole number ≥ 0.";
      }
    }
    if (
      form.priority_support &&
      form.priority_support !== "none" &&
      !form.priority_notes.trim()
    ) {
      e.priority_notes =
        "Required when priority is standard or urgent.";
    }
    return e;
  }

  function buildPayload(): AnyDict {
    const out: AnyDict = {};
    // Only include keys that differ from `initial` so the server-side
    // change detector doesn't waste a write cycle.
    const dirty = <K extends keyof InitialValues>(k: K) =>
      form[k].trim() !== initial[k].trim();

    if (dirty("display_name")) out.display_name = form.display_name.trim();
    if (dirty("story")) out.story = form.story.trim();
    if (dirty("support_type"))
      out.support_type = form.support_type || null;
    if (dirty("monthly_cost"))
      out.monthly_cost =
        form.monthly_cost.trim() === "" ? null : Number(form.monthly_cost);
    if (dirty("priority_support"))
      out.priority_support = form.priority_support || null;
    if (dirty("priority_notes"))
      out.priority_notes = form.priority_notes.trim() || null;
    if (dirty("blood_group"))
      out.blood_group = form.blood_group || null;
    if (dirty("vaccination_status"))
      out.vaccination_status = form.vaccination_status || null;
    if (dirty("last_medical_checkup"))
      out.last_medical_checkup = form.last_medical_checkup || null;
    if (dirty("disability_status"))
      out.disability_status = form.disability_status || null;
    if (dirty("disability_notes"))
      out.disability_notes = form.disability_notes.trim() || null;
    if (dirty("additional_family_notes"))
      out.additional_family_notes =
        form.additional_family_notes.trim() || null;
    return out;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    setSuccessToast(null);
    const localErrors = clientValidate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      setServerError("No changes to save.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/children/${childId}/edit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          if (data.error === "invalid_state") {
            setServerError(data.message ?? "Invalid update.");
          } else if (data.error === "bad_request" && data.issues) {
            const fieldErrors: Record<string, string> = {};
            for (const i of data.issues) {
              const path = i.path?.split(".").pop() ?? "";
              if (path) fieldErrors[path] = i.message ?? "Invalid.";
            }
            if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
            else setServerError("Validation failed.");
          } else {
            setServerError(
              data.message ?? "Couldn't save. Try again in a moment.",
            );
          }
          return;
        }
        setSuccessToast("Saved. Redirecting…");
        window.setTimeout(() => {
          router.push(`/admin/children/${childId}`);
          router.refresh();
        }, 500);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Banner area for non-field server messages */}
      {serverError ? (
        <div
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}
      {successToast ? (
        <div
          className="rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      <Section title="Identity & story">
        <Field>
          <Label htmlFor="display_name">Display name *</Label>
          <input
            id="display_name"
            className={inputCls}
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            disabled={pending}
            aria-invalid={errors.display_name ? true : undefined}
          />
          <Helper>Donor-facing first name on profile cards.</Helper>
          {errors.display_name ? <Err>{errors.display_name}</Err> : null}
        </Field>

        <Field>
          <Label htmlFor="story">Story</Label>
          <textarea
            id="story"
            rows={6}
            className={textareaCls}
            value={form.story}
            onChange={(e) => set("story", e.target.value)}
            disabled={pending}
            aria-invalid={errors.story ? true : undefined}
          />
          <Helper>
            Donor-facing narrative. Min 50 chars when non-empty.{" "}
            {form.story.trim().length}/2000
          </Helper>
          {errors.story ? <Err>{errors.story}</Err> : null}
        </Field>
      </Section>

      <Section title="Support plan">
        <Row2>
          <Field>
            <Label htmlFor="support_type">Support type</Label>
            <select
              id="support_type"
              className={inputCls}
              value={form.support_type}
              onChange={(e) => set("support_type", e.target.value)}
              disabled={pending}
            >
              <option value="">—</option>
              <option value="education">Education</option>
              <option value="food">Food</option>
              <option value="healthcare">Healthcare</option>
              <option value="clothing">Clothing</option>
              <option value="general_care">General care</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field>
            <Label htmlFor="monthly_cost">Monthly cost (BDT)</Label>
            <input
              id="monthly_cost"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={inputCls}
              value={form.monthly_cost}
              onChange={(e) => set("monthly_cost", e.target.value)}
              disabled={pending}
              aria-invalid={errors.monthly_cost ? true : undefined}
            />
            {errors.monthly_cost ? <Err>{errors.monthly_cost}</Err> : null}
          </Field>
        </Row2>

        <Field>
          <Label htmlFor="priority_support">Priority</Label>
          <select
            id="priority_support"
            className={inputCls}
            value={form.priority_support}
            onChange={(e) => set("priority_support", e.target.value)}
            disabled={pending}
          >
            <option value="">—</option>
            <option value="none">None</option>
            <option value="standard">Standard</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        {form.priority_support && form.priority_support !== "none" ? (
          <Field>
            <Label htmlFor="priority_notes">Priority notes *</Label>
            <textarea
              id="priority_notes"
              rows={3}
              className={textareaCls}
              value={form.priority_notes}
              onChange={(e) => set("priority_notes", e.target.value)}
              disabled={pending}
              aria-invalid={errors.priority_notes ? true : undefined}
            />
            <Helper>Required when priority is standard or urgent.</Helper>
            {errors.priority_notes ? <Err>{errors.priority_notes}</Err> : null}
          </Field>
        ) : null}
      </Section>

      <Section title="Health">
        <Row2>
          <Field>
            <Label htmlFor="blood_group">Blood group</Label>
            <select
              id="blood_group"
              className={inputCls}
              value={form.blood_group}
              onChange={(e) => set("blood_group", e.target.value)}
              disabled={pending}
            >
              <option value="">—</option>
              {["A+","A-","B+","B-","AB+","AB-","O+","O-","unknown"].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="vaccination_status">Vaccination status</Label>
            <select
              id="vaccination_status"
              className={inputCls}
              value={form.vaccination_status}
              onChange={(e) => set("vaccination_status", e.target.value)}
              disabled={pending}
            >
              <option value="">—</option>
              <option value="up_to_date">Up to date</option>
              <option value="partial">Partial</option>
              <option value="unknown">Unknown</option>
              <option value="not_started">Not started</option>
            </select>
          </Field>
        </Row2>
        <Field>
          <Label htmlFor="last_medical_checkup">Last medical checkup</Label>
          <input
            id="last_medical_checkup"
            type="date"
            className={inputCls}
            value={form.last_medical_checkup}
            onChange={(e) => set("last_medical_checkup", e.target.value)}
            disabled={pending}
          />
        </Field>
        <Row2>
          <Field>
            <Label htmlFor="disability_status">Disability status</Label>
            <select
              id="disability_status"
              className={inputCls}
              value={form.disability_status}
              onChange={(e) => set("disability_status", e.target.value)}
              disabled={pending}
            >
              <option value="">—</option>
              <option value="none">None</option>
              <option value="physical">Physical</option>
              <option value="visual">Visual</option>
              <option value="hearing">Hearing</option>
              <option value="cognitive">Cognitive</option>
              <option value="multiple">Multiple</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field>
            <Label htmlFor="disability_notes">Disability notes</Label>
            <textarea
              id="disability_notes"
              rows={2}
              className={textareaCls}
              value={form.disability_notes}
              onChange={(e) => set("disability_notes", e.target.value)}
              disabled={pending}
            />
          </Field>
        </Row2>
      </Section>

      <Section title="Internal notes">
        <Field>
          <Label htmlFor="additional_family_notes">
            Additional family notes
          </Label>
          <textarea
            id="additional_family_notes"
            rows={3}
            className={textareaCls}
            value={form.additional_family_notes}
            onChange={(e) => set("additional_family_notes", e.target.value)}
            disabled={pending}
          />
          <Helper>Not shown to donors.</Helper>
        </Field>
      </Section>

      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
        <a
          href={`/admin/children/${childId}`}
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
          ) : (
            <Save className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60 aria-invalid:border-rose-500 aria-invalid:focus:border-rose-500 aria-invalid:focus:ring-rose-100";
const textareaCls = `${inputCls} min-h-[120px] resize-y leading-relaxed`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
      <h2 className="font-display text-[18px] text-ink leading-tight">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
    >
      {children}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12.5px] text-ink-soft leading-relaxed">{children}</p>;
}

function Err({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12.5px] text-[#D04848]">{children}</p>;
}
