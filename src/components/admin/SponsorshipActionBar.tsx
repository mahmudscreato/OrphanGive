// Session 61 — Admin sponsorship action bar.
//
// Four primary actions:
//   - Pause   (monthly only, status='active')
//   - Resume  (monthly only, status='paused')
//   - Cancel  (any active/paused — opens reason modal)
//   - Refund  (opens charge picker modal; requires Stripe charges
//              list passed in as prop)
//
// Extend is deferred to a future session — the donor route's extend
// flow is the most complex of the lifecycle paths (queue shifts,
// payment_schedule branching, multiple Stripe ops) and reimplementing
// it admin-side without first extracting reusable helpers risks
// regressing the donor flow. Surfaced to admin as a note instead.
//
// Send-message-to-donor is also deferred; admin can email directly
// via the donor's email shown in the detail page until we wire a
// dedicated template-picker.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  XCircle,
} from "lucide-react";
import type { AdminStripeCharge } from "@/lib/admin-sponsorships";
import type { SponsorshipStatus } from "@/lib/sponsorship-data";
import { paymentStatusLabel } from "@/lib/status-labels";

interface ApiError {
  error?: string;
  message?: string;
}

export function SponsorshipActionBar({
  sponsorshipId,
  status,
  paymentMode,
  charges,
  isSuperAdmin,
}: {
  sponsorshipId: string;
  status: SponsorshipStatus;
  paymentMode: "monthly" | "one_time";
  charges: AdminStripeCharge[];
  // fix/super-admin-route-gating — Cancel + Refund are Super-Admin-only
  // (money/irreversible); the routes 403 a plain Admin, so hide the
  // buttons for them. Pause/Resume stay available to plain Admins.
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  function mapError(err: ApiError, fallback: string): string {
    if (err.error === "unauthorized") return "Admin session expired. Sign in again.";
    if (err.error === "not_found")
      return "This sponsorship no longer exists. Refresh the queue.";
    return err.message ?? err.error ?? fallback;
  }

  function onAction(
    action: "pause" | "resume",
    successCopy: string,
  ): void {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/sponsorships/${sponsorshipId}/${action}`,
          { method: "POST" },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(mapError(body, `Couldn't ${action}. Try again.`));
          return;
        }
        setSuccessToast(successCopy);
        window.setTimeout(() => {
          router.refresh();
          setSuccessToast(null);
        }, 1200);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onCancelSubmit(reason: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/sponsorships/${sponsorshipId}/cancel`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError;
        if (!res.ok) {
          setServerError(mapError(body, "Couldn't cancel. Try again."));
          return;
        }
        setShowCancelModal(false);
        setSuccessToast("Cancelled. Donor was notified.");
        window.setTimeout(() => {
          router.refresh();
          setSuccessToast(null);
        }, 1200);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  function onRefundSubmit(args: {
    chargeId: string;
    amountUsd: number;
    reason: string;
  }) {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/sponsorships/${sponsorshipId}/refund`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(args),
          },
        );
        const body = (await res.json().catch(() => ({}))) as ApiError & {
          refundId?: string;
        };
        if (!res.ok) {
          setServerError(mapError(body, "Refund failed. Try again."));
          return;
        }
        setShowRefundModal(false);
        setSuccessToast(
          `Refund issued ($${args.amountUsd.toFixed(2)}). Donor was notified.`,
        );
        window.setTimeout(() => {
          router.refresh();
          setSuccessToast(null);
        }, 1500);
      } catch {
        setServerError("Network error. Try again.");
      }
    });
  }

  // What's available given current state?
  const canPause = paymentMode === "monthly" && status === "active";
  const canResume = paymentMode === "monthly" && status === "paused";
  // Cancel + Refund additionally require Super Admin (money/irreversible).
  // The `show*` flags fold that in so the buttons AND the "no actions"
  // fallback stay consistent for a plain Admin.
  const showCancel = isSuperAdmin && (status === "active" || status === "paused");
  const showRefund = isSuperAdmin && charges.length > 0;

  return (
    <section
      aria-label="Sponsorship actions"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3">Actions</h2>
      {serverError ? (
        <div
          className="mb-4 rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
          role="alert"
        >
          {serverError}
        </div>
      ) : null}
      {successToast ? (
        <div
          className="mb-4 rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
          role="status"
        >
          {successToast}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 items-stretch">
        {canPause ? (
          <button
            type="button"
            onClick={() => onAction("pause", "Paused. Donor was notified.")}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-amber-300 text-amber-800 bg-amber-50 font-medium text-[13.5px] hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <PauseCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            )}
            Pause
          </button>
        ) : null}

        {canResume ? (
          <button
            type="button"
            onClick={() => onAction("resume", "Resumed.")}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-moss text-cream font-medium text-[13.5px] hover:bg-moss-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            )}
            Resume
          </button>
        ) : null}

        {showCancel ? (
          <button
            type="button"
            onClick={() => setShowCancelModal(true)}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <XCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Cancel sponsorship
          </button>
        ) : null}

        {showRefund ? (
          <button
            type="button"
            onClick={() => setShowRefundModal(true)}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#A02B2B]/40 text-[#A02B2B] bg-[#FCE9E9]/40 font-medium text-[13.5px] hover:bg-[#FCE9E9] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Refund a charge
          </button>
        ) : null}

        {!canPause && !canResume && !showCancel && !showRefund ? (
          <p className="text-[13px] text-ink-soft italic">
            No actions available in current state ({status}).
          </p>
        ) : null}
      </div>

      {/* Extend + send-message deferred — flagged for admin so the
          absence is intentional rather than a missing button. */}
      <p className="mt-4 text-[11.5px] text-ink-soft/80 leading-relaxed">
        Extend (add months to a prepaid commitment) and Send-message-to-donor
        flows are deferred to a follow-up session. For now: ask the donor
        to extend from their own dashboard, or email them directly via
        the address shown above.
      </p>

      {showCancelModal ? (
        <CancelModal
          onCancel={() => setShowCancelModal(false)}
          onSubmit={onCancelSubmit}
          pending={pending}
        />
      ) : null}
      {showRefundModal ? (
        <RefundModal
          onClose={() => setShowRefundModal(false)}
          onSubmit={onRefundSubmit}
          charges={charges}
          pending={pending}
        />
      ) : null}
    </section>
  );
}

