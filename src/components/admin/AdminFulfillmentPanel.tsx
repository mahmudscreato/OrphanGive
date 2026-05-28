// Donation Lifecycle sub-phase 3 — admin fulfillment panel.
//
// Renders the resolver's INTERNAL view (admin sees full detail incl.
// privateReason) + action buttons to set / clear exceptions. Mounts
// on /admin/sponsorships/[id] next to the existing payment-axis
// SponsorshipActionBar — visually distinct so admin can see at a
// glance which axis they're acting on.
//
// Money safety: this panel writes the fulfillment_exception COLUMN
// only via /fulfillment/set + /fulfillment/clear. It does NOT call
// any Stripe endpoint and is NOT a refund-initiation surface. The
// "Refund requested" option here is a column write that means "I
// acknowledge a refund is in motion" — the actual refund is issued
// by the EXISTING Refund button on the SponsorshipActionBar, which
// flows through /api/admin/sponsorships/[id]/refund and the existing
// charge.refunded webhook.
//
// The system-set 'refunded' state is never set from this panel; it's
// reflected automatically when the webhook fires.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PauseCircle,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import type { FulfillmentInternalView } from "@/lib/fulfillment-status";

type SettableException = "on_hold" | "disputed" | "refund_requested";

interface ApiError {
  error?: string;
  field?: string;
  message?: string;
}

interface ExceptionConfig {
  value: SettableException;
  label: string;
  helper: string;
  Icon: typeof PauseCircle;
}

const EXCEPTION_OPTIONS: ExceptionConfig[] = [
  {
    value: "on_hold",
    label: "On hold",
    helper:
      "Admin paused fulfillment (non-payment reason — e.g. family situation, seasonal delay). Donor sees 'Briefly on hold' + your curated copy.",
    Icon: PauseCircle,
  },
  {
    value: "disputed",
    label: "Disputed",
    helper:
      "Donor raised a concern about delivery. Donor sees 'We're looking into this' + your curated copy.",
    Icon: ShieldAlert,
  },
  {
    value: "refund_requested",
    label: "Refund requested",
    helper:
      "Donor asked for a refund; you'll process the refund separately via the Refund button. Column-only — no money moves here.",
    Icon: RotateCcw,
  },
];

