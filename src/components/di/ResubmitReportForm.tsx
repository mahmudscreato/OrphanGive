// Spine 1.2 — DI edit + resubmit form for a correction_requested
// report.
//
// Scoped down from ReportForm: no sponsorship/task pickers (those
// were locked at first submit), no type field (admin's correction
// reason rarely about type; keeping it editable invites scope creep).
// Same title/content/visibility/photo + validation as the create form.
//
// POSTs to /api/di/reports/[reportId]/resubmit. On success: navigates
// back to the child detail page where the row now shows
// 'submitted_by_di' status (admin queue picks it back up).

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import {
  REPORT_VISIBILITY_OPTIONS,
  type ReportVisibility,
} from "@/lib/di-report-options";
import { PhotoUploadField } from "./PhotoUploadField";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[180px] resize-y leading-relaxed`;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

export interface ResubmitReportFormProps {
  reportId: string;
  childId: string;
  childName: string;
  correctionReason: string | null;
  initial: {
    title: string;
    content: string;
    visibility: ReportVisibility;
    photoUuid: string | null;
  };
}

export function ResubmitReportForm({
  reportId,
  childId,
  childName,
  correctionReason,
  initial,
}: ResubmitReportFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [visibility, setVisibility] = useState<ReportVisibility>(
    initial.visibility,
  );
  const [photoUuid, setPhotoUuid] = useState<string | null>(initial.photoUuid);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

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
          title: title.trim(),
          content: content.trim(),
          visibility,
          // Photo: send the uuid if present, omit if not (server
          // leaves the existing photo alone when undefined).
          ...(photoUuid ? { photoUuid } : {}),
        };
        const res = await fetch(
          `/api/di/reports/${encodeURIComponent(reportId)}/resubmit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            field?: string;
            message?: string;
          };
          if (errBody.error === "not_found" || errBody.error === "out_of_scope") {
            setServerError(
              "This report isn't available for resubmission anymore. Admin may have re-claimed or approved it.",
            );
          } else if (errBody.error === "invalid_input" && errBody.field) {
            setErrors((e) => ({
              ...e,
              [errBody.field as string]: errBody.message ?? "Invalid value.",
            }));
          } else {
            setServerError(
              "Resubmission failed. Please try again in a moment.",
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

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Admin's correction note — top of form, hard to miss. */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <RotateCcw
            className="w-5 h-5 text-amber-800 stroke-[2] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-[16px] text-amber-900 leading-snug">
              Admin asked you to make changes
            </p>
            {correctionReason ? (
              <p className="mt-1.5 text-[14px] text-amber-900 leading-relaxed">
                {correctionReason}
              </p>
            ) : (
              <p className="mt-1.5 text-[14px] italic text-amber-900/80">
                No specific note provided.
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-amber-800/80 leading-relaxed">
              Edit your report below and resubmit. The original sponsorship
              link, type, and report kind are preserved.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
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
            disabled={pending}
            maxLength={200}
            placeholder={`A short headline for ${childName}'s update`}
          />
          {errors.title ? <p className={errorClass}>{errors.title}</p> : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="content">
            What happened? <span className="lowercase opacity-60">(50–2000 chars)</span>
          </label>
          <textarea
            id="content"
            className={textareaClass}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={pending}
          />
          <div className="mt-1.5 flex items-center justify-between text-[12.5px] text-ink-soft">
            <span>{content.trim().length} / 2000</span>
            {errors.content ? (
              <span className="text-[#D04848]">{errors.content}</span>
            ) : null}
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Visibility</legend>
          <div className="space-y-2">
            {REPORT_VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  visibility === opt.value
                    ? "border-tangerine bg-tangerine-mist/40"
                    : "border-stone-200 hover:border-tangerine-soft"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => setVisibility(opt.value)}
                  disabled={pending}
                  className="mt-1 accent-tangerine"
                />
                <span>
                  <span className="block font-medium text-[14px] text-ink">
                    {opt.label}
                  </span>
                  <span className="block text-[12.5px] text-ink-soft">
                    {opt.helper}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={labelClass}>Photo (optional)</label>
          <PhotoUploadField
            currentPhotoUuid={photoUuid}
            onUuidChange={(uuid) => setPhotoUuid(uuid)}
          />
          <p className={helperClass}>
            Re-upload if admin asked for a clearer or different photo.
          </p>
        </div>
      </div>

      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
        >
          <AlertTriangle
            className="w-4 h-4 stroke-[2] mt-0.5 shrink-0"
            aria-hidden="true"
          />
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          )}
          {pending ? "Resubmitting…" : "Resubmit for review"}
        </button>
      </div>
    </form>
  );
}
