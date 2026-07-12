// Donation Lifecycle — sub-phase 2 — donor-facing fulfillment panel.
//
// Renders the resolver's `.donor` view ONLY. The internal view —
// which carries `privateReason` (admin's full reason) + `source`
// / `detail` debug fields — must NEVER be passed to this component.
// The prop signature enforces this at compile time: this component
// only accepts `FulfillmentDonorView`.
//
// Visual: a warm card mirroring the rest of the dashboard. Phase
// pill uses the brand palette: tangerine for in-flight (pending /
// processing / in_delivery), moss for delivered, amber for
// exceptions, slate for terminal cancelled/refunded. The pill
// + headline read as one statement; subcopy lives below.
//
// Q5 composite: when `sponsorshipEndedAt` is set on a delivered
// phase, the subcopy gets a small "• Sponsorship ended on …"
// suffix, matching the design's locked Q5 phrasing.

import { CheckCircle2, Clock, FileBarChart, RotateCcw, ShieldAlert, Sparkles, Truck, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  FulfillmentDonorView,
  FulfillmentPhase,
} from "@/lib/fulfillment-status";

interface PhaseStyle {
  pillBg: string;
  pillText: string;
  cardBorder: string;
  cardAccent: string;
  Icon: LucideIcon;
}

const PHASE_STYLES: Record<FulfillmentPhase, PhaseStyle> = {
  pending: {
    pillBg: "bg-tangerine-mist",
    pillText: "text-tangerine-deep",
    cardBorder: "border-tangerine-soft",
    cardAccent: "bg-tangerine-mist",
    Icon: Sparkles,
  },
  processing: {
    pillBg: "bg-tangerine",
    pillText: "text-white",
    cardBorder: "border-tangerine-soft",
    cardAccent: "bg-tangerine-mist",
    Icon: Clock,
  },
  in_delivery: {
    pillBg: "bg-tangerine-deep",
    pillText: "text-white",
    cardBorder: "border-tangerine/40",
    cardAccent: "bg-tangerine-mist",
    Icon: Truck,
  },
  delivered: {
    pillBg: "bg-moss",
    pillText: "text-white",
    cardBorder: "border-moss/30",
    cardAccent: "bg-moss-soft",
    Icon: CheckCircle2,
  },
  // fix/donor-ui-consistency — off-palette amber-*/stone-* → brand tokens.
  // Warning phases (on_hold/disputed) use the warm tangerine family (like
  // processing/in_delivery); terminal/neutral phases (refund*/cancelled)
  // use the slate/ink neutrals. Delivered stays moss.
  on_hold: {
    pillBg: "bg-tangerine-mist",
    pillText: "text-tangerine-deep",
    cardBorder: "border-tangerine-soft",
    cardAccent: "bg-tangerine-mist",
    Icon: RotateCcw,
  },
  disputed: {
    pillBg: "bg-tangerine-soft",
    pillText: "text-tangerine-deep",
    cardBorder: "border-tangerine/40",
    cardAccent: "bg-tangerine-mist",
    Icon: ShieldAlert,
  },
  refund_requested: {
    pillBg: "bg-slate-mist",
    pillText: "text-ink",
    cardBorder: "border-ink/[0.12]",
    cardAccent: "bg-linen",
    Icon: FileBarChart,
  },
  refunded: {
    pillBg: "bg-ink",
    pillText: "text-white",
    cardBorder: "border-ink/[0.12]",
    cardAccent: "bg-linen",
    Icon: FileBarChart,
  },
  cancelled: {
    pillBg: "bg-slate",
    pillText: "text-white",
    cardBorder: "border-ink/[0.12]",
    cardAccent: "bg-linen",
    Icon: XCircle,
  },
};

const PHASE_LABELS: Record<FulfillmentPhase, string> = {
  pending: "Pending",
  processing: "Processing",
  in_delivery: "In delivery",
  delivered: "Delivered",
  on_hold: "On hold",
  disputed: "Under review",
  refund_requested: "Refund processing",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

function formatLongDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) {
    const m = Math.round(diffDays / 30);
    return `${m} ${m === 1 ? "month" : "months"} ago`;
  }
  const y = Math.round(diffDays / 365);
  return `${y} ${y === 1 ? "year" : "years"} ago`;
}

/**
 * Render the donor's fulfillment view. Accept ONLY the donor view
 * shape — there is no path for `internal` data to reach this
 * component.
 */
export function FulfillmentPanel({
  donor,
}: {
  donor: FulfillmentDonorView;
}) {
  const style = PHASE_STYLES[donor.phase];
  const Icon = style.Icon;
  const phaseLabel = PHASE_LABELS[donor.phase];

  // "Since" copy. For delivered, prefer the absolute date (donors
  // want to remember when their report arrived); for everything
  // else, the relative time is friendlier.
  const sinceCopy =
    donor.phase === "delivered"
      ? formatLongDate(donor.since)
      : formatRelative(donor.since);

  // Q5 terminal composite: render the sponsorship-ended date next
  // to the delivered phase. The design's locked phrasing is
  // "Delivered • Sponsorship ended [date]" — we surface that as
  // a small line beneath the subcopy.
  const sponsorshipEndedCopy = donor.sponsorshipEndedAt
    ? formatLongDate(donor.sponsorshipEndedAt)
    : null;

  return (
    <section
      aria-label="Fulfillment status"
      className={`mt-6 rounded-[20px] bg-white border ${style.cardBorder} overflow-hidden`}
    >
      <div className={`px-6 py-5 max-md:px-5 ${style.cardAccent}`}>
        <div className="flex items-start gap-4">
          <div
            className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl ${style.pillBg} ${style.pillText}`}
          >
            <Icon className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] uppercase tracking-[0.12em] font-medium ${style.pillBg} ${style.pillText}`}
              >
                {phaseLabel}
              </span>
              {sinceCopy ? (
                <span className="text-[12.5px] text-slate-soft">
                  · {sinceCopy}
                </span>
              ) : null}
            </div>
            <h2 className="font-display text-[20px] text-ink leading-tight tracking-[-0.01em] m-0">
              {donor.headline}
            </h2>
            <p className="mt-1.5 text-[14.5px] text-slate leading-relaxed">
              {donor.subcopy}
            </p>
            {sponsorshipEndedCopy ? (
              <p className="mt-2 text-[12.5px] text-slate-soft italic">
                Sponsorship ended on {sponsorshipEndedCopy}.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