const PHASE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "bg-tangerine-mist", text: "text-tangerine-deep", border: "border-tangerine-soft" },
  processing: { bg: "bg-tangerine", text: "text-white", border: "border-tangerine" },
  in_delivery: { bg: "bg-tangerine-deep", text: "text-white", border: "border-tangerine" },
  delivered: { bg: "bg-moss", text: "text-white", border: "border-moss/30" },
  on_hold: { bg: "bg-amber-100", text: "text-amber-900", border: "border-amber-200" },
  disputed: { bg: "bg-amber-200", text: "text-amber-900", border: "border-amber-300" },
  refund_requested: { bg: "bg-stone-200", text: "text-stone-800", border: "border-stone-300" },
  refunded: { bg: "bg-stone-700", text: "text-white", border: "border-stone-300" },
  cancelled: { bg: "bg-stone-500", text: "text-white", border: "border-stone-300" },
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function AdminFulfillmentPanel({
  sponsorshipId,
  internal,
}: {
  sponsorshipId: string;
  internal: FulfillmentInternalView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openModal, setOpenModal] = useState<SettableException | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);

  // Whether the current exception was set by an admin (so a Clear
  // affordance makes sense) vs system-set (refunded — terminal).
  const isAdminSetException =
    internal?.source === "exception" && internal.phase !== "refunded";

  const refundedTerminal = internal?.phase === "refunded";

  function handleApiError(err: ApiError, fallback: string): string {
    if (err.error === "unauthorized") return "Your admin session expired. Sign in again.";
    if (err.error === "not_found") return "Sponsorship not found.";
    return err.message ?? fallback;
  }

  function onSetException(
    exception: SettableException,
    privateReason: string,
    donorVisibleReason: string | null,
  ) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/sponsorships/${sponsorshipId}/fulfillment/set`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              exception,
              privateReason,
              donorVisibleReason: donorVisibleReason || null,
            }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(body, "Couldn't save. Try again."));
          return;
        }
        setOpenModal(null);
        setSuccessToast(`Set to ${exception.replace("_", " ")}. Refreshing…`);
        window.setTimeout(() => {
          router.refresh();
          setSuccessToast(null);
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onClear() {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/sponsorships/${sponsorshipId}/fulfillment/clear`,
          { method: "POST" },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(handleApiError(body, "Couldn't clear. Try again."));
          return;
        }
        setSuccessToast("Cleared. Refreshing…");
        window.setTimeout(() => {
          router.refresh();
          setSuccessToast(null);
        }, 600);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  const phaseColor =
    (internal && PHASE_COLOR[internal.phase]) ?? PHASE_COLOR.pending;

  return (
    <section
      aria-label="Fulfillment status"
      className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6"
    >
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 className="font-display text-[18px] text-ink leading-tight">
          Fulfillment status
        </h3>
        <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-slate">
          Independent of payment status
        </span>
      </header>

      {/* Current state — admin internal view */}
      {internal === null ? (
        <p className="text-[13.5px] text-ink-soft italic">
          Donation hasn&apos;t entered fulfillment yet (payment not confirmed).
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-[0.12em] font-medium ${phaseColor.bg} ${phaseColor.text}`}
            >
              {internal.label}
            </span>
            <span className="text-[12px] text-ink-soft">
              source: <code className="font-mono">{internal.source}</code>
            </span>
            {internal.since ? (
              <span className="text-[12px] text-ink-soft">
                · since {formatTimestamp(internal.since)}
              </span>
            ) : null}
          </div>
          {internal.detail ? (
            <p className="text-[13px] text-ink-soft leading-relaxed">
              {internal.detail}
            </p>
          ) : null}
          {internal.sponsorshipEndedAt ? (
            <p className="text-[12.5px] text-slate-soft italic">
              Sponsorship ended on {formatTimestamp(internal.sponsorshipEndedAt)}
              .
            </p>
          ) : null}

          {/* Private + donor-visible reasons (admin can see both). The
              private reason is gated behind a Show/Hide toggle to make
              casual screen-sharing safer. */}
          {internal.privateReason || internal.donorVisibleReason ? (
            <div className="mt-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              {internal.donorVisibleReason ? (
                <div>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate font-medium">
                    Donor sees
                  </p>
                  <p className="mt-1 text-[13px] text-ink leading-relaxed">
                    {internal.donorVisibleReason}
                  </p>
                </div>
              ) : (
                <p className="text-[12.5px] italic text-ink-soft">
                  No curated donor-facing reason — donor sees the generic copy
                  for this phase.
                </p>
              )}
              {internal.privateReason ? (
                <div className="pt-2 border-t border-stone-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate font-medium">
                      Private reason (admin-only)
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPrivate((s) => !s)}
                      className="inline-flex items-center gap-1 text-[12px] text-slate hover:text-tangerine-deeper transition-colors"
                    >
                      {showPrivate ? (
                        <>
                          <EyeOff
                            className="w-3.5 h-3.5 stroke-[1.75]"
                            aria-hidden="true"
                          />{" "}
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye
                            className="w-3.5 h-3.5 stroke-[1.75]"
                            aria-hidden="true"
                          />{" "}
                          Show
                        </>
                      )}
                    </button>
                  </div>
                  {showPrivate ? (
                    <p className="mt-1 text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
                      {internal.privateReason}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12px] italic text-ink-soft">
                      Hidden. Click Show to reveal.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {/* Banners */}
      {serverError ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13px] text-[#A02B2B]"
        >
          {serverError}
        </div>
      ) : null}
      {successToast ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13px] text-moss-deep"
        >
          {successToast}
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-5 pt-4 border-t border-stone-200">
        {refundedTerminal ? (
          <p className="text-[13px] text-ink-soft italic">
            Refunded by Stripe — this state is terminal and cannot be cleared.
          </p>
        ) : internal === null ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {EXCEPTION_OPTIONS.map((opt) => {
              const Icon = opt.Icon;
              const isCurrent =
                isAdminSetException && internal?.phase === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOpenModal(opt.value)}
                  disabled={pending}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                    isCurrent
                      ? "bg-amber-100 text-amber-900 border border-amber-200"
                      : "bg-white text-ink border border-stone-300 hover:border-tangerine-soft hover:text-tangerine-deeper"
                  } disabled:opacity-50`}
                >
                  <Icon
                    className="w-3.5 h-3.5 stroke-[1.75]"
                    aria-hidden="true"
                  />
                  {isCurrent ? `Currently ${opt.label}` : `Set ${opt.label}`}
                </button>
              );
            })}
            {isAdminSetException ? (
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-moss-soft text-moss-deep border border-moss/30 text-[13px] font-medium hover:bg-moss-soft/80 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="w-3.5 h-3.5 stroke-[1.75]"
                    aria-hidden="true"
                  />
                )}
                Clear exception
              </button>
            ) : null}
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-slate-soft leading-relaxed max-w-prose">
          Money safety: these controls write a column on the sponsorship row.
          They do <span className="font-medium">NOT</span> trigger any refund
          or payment action. To actually refund a charge, use the{" "}
          <span className="font-medium">Refund</span> button on the payment
          panel above — that goes through Stripe and the &apos;refunded&apos;
          fulfillment state reflects automatically once the charge.refunded
          webhook fires.
        </p>
      </div>

      {openModal ? (
        <ExceptionModal
          option={EXCEPTION_OPTIONS.find((o) => o.value === openModal)!}
          pending={pending}
          onCancel={() => setOpenModal(null)}
          onSubmit={(priv, donor) => onSetException(openModal, priv, donor)}
        />
      ) : null}
    </section>
  );
}

