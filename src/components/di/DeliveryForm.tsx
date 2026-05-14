// Session 45 — Mark delivery form (client).
//
// activeSponsorships: shape from the redacted Session 43 sponsorship
// view (donor_display_name + amount + currency + sponsor_category).
// We surface only those — donor PII redaction stays at the server
// boundary.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { AID_TYPE_OPTIONS, type AidType } from "@/lib/di-delivery-options";
import type { DiSponsorshipView } from "@/lib/di-children";
import { PhotoUploadField } from "./PhotoUploadField";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[120px] resize-y leading-relaxed`;
const selectClass = inputClass;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function sponsorshipLabel(s: DiSponsorshipView): string {
  const cat =
    s.sponsor_category === "monthly"
      ? "Monthly"
      : s.sponsor_category === "prepaid"
        ? "Prepaid"
        : s.sponsor_category === "one_time"
          ? "One-time"
          : "Sponsor";
  const symbol = s.currency?.trim().toUpperCase() || "BDT";
  const amount =
    s.amount === null || !Number.isFinite(s.amount)
      ? null
      : Number.isInteger(s.amount)
        ? s.amount
        : s.amount.toFixed(2);
  return [s.donor_display_name, cat, amount ? `${symbol} ${amount}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function DeliveryForm({
  childId,
  childName,
  activeSponsorships,
}: {
  childId: string;
  childName: string;
  activeSponsorships: DiSponsorshipView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aidType, setAidType] = useState<AidType>("food");
  const [description, setDescription] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [photoUuid, setPhotoUuid] = useState<string | null>(null);
  const [recipientAcknowledgment, setRecipientAcknowledgment] = useState("");
  const [sponsorshipId, setSponsorshipId] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = "Required.";
    if (description.trim().length > 500) e.description = "Max 500 characters.";
    if (!deliveryDate) e.deliveryDate = "Required.";
    if (!photoUuid) e.photoUuid = "Photo evidence is required.";
    if (
      recipientAcknowledgment &&
      recipientAcknowledgment.trim().length > 1000
    ) {
      e.recipientAcknowledgment = "Max 1000 characters.";
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
          aidType,
          description: description.trim(),
          deliveryDate,
          photoUuid: photoUuid!,
          ...(sponsorshipId ? { sponsorshipId } : {}),
          ...(recipientAcknowledgment.trim()
            ? { recipientAcknowledgment: recipientAcknowledgment.trim() }
            : {}),
        };
        const res = await fetch("/api/di/deliveries", {
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
          } else if (errBody.error === "sponsorship_not_matching") {
            setErrors((e) => ({
              ...e,
              sponsorshipId: "That sponsorship isn't linked to this child.",
            }));
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

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* What card */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
        <div>
          <label className={labelClass} htmlFor="aidType">
            Aid type
          </label>
          <select
            id="aidType"
            className={selectClass}
            value={aidType}
            onChange={(e) => setAidType(e.target.value as AidType)}
            disabled={pending}
          >
            {AID_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="description">
            What did you deliver?
          </label>
          <textarea
            id="description"
            className={textareaClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="E.g. 'Two notebooks, pens, and school uniform for next term.'"
            disabled={pending}
            rows={4}
          />
          <p className={helperClass}>
            {description.length}/500 characters
          </p>
          {errors.description ? (
            <p className={errorClass}>{errors.description}</p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="deliveryDate">
            Delivery date
          </label>
          <input
            id="deliveryDate"
            type="date"
            className={inputClass}
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            max={todayIso()}
            disabled={pending}
          />
          {errors.deliveryDate ? (
            <p className={errorClass}>{errors.deliveryDate}</p>
          ) : null}
        </div>
      </div>

      {/* Evidence card */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
        <div>
          <h2 className="font-display text-[18px] text-ink leading-tight mb-1">
            Photo evidence
          </h2>
          <p className="text-[13px] text-ink-soft mb-4">
            Required. A photo of the aid being handed to {childName}&apos;s
            family. Builds donor trust.
          </p>
          <PhotoUploadField
            currentPhotoUuid={photoUuid}
            onUuidChange={(uuid) => {
              setPhotoUuid(uuid);
              setErrors((e) => {
                const next = { ...e };
                delete next.photoUuid;
                return next;
              });
            }}
            required
            externalError={errors.photoUuid ?? null}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="ack">
            Recipient acknowledgment (optional)
          </label>
          <textarea
            id="ack"
            className={textareaClass}
            value={recipientAcknowledgment}
            onChange={(e) => setRecipientAcknowledgment(e.target.value)}
            placeholder="Guardian's spoken acknowledgment, or a signed receipt note."
            disabled={pending}
            rows={3}
          />
          {errors.recipientAcknowledgment ? (
            <p className={errorClass}>{errors.recipientAcknowledgment}</p>
          ) : null}
        </div>
      </div>

      {/* Sponsorship link card — only when there's at least one to link */}
      {activeSponsorships.length > 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-3">
          <div>
            <label className={labelClass} htmlFor="sponsorshipId">
              Link to sponsorship (optional)
            </label>
            <select
              id="sponsorshipId"
              className={selectClass}
              value={sponsorshipId}
              onChange={(e) => setSponsorshipId(e.target.value)}
              disabled={pending}
            >
              <option value="">— Not linked —</option>
              {activeSponsorships.map((s) => (
                <option key={s.id} value={s.id}>
                  {sponsorshipLabel(s)}
                </option>
              ))}
            </select>
            <p className={helperClass}>
              If this delivery was funded by a specific sponsor, link it
              here. Optional.
            </p>
            {errors.sponsorshipId ? (
              <p className={errorClass}>{errors.sponsorshipId}</p>
            ) : null}
          </div>
        </div>
      ) : null}

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
          Submit delivery for verification
        </button>
      </div>
    </form>
  );
}
