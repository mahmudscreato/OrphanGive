// Session 45 — Submit report form (client).
//
// Fields adapted to the production child_update schema (see
// di-reports.ts header for the spec deviation rationale):
//   - type        select (academic / health / story / milestone / etc.)
//   - title       text
//   - content     long textarea (50-2000 chars, live counter)
//   - visibility  radio (all_donors / sponsor_only)
//   - photo       optional PhotoUploadField

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import {
  REPORT_TYPE_OPTIONS,
  REPORT_VISIBILITY_OPTIONS,
  type ReportType,
  type ReportVisibility,
} from "@/lib/di-report-options";
import { PhotoUploadField } from "./PhotoUploadField";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[180px] resize-y leading-relaxed`;
const selectClass = inputClass;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

export function ReportForm({
  childId,
  childName,
  // Spine 1.2 — optional sponsorship + task pickers. When the page
  // passes a non-empty `sponsorships` array, the form renders a
  // required sponsorship selector at the top; report_type is then
  // derived server-side from the selected sponsorship's payment_mode.
  // When `sponsorships` is empty (no sponsorships exist for this
  // child), the form falls back to the legacy non-sponsorship flow.
  sponsorships = [],
  tasks = [],
}: {
  childId: string;
  childName: string;
  sponsorships?: Array<{
    id: string;
    sponsor_category: "monthly" | "prepaid" | "one_time" | "unknown";
    status: string;
    donor_display_name: string;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    sponsorshipId: string | null;
    diStatus: string;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<ReportType>("story");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<ReportVisibility>("all_donors");
  const [photoUuid, setPhotoUuid] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  // Spine 1.2 — selector state. Default to "no sponsorship" so the
  // legacy form path stays the visible default when sponsorships
  // don't exist; DI can opt-in by picking one.
  const [sponsorshipId, setSponsorshipId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");

  // Tasks filtered to the picked sponsorship (matches the server-side
  // validation in di-reports.ts:createReport). Memoised inline since
  // tasks is rarely > 10 items.
  const tasksForSponsorship = tasks.filter(
    (t) => sponsorshipId !== "" && t.sponsorshipId === sponsorshipId,
  );

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Required.";
    if (title.trim().length > 200) e.title = "Max 200 characters.";
    const trimmed = content.trim();
    if (trimmed.length < 50) {
      e.content = "Must be at least 50 characters.";
    } else if (trimmed.length > 2000) {
      e.content = "Max 2000 characters.";
    }
    return e;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const local = validate();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        const body = {
          childId,
          type,
          title: title.trim(),
          content: content.trim(),
          visibility,
          ...(photoUuid ? { photoUuid } : {}),
          // Spine 1.2 — sponsorship + task only sent when the DI
          // explicitly picked a sponsorship; otherwise we send the
          // legacy non-sponsorship-tied shape (writes 'pending').
          ...(sponsorshipId ? { sponsorshipId } : {}),
          ...(taskId ? { taskId } : {}),
        };
        const res = await fetch("/api/di/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            field?: string;
            message?: string;
          };
          if (errBody.error === "not_found") {
            setServerError(
              "This child isn't in your care anymore. Refresh and try again.",
            );
          } else if (errBody.error === "invalid_input" && errBody.field) {
            setErrors((e) => ({
              ...e,
              [errBody.field as string]: errBody.message ?? "Invalid value.",
            }));
          } else {
            setServerError(
              "Submission failed. Please try again in a moment.",
            );
          }
          return;
        }
        router.push(`/di/children/${childId}` as Route);
        router.refresh();
      } catch {
        setServerError("Something went wrong. Please try again.");
      }
    });
  }

  // Spine 1.2 — when the picked sponsorship is monthly, copy framing
  // is "Progress update"; when one_time, "Deployment confirmation".
  const pickedSponsorship = sponsorships.find((s) => s.id === sponsorshipId);
  const reportTypeLabel =
    pickedSponsorship?.sponsor_category === "one_time"
      ? "Deployment confirmation"
      : pickedSponsorship
        ? "Progress update"
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Spine 1.2 — sponsorship + task pickers. Only rendered when
          this child actually has sponsorships. When the DI files an
          "organic" update (no sponsorship), the legacy non-sponsorship
          submission path kicks in automatically. */}
      {sponsorships.length > 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
          <div>
            <label className={labelClass} htmlFor="sponsorship">
              For which sponsorship?
            </label>
            <select
              id="sponsorship"
              className={selectClass}
              value={sponsorshipId}
              onChange={(e) => {
                setSponsorshipId(e.target.value);
                // Reset task picker if the new sponsorship doesn't
                // include the currently-picked task.
                setTaskId("");
              }}
              disabled={pending}
            >
              <option value="">
                — none (file as an organic update) —
              </option>
              {sponsorships.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.donor_display_name} ·{" "}
                  {s.sponsor_category === "one_time"
                    ? "One-time"
                    : s.sponsor_category === "prepaid"
                      ? "Monthly (prepaid)"
                      : s.sponsor_category === "monthly"
                        ? "Monthly"
                        : "Unknown"}
                  {" · "}
                  {s.status}
                </option>
              ))}
            </select>
            <p className={helperClass}>
              {reportTypeLabel
                ? `${reportTypeLabel} — admin reviews before sending to the donor.`
                : "Or leave unset for the legacy update flow."}
            </p>
          </div>
          {tasksForSponsorship.length > 0 ? (
            <div>
              <label className={labelClass} htmlFor="task">
                Filed against a task? (optional)
              </label>
              <select
                id="task"
                className={selectClass}
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                disabled={pending}
              >
                <option value="">— none —</option>
                {tasksForSponsorship.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.diStatus})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Type + title card */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
        <div>
          <label className={labelClass} htmlFor="type">
            What kind of report?
          </label>
          <select
            id="type"
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
            disabled={pending}
          >
            {REPORT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            type="text"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, donor-friendly headline"
            disabled={pending}
          />
          {errors.title ? <p className={errorClass}>{errors.title}</p> : null}
        </div>
      </div>

      {/* Narrative card */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
        <div>
          <label className={labelClass} htmlFor="content">
            Your update
          </label>
          <textarea
            id="content"
            className={textareaClass}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`How is ${childName} doing this month? Their schooling, health, mood, anything notable from your visit.`}
            disabled={pending}
            rows={8}
          />
          <p className={helperClass}>
            {content.length}/2000 characters · 50 minimum
          </p>
          {errors.content ? (
            <p className={errorClass}>{errors.content}</p>
          ) : null}
        </div>

        <PhotoUploadField
          currentPhotoUuid={photoUuid}
          onUuidChange={(uuid) => setPhotoUuid(uuid)}
          required={false}
        />
        <p className="-mt-2 text-[12.5px] text-ink-soft">
          Optional. A photo to accompany the update.
        </p>
      </div>

      {/* Visibility card */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          Who can see this?
        </h2>
        <div className="space-y-2.5">
          {REPORT_VISIBILITY_OPTIONS.map((opt) => {
            const id = `vis-${opt.value}`;
            const selected = visibility === opt.value;
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  selected
                    ? "border-tangerine bg-tangerine-mist/40"
                    : "border-stone-200 hover:bg-stone-50"
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setVisibility(opt.value)}
                  disabled={pending}
                  className="mt-1 accent-tangerine"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] text-ink font-medium">
                    {opt.label}
                  </div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">
                    {opt.helper}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {serverError ? (
        <div className="rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#9A2424]">
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
        <a
          href={`/di/children/${childId}`}
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
          Submit report for approval
        </button>
      </div>
    </form>
  );
}
