"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  sponsorshipId: string;
};

// Two inline links for an "awaiting first payment" sponsorship card on
// the dashboard:
//   • Complete payment → /checkout?resume={id}  (link, no JS needed)
//   • Cancel attempt   → POST /api/sponsorship/[id]/cancel + refresh
//
// "Awaiting first payment" is shown until the user clicks Cancel —
// then the card disappears on refresh.
export function PendingCardActions({ sponsorshipId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelAttempt() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sponsorship/${sponsorshipId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "pending_attempt_cancelled" }),
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Could not cancel.");
        setPending(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="text-[12.5px] text-slate-soft italic">
        Awaiting first payment
      </span>
      <span className="flex-1" />
      <Link
        href={`/checkout?resume=${sponsorshipId}`}
        className="text-[12.5px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
      >
        Complete payment →
      </Link>
      <button
        type="button"
        onClick={cancelAttempt}
        disabled={pending}
        className="text-[12.5px] text-slate hover:text-ink underline-offset-4 hover:underline whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Cancelling…" : "Cancel attempt"}
      </button>
      {error ? (
        <span className="basis-full text-[12px] text-[#A02B2B]" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default PendingCardActions;
