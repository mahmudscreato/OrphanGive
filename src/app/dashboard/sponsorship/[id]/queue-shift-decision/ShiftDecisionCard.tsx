"use client";

// Three-radio picker for the queue-shift decision (Session 14.7
// Phase 2). Wired to POST /api/sponsorship/[id]/queue-shift. The
// "Transfer" option opens a child-picker modal to choose the new
// target before submitting.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TransferTargetPicker } from "./TransferTargetPicker";

type Action = "accept" | "transfer" | "refund";

type Props = {
  sponsorshipId: string;
  childName: string;
  childId: string;
  initialAction: Action;
  oldStartsAt: string | null;
  newStartsAt: string | null;
  shiftRequiredAt: string | null;
  paymentSchedule: "monthly" | "monthly_prepaid" | null;
  amountUsd: number;
  durationMonths: number | null;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function ShiftDecisionCard({
  sponsorshipId,
  childName,
  childId,
  initialAction,
  oldStartsAt,
  newStartsAt,
  shiftRequiredAt,
  paymentSchedule,
  amountUsd,
  durationMonths,
}: Props) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(initialAction);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferTargetName, setTransferTargetName] = useState<string | null>(
    null,
  );

  const oldStr = fmtDate(oldStartsAt);
  const newStr = fmtDate(newStartsAt);
  const isPrepaid = paymentSchedule === "monthly_prepaid";
  const totalCommit = isPrepaid && durationMonths
    ? amountUsd * durationMonths
    : amountUsd;

  // 14-day auto-accept countdown.
  let daysRemaining: number | null = null;
  if (shiftRequiredAt) {
    const requiredMs = new Date(shiftRequiredAt).getTime();
    if (Number.isFinite(requiredMs)) {
      const elapsedMs = Date.now() - requiredMs;
      const FOURTEEN = 14 * 24 * 60 * 60 * 1000;
      daysRemaining = Math.max(
        0,
        Math.ceil((FOURTEEN - elapsedMs) / (24 * 60 * 60 * 1000)),
      );
    }
  }

  function submit() {
    setError(null);
    if (action === "transfer" && !transferTargetId) {
      setError("Pick a child to transfer your support to before continuing.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/sponsorship/${sponsorshipId}/queue-shift`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              decision: action,
              ...(action === "transfer"
                ? { transferToChildId: transferTargetId }
                : {}),
            }),
            cache: "no-store",
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          transferTo?: { sponsorUrl?: string };
        };
        if (!res.ok || !json.success) {
          setError(json.error ?? "Could not record your decision.");
          return;
        }
        // After 'transfer', send the donor to the new child's
        // /sponsor flow. After accept/refund, return them to the
        // detail page (refund flips status='cancelled', accept
        // flips shift_decision_required=false; in either case
        // /dashboard/sponsorship/[id] reflects the new state).
        if (action === "transfer" && json.transferTo?.sponsorUrl) {
          router.push(json.transferTo.sponsorUrl);
        } else {
          router.push(`/dashboard/sponsorship/${sponsorshipId}`);
          router.refresh();
        }
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div className="mt-6">
      {/* Old → New comparison */}
      <section className="rounded-[18px] bg-white border border-ink/[0.06] px-5 py-4 max-md:px-4">
        <div className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-slate-soft mb-2">
          Start date update
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-display text-[18px] text-ink/60 line-through">
            {oldStr ?? "—"}
          </span>
          <span className="text-slate-soft">→</span>
          <span className="font-display text-[18px] text-ink">
            {newStr ?? "—"}
          </span>
        </div>
        <p className="mt-3 text-[13px] text-slate leading-snug">
          {isPrepaid ? (
            <>
              You paid <strong>{fmtUsd(totalCommit)}</strong> upfront for
              {" "}
              {durationMonths} {durationMonths === 1 ? "month" : "months"}{" "}
              of support. Your sponsorship will begin on the new start
              date — same duration, just a later start.
            </>
          ) : (
            <>
              Your card on file will be charged{" "}
              <strong>{fmtUsd(amountUsd)}/month</strong> beginning on the
              new start date.
              {durationMonths
                ? ` Total commitment: ${durationMonths} ${
                    durationMonths === 1 ? "month" : "months"
                  }.`
                : null}
            </>
          )}
        </p>
      </section>

      {/* Three radio cards */}
      <fieldset className="mt-6 m-0 p-0 border-0">
        <legend className="font-display text-[18px] text-ink mb-3">
          How would you like to proceed?
        </legend>
        <div className="space-y-3">
          <RadioCard
            checked={action === "accept"}
            onSelect={() => setAction("accept")}
            disabled={pending}
            tone="moss"
            label="Accept the new start date"
            description={`Your sponsorship will begin on ${newStr ?? "the new date"}. No action needed beyond this.`}
            recommended
          />
          <RadioCard
            checked={action === "transfer"}
            onSelect={() => setAction("transfer")}
            disabled={pending}
            tone="tangerine"
            label="Transfer to another awaiting child"
            description="Move your support to a different child whose sponsorship can begin sooner. Your original commitment will be refunded; you'll choose a new child + amount."
            footer={
              action === "transfer" ? (
                <div className="mt-3">
                  {transferTargetName ? (
                    <div className="text-[13px] text-ink">
                      Transferring to:{" "}
                      <span className="font-display font-medium">
                        {transferTargetName}
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() => setTransferOpen(true)}
                        disabled={pending}
                        className="ml-2 text-tangerine-deeper underline-offset-4 hover:underline text-[12.5px]"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTransferOpen(true)}
                      disabled={pending}
                      className="inline-flex items-center font-body font-semibold rounded-full border-[1.5px] border-tangerine text-tangerine-deeper px-4 py-1.5 text-[13px] transition-colors hover:bg-tangerine hover:text-ink"
                    >
                      Choose a child →
                    </button>
                  )}
                </div>
              ) : null
            }
          />
          <RadioCard
            checked={action === "refund"}
            onSelect={() => setAction("refund")}
            disabled={pending}
            tone="danger"
            label="Cancel and refund"
            description={
              isPrepaid
                ? `We'll refund ${fmtUsd(totalCommit)} to your card. Your queued sponsorship will be cancelled.`
                : "We'll cancel your queued subscription. No money was taken yet."
            }
          />
        </div>
      </fieldset>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-danger-mist border border-danger-soft px-4 py-3 text-[13px] text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/dashboard/sponsorship/${sponsorshipId}`}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : null}
          Confirm decision
        </button>
      </div>

      {daysRemaining !== null ? (
        <p className="mt-4 text-[12.5px] text-slate-soft italic leading-snug">
          If you take no action, your sponsorship will automatically begin
          on the new start date in {daysRemaining}{" "}
          {daysRemaining === 1 ? "day" : "days"}.
        </p>
      ) : null}

      <TransferTargetPicker
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        excludeChildId={childId}
        onPick={(c) => {
          setTransferTargetId(c.id);
          setTransferTargetName(c.display_name);
          setTransferOpen(false);
        }}
      />

      {/* childName retained in the props for context elsewhere; unused here.*/}
      <span className="sr-only">{childName}</span>
    </div>
  );
}

function RadioCard({
  checked,
  onSelect,
  disabled,
  tone,
  label,
  description,
  recommended,
  footer,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  tone: "moss" | "tangerine" | "danger";
  label: string;
  description: string;
  recommended?: boolean;
  footer?: React.ReactNode;
}) {
  const accent =
    tone === "moss"
      ? "border-moss bg-moss-soft/60"
      : tone === "tangerine"
        ? "border-tangerine bg-tangerine-mist"
        : "border-danger-soft bg-danger-mist";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      role="radio"
      aria-checked={checked}
      className={`w-full text-left rounded-[16px] border-[1.5px] px-5 py-4 transition-all ${
        checked
          ? `${accent} shadow-warm`
          : "bg-white border-ink/[0.10] hover:border-ink/[0.20] hover:bg-cream"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1 inline-flex shrink-0 items-center justify-center w-4 h-4 rounded-full border-[1.5px] ${
            checked ? "border-current" : "border-ink/30"
          }`}
        >
          {checked ? (
            <span className="block w-2 h-2 rounded-full bg-current" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-display text-[16px] text-ink leading-tight">
              {label}
            </span>
            {recommended ? (
              <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-moss-deep">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[13px] text-slate leading-snug">
            {description}
          </p>
          {footer}
        </div>
      </div>
    </button>
  );
}