// ─── Cancel modal ──────────────────────────────────────────────────

function CancelModal({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 5;
  const tooLong = trimmed.length > 500;

  function submit() {
    if (tooShort) {
      setLocalError("Please give a brief reason (min 5 characters).");
      return;
    }
    if (tooLong) {
      setLocalError("Max 500 characters.");
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancel this sponsorship"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            Cancel this sponsorship
          </h3>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            This will cancel the donor&apos;s Stripe subscription and mark
            the sponsorship ended. Donor receives an end-of-sponsorship
            email. Refund any prepaid charges separately via &ldquo;Refund a
            charge&rdquo;.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <label
            htmlFor="cancel-reason"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium"
          >
            Reason (for audit log, not shown to donor)
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            disabled={pending}
            placeholder="e.g. Donor emailed; bank-related cancellation"
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          />
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
            Keep sponsorship
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || tooShort || tooLong}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] text-white font-medium text-[14px] hover:bg-[#8A2424] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Confirm cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Refund modal ──────────────────────────────────────────────────

function RefundModal({
  onClose,
  onSubmit,
  charges,
  pending,
}: {
  onClose: () => void;
  onSubmit: (args: {
    chargeId: string;
    amountUsd: number;
    reason: string;
  }) => void;
  charges: AdminStripeCharge[];
  pending: boolean;
}) {
  // Default to the most recent refundable charge.
  const refundable = charges.filter((c) => c.paid && !c.refunded);
  const [chargeId, setChargeId] = useState<string>(refundable[0]?.id ?? "");
  const selected =
    charges.find((c) => c.id === chargeId) ?? refundable[0] ?? null;
  const maxRefund = selected
    ? Math.max(0, selected.amount_usd - selected.amount_refunded_usd)
    : 0;
  const [amountStr, setAmountStr] = useState<string>(maxRefund.toFixed(2));
  const [reason, setReason] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Resync amount when charge changes.
  function pickCharge(id: string) {
    setChargeId(id);
    const c = charges.find((cc) => cc.id === id);
    if (c) {
      const max = Math.max(0, c.amount_usd - c.amount_refunded_usd);
      setAmountStr(max.toFixed(2));
    }
    setLocalError(null);
  }

  function submit() {
    const amount = Number(amountStr);
    if (!chargeId) {
      setLocalError("Pick a charge to refund.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setLocalError("Amount must be greater than zero.");
      return;
    }
    if (amount > maxRefund + 0.0001) {
      setLocalError(`Amount exceeds refundable balance ($${maxRefund.toFixed(2)}).`);
      return;
    }
    onSubmit({ chargeId, amountUsd: Number(amount.toFixed(2)), reason: reason.trim() });
  }

  if (refundable.length === 0) {
    return (
      <ModalShell title="Refund a charge" onClose={onClose} pending={pending}>
        <p className="text-[13.5px] text-ink-soft leading-relaxed">
          No refundable charges found on this sponsorship&apos;s Stripe
          customer. If you expected charges to appear, verify the
          Stripe customer / payment-intent IDs in the donor info above.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Refund a charge" onClose={onClose} pending={pending}>
      <div className="space-y-4">
        <div>
          <label className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5">
            Pick a charge
          </label>
          <ul className="space-y-1.5">
            {charges.map((c) => {
              const refundable = c.paid && !c.refunded;
              const remaining = c.amount_usd - c.amount_refunded_usd;
              return (
                <li key={c.id}>
                  <label
                    className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                      chargeId === c.id
                        ? "border-tangerine bg-tangerine-mist/40"
                        : "border-stone-200 hover:border-tangerine-soft"
                    } ${!refundable ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="radio"
                      name="charge"
                      value={c.id}
                      checked={chargeId === c.id}
                      disabled={!refundable || pending}
                      onChange={() => pickCharge(c.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 text-[13px]">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-ink">
                          ${c.amount_usd.toFixed(2)} {c.currency}
                        </span>
                        <span className="text-[11px] text-ink-soft">
                          {new Intl.DateTimeFormat("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(c.created * 1000))}
                        </span>
                        {c.refunded ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-700">
                            Fully refunded
                          </span>
                        ) : c.amount_refunded_usd > 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800">
                            Partial · ${c.amount_refunded_usd.toFixed(2)}{" "}
                            refunded
                          </span>
                        ) : !c.paid ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FCE9E9] text-[#A02020]">
                            {paymentStatusLabel(c.status)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-soft font-mono break-all">
                        {c.id}
                      </p>
                      {refundable ? (
                        <p className="mt-0.5 text-[11.5px] text-ink-soft">
                          Refundable balance: ${remaining.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        {selected ? (
          <>
            <div>
              <label
                htmlFor="refund-amount"
                className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
              >
                Refund amount (USD)
              </label>
              <input
                id="refund-amount"
                type="number"
                min="0"
                step="0.01"
                max={maxRefund}
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  if (localError) setLocalError(null);
                }}
                disabled={pending}
                className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
              />
              <p className="mt-1 text-[11.5px] text-ink-soft">
                Max ${maxRefund.toFixed(2)} (full = ${selected.amount_usd.toFixed(2)})
              </p>
            </div>
            <div>
              <label
                htmlFor="refund-reason"
                className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
              >
                Reason (optional, stored in Stripe metadata + audit)
              </label>
              <input
                id="refund-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                maxLength={500}
                placeholder="e.g. Duplicate charge"
                className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
              />
            </div>
          </>
        ) : null}

        {localError ? (
          <p className="text-[12.5px] text-[#A02B2B]">{localError}</p>
        ) : null}
      </div>

      <div className="px-5 py-4 border-t border-stone-200 flex items-center justify-end gap-3 -mx-5 -mb-5 mt-5">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-[14px] text-slate hover:text-tangerine-deeper transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !selected}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#A02B2B] text-white font-medium text-[14px] hover:bg-[#8A2424] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2
              className="w-3.5 h-3.5 stroke-[1.75]"
              aria-hidden="true"
            />
          )}
          Issue refund
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  pending,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
