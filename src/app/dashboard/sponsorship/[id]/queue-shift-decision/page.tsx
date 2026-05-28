// Dashboard surface where a queued donor responds to a queue-shift
// notification (Session 14.7 Phase 2). Reads the sponsorship row,
// shows old vs new start dates, and renders three radio cards
// (Accept / Transfer / Refund). The donor's three email buttons all
// land here with ?action=… pre-selecting the matching radio.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { getSponsorshipForDonor } from "@/lib/sponsorship-data";
import { sponsorshipStatusLabel } from "@/lib/status-labels";
import { ShiftDecisionCard } from "./ShiftDecisionCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsorship update — OrphanGive" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS = new Set(["accept", "transfer", "refund"]);

export default async function QueueShiftDecisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const donor = await getCurrentDonor();
  const state = getDonorState(donor);
  if (state === "unauthenticated") {
    redirect(`/signin?next=/dashboard/sponsorship/${id}/queue-shift-decision`);
  }
  if (state !== "approved") redirect("/dashboard");

  const sponsorship = await getSponsorshipForDonor(id, donor!.id);
  if (!sponsorship) notFound();

  // Read-only branch: this row was never queued, or the decision is
  // already recorded, or it's no longer 'active'. Render a summary
  // instead of the picker.
  const position = sponsorship.queue_position ?? 0;
  const isQueued = position > 0 && sponsorship.status === "active";
  const decisionRecorded =
    !sponsorship.shift_decision_required && !!sponsorship.shift_decision;

  // Pre-select the radio via ?action=… from the email button.
  const sp = await searchParams;
  const initialAction =
    sp.action && VALID_ACTIONS.has(sp.action)
      ? (sp.action as "accept" | "transfer" | "refund")
      : "accept";

  const childObj =
    typeof sponsorship.child === "string" ? null : sponsorship.child;
  const childName = childObj?.display_name?.trim() || "this child";
  const childId =
    typeof sponsorship.child === "string"
      ? sponsorship.child
      : sponsorship.child?.id ?? "";

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/sponsorship/${id}`}
          className="text-[13.5px] text-slate-soft hover:text-tangerine-deeper transition-colors"
        >
          ← Back to sponsorship
        </Link>
      </div>

      <h1 className="font-display text-[28px] text-ink leading-tight tracking-[-0.01em] m-0">
        Your sponsorship of {childName} has a new start date
      </h1>

      {!isQueued ? (
        <ReadOnlyNotice
          reason={
            sponsorship.status !== "active"
              ? `This sponsorship is now ${sponsorshipStatusLabel(sponsorship.status).toLowerCase()}. No further decision is needed.`
              : "This sponsorship isn't queued anymore."
          }
        />
      ) : decisionRecorded ? (
        <DecisionRecordedNotice
          decision={sponsorship.shift_decision ?? "accept"}
          decidedAt={sponsorship.shift_decision_at ?? null}
        />
      ) : (
        <ShiftDecisionCard
          sponsorshipId={sponsorship.id}
          childName={childName}
          childId={childId}
          initialAction={initialAction}
          oldStartsAt={sponsorship.queued_starts_at ?? null}
          newStartsAt={sponsorship.queued_starts_at ?? null}
          shiftRequiredAt={sponsorship.shift_decision_required_at ?? null}
          paymentSchedule={sponsorship.payment_schedule}
          amountUsd={sponsorship.amount_usd}
          durationMonths={sponsorship.duration_months}
        />
      )}
    </div>
  );
}

function ReadOnlyNotice({ reason }: { reason: string }) {
  return (
    <div className="mt-6 rounded-[18px] bg-cream border border-ink/[0.06] px-5 py-4">
      <p className="text-[14px] text-slate leading-[1.6] m-0">{reason}</p>
    </div>
  );
}

function DecisionRecordedNotice({
  decision,
  decidedAt,
}: {
  decision: string;
  decidedAt: string | null;
}) {
  const niceLabel =
    decision === "accept"
      ? "Accepted the new start date"
      : decision === "transfer"
        ? "Transferred to another child"
        : decision === "refund"
          ? "Cancelled and refunded"
          : decision;
  const dateStr = decidedAt
    ? new Date(decidedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <div className="mt-6 rounded-[18px] bg-moss-soft/40 border border-moss/30 px-5 py-4">
      <div className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-deep mb-1">
        Decision recorded
      </div>
      <div className="font-display text-[18px] text-ink leading-tight">
        {niceLabel}
      </div>
      {dateStr ? (
        <div className="mt-1 text-[13px] text-slate-soft">on {dateStr}</div>
      ) : null}
    </div>
  );
}
