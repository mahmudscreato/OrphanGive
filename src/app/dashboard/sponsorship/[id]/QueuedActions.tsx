"use client";

// Queued-row action surface (Session 14.7 Phase 2). Replaces
// SponsorshipActions for rows where queue_position > 0. The only
// affordance is "Cancel & refund" — the donor's commitment hasn't
// started supporting the child yet, so pause/modify/extend don't
// apply. After the slot activates, the row falls back to position=0
// and SponsorshipActions takes over.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

type Props = {
  sponsorshipId: string;
  childName: string;
  paymentSchedule: "monthly" | "monthly_prepaid" | null;
  amountUsd: number;
  durationMonths: number | null;
  // Pending shift_decision_required adds a primary "Review change"
  // CTA above the cancel button so the donor's first instinct is to
  // engage with the shift, not cancel.
  shiftDecisionRequired: boolean;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function QueuedActions({
  sponsorshipId,
  childName,
  paymentSchedule,
  amountUsd,
  durationMonths,
  shiftDecisionRequired,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPrepaid = paymentSchedule === "monthly_prepaid";
  const refundAmountUsd =
    isPrepaid && durationMonths ? amountUsd * durationMonths : null;

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/sponsorship/${sponsorshipId}/cancel-queued`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          },
        );
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !json.success) {
          setError(json.error ?? "Could not cancel. Please try again.");
          return;
        }
        // Navigate back to the sponsorships list with a brief toast.
        router.push("/dashboard/sponsorships?cancelled=queued");
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <section className="mt-10">
      {shiftDecisionRequired ? (
        <a
          href={`/dashboard/sponsorship/${sponsorshipId}/queue-shift-decision`}
          className="inline-flex items-center justify-center font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-[12px] text-[14px] transition-colors hover:bg-tangerine-deep mr-3"
        >
          Review start-date update
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center font-body font-semibold rounded-full border-[1.5px] border-danger text-danger px-5 py-[10px] text-[13.5px] transition-colors hover:bg-danger hover:text-cream"
      >
        Cancel &amp; refund
      </button>

      <Modal
        open={open}
        onClose={() => (pending ? null : setOpen(false))}
        tone="danger"
        title={`Cancel your upcoming sponsorship of ${childName}?`}
        description={
          refundAmountUsd !== null
            ? `Your payment of ${fmtUsd(refundAmountUsd)} will be refunded to your card. This action cannot be undone.`
            : `Your queued subscription will be cancelled. No money was taken yet — nothing to refund.`
        }
      >
        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-xl bg-danger-mist border border-danger-soft px-4 py-3 text-[13px] text-danger"
          >
            {error}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="font-body text-[13.5px] text-slate hover:text-ink transition-colors disabled:opacity-50"
          >
            Keep my place in the queue
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 font-body font-semibold rounded-full bg-danger text-cream px-6 py-[12px] text-[14px] transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : null}
            Yes, refund &amp; cancel
          </button>
        </div>
      </Modal>
    </section>
  );
}

export default QueuedActions;