function ExceptionModal({
  option,
  pending,
  onCancel,
  onSubmit,
}: {
  option: ExceptionConfig;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (privateReason: string, donorVisibleReason: string | null) => void;
}) {
  const [privateReason, setPrivateReason] = useState("");
  const [donorVisibleReason, setDonorVisibleReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const Icon = option.Icon;
  const trimmedPriv = privateReason.trim();
  const trimmedDonor = donorVisibleReason.trim();
  const privTooShort = trimmedPriv.length < 5;
  const privTooLong = trimmedPriv.length > 1000;
  const donorTooLong = trimmedDonor.length > 500;

  function submit() {
    if (privTooShort) {
      setLocalError("Private reason must be at least 5 characters.");
      return;
    }
    if (privTooLong) {
      setLocalError("Private reason: max 1000 characters.");
      return;
    }
    if (donorTooLong) {
      setLocalError("Donor-visible reason: max 500 characters.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmedPriv, trimmedDonor.length === 0 ? null : trimmedDonor);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set fulfillment ${option.label}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 flex items-start gap-3">
          <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 text-amber-900">
            <Icon className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-[18px] text-ink">
              Set to {option.label}
            </h3>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
              {option.helper}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label
              htmlFor="private-reason"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1"
            >
              Private reason (admin-only · 5-1000 chars)
            </label>
            <p className="text-[12px] text-ink-soft leading-relaxed mb-1.5">
              Full operational context. Goes to audit log + the sponsorship
              row. <span className="font-medium">Never shown to donor.</span>
            </p>
            <textarea
              id="private-reason"
              rows={4}
              value={privateReason}
              onChange={(e) => {
                setPrivateReason(e.target.value);
                if (localError) setLocalError(null);
              }}
              disabled={pending}
              placeholder="e.g. Child's father returned; safeguarding officer visits next week. Pause until then."
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[14.5px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all"
            />
            <div className="mt-1 text-[11.5px] text-ink-soft">
              {trimmedPriv.length}/1000
              {privTooShort && trimmedPriv.length > 0 ? (
                <span className="ml-2 text-amber-700">
                  {5 - trimmedPriv.length} more
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <label
              htmlFor="donor-visible-reason"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1"
            >
              Donor-visible reason (optional · max 500 chars)
            </label>
            <p className="text-[12px] text-ink-soft leading-relaxed mb-1.5">
              Curated copy the donor will read. Keep it warm + non-specific
              about Tier-3 details. Leave blank to show the generic phase
              copy.
            </p>
            <textarea
              id="donor-visible-reason"
              rows={3}
              value={donorVisibleReason}
              onChange={(e) => {
                setDonorVisibleReason(e.target.value);
                if (localError) setLocalError(null);
              }}
              disabled={pending}
              placeholder="e.g. We've paused this briefly while the family situation stabilises."
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[14.5px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all"
            />
            <div className="mt-1 text-[11.5px] text-ink-soft">
              {trimmedDonor.length}/500
            </div>
          </div>

          {localError ? (
            <p className="text-[12.5px] text-[#A02B2B]">{localError}</p>
          ) : null}
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || privTooShort || privTooLong || donorTooLong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Set {option.label}
          </button>
        </div>
      </div>
    </div>
  );
}

