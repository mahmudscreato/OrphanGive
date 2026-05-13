// Shared formatters, status-badge palette, and presentational atoms used
// by the horizontal SponsorshipCard, the VertSponsorshipCard, and the
// detail page header. Single source of truth for:
//   • SponsorshipStatusBadge (the corner pill)
//   • coverageLine (subtle "Coverage ends Jan 6, 2027" beneath the
//     config line — appears on every monthly card, omitted on one-time)
//   • describeConfig (the "Monthly · $X/mo" headline beneath the name)
//   • bottomInfo (the bottom-row meta grid: Started, Next charge, Contributed)

import { formatUsd } from "@/lib/pricing";
import type { Sponsorship } from "@/lib/sponsorship-data";
import { PendingCardActions } from "./PendingCardActions";

type DisplayStatus = "active" | "completed" | "pending_payment" | "cancelled";

// Filters sponsorships down to ones that should appear on the dashboard.
// Failed/paused rows don't get rendered in any of the donor-facing groupings.
export function isDisplaySponsorship(
  s: Sponsorship,
): s is Sponsorship & { status: DisplayStatus } {
  return (
    s.status === "active" ||
    s.status === "completed" ||
    s.status === "pending_payment" ||
    s.status === "cancelled"
  );
}

// ─── Pill variant + badge palette ────────────────────────────────────────────
//
// Variants compress (status, payment_mode, payment_schedule, cancellation_
// scheduled_at) into one of these tags so every surface uses the same
// classification. The palette below is the locked Part C palette:
//
//   ONE-TIME             — quiet moss
//   ACTIVE indefinite    — tangerine soft (brand orange/amber)
//   ACTIVE fixed-term    — tangerine soft + secondary "ends [Mon YYYY]"
//   PREPAID              — deep moss
//   COMPLETED            — moss-soft sage
//   CANCELLED            — neutral grey
//   PENDING              — tangerine-mist + animated dot (awaiting payment)

export type PillVariant =
  | "active_indefinite"
  | "active_fixed_term"
  | "active_prepaid"
  | "active_one_time"
  | "completed"
  | "pending"
  | "cancelled"
  | "cancellation_pending"
  // Session 14.7: status='active' AND queue_position>0 — paid up
  // front, waiting for an earlier slot to end. Distinct from the
  // active palettes; rendered with a moss tone to read as "future
  // commitment" rather than "currently supporting".
  | "queued";

export function pillVariantFor(s: Sponsorship): PillVariant {
  if (s.cancellation_scheduled_at && s.status === "active") {
    return "cancellation_pending";
  }
  if (s.status === "completed") return "completed";
  if (s.status === "pending_payment") return "pending";
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "active") {
    // Session 14.7: queue-positioned active rows (queue_position>0)
    // are paid + waiting; surface them with a distinct "Upcoming"
    // pill rather than the standard active palette so the donor's
    // dashboard reads honestly about WHICH commitment is currently
    // supporting the child.
    if ((s.queue_position ?? 0) > 0) return "queued";
    if (s.payment_mode === "one_time") return "active_one_time";
    if (s.payment_schedule === "monthly_prepaid") return "active_prepaid";
    if (s.duration_months != null) return "active_fixed_term";
    return "active_indefinite";
  }
  return "cancelled";
}

export function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex items-center px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border " +
        className
      }
    >
      {children}
    </span>
  );
}

// Solid-fill palette set (Part C revision). Each badge has a saturated
// background and white (or near-white) text — gives the dashboard a
// stronger visual rhythm than the previous mist/soft fills, and keeps
// the per-state semantics distinct.
//
// Solid tangerine for ACTIVE recurring (indefinite + fixed-term) — same
// brand orange as primary buttons, "your support is alive".
const ACTIVE_PALETTE = "bg-tangerine text-ink border-tangerine";
// Solid sky-deep for ONE-TIME — a contrasting blue, distinct from the
// orange/moss families so a single completed gift reads instantly.
const ONE_TIME_PALETTE = "bg-sky-deep text-white border-sky-deep";
// Solid slate for COMPLETED — neutral / done / inactive without being
// alarming; reads cleanly against the cream dashboard.
const COMPLETED_PALETTE = "bg-slate text-white border-slate";
// Deep moss for PREPAID — unchanged from earlier Part C; visually
// loudest "this is locked in".
const PREPAID_PALETTE = "bg-moss text-cream border-moss";
// Neutral subtle for CANCELLED — unchanged; present but de-emphasised.
const CANCELLED_PALETTE = "bg-ink/[0.04] text-slate-soft border-ink/[0.08]";
// Soft moss for QUEUED (Session 14.7). Same family as the public
// child banner's "in queue" accent so donors recognize the pairing.
const QUEUED_PALETTE = "bg-moss-soft text-moss-deep border-moss/30";

// The unified status badge. Every sponsorship surface (dashboard home
// preview, /dashboard/sponsorships, sponsorship detail page header)
// renders this — never a bespoke pill.
export function SponsorshipStatusBadge({ s }: { s: Sponsorship }) {
  const variant = pillVariantFor(s);
  switch (variant) {
    case "active_indefinite":
      return <Pill className={ACTIVE_PALETTE}>Active</Pill>;
    case "active_fixed_term":
      return (
        <Pill className={ACTIVE_PALETTE}>
          Active
          {s.scheduled_end_date ? (
            <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-white/85">
              · ends {formatShortMonth(s.scheduled_end_date)}
            </span>
          ) : null}
        </Pill>
      );
    case "active_prepaid":
      return <Pill className={PREPAID_PALETTE}>Prepaid</Pill>;
    case "active_one_time":
      return <Pill className={ONE_TIME_PALETTE}>One-time</Pill>;
    case "completed":
      return <Pill className={COMPLETED_PALETTE}>Completed</Pill>;
    case "pending":
      return (
        <Pill className="bg-tangerine-mist text-tangerine-deep border-tangerine-soft">
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse mr-1.5"
          />
          Pending
        </Pill>
      );
    case "cancellation_pending":
      // Coverage continues until the scheduled date — visually still ACTIVE,
      // with the same "ends [date]" suffix as a fixed-term sponsorship.
      return (
        <Pill className={ACTIVE_PALETTE}>
          Active
          {s.cancellation_scheduled_at ? (
            <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-white/85">
              · ends {formatShortMonth(s.cancellation_scheduled_at)}
            </span>
          ) : null}
        </Pill>
      );
    case "queued":
      return (
        <Pill className={QUEUED_PALETTE}>
          Upcoming
          {s.queued_starts_at ? (
            <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-moss-deep/85">
              · begins {formatShortMonth(s.queued_starts_at)}
            </span>
          ) : null}
        </Pill>
      );
    case "cancelled":
    default:
      return <Pill className={CANCELLED_PALETTE}>Cancelled</Pill>;
  }
}

// ─── Coverage line ───────────────────────────────────────────────────────────
//
// Subtle line shown beneath the config headline on every monthly card.
// Maps each sponsorship state to a single sentence about coverage:
//
//   indefinite recurring     → "Until you cancel"
//   fixed-term recurring     → "Coverage ends Jan 6, 2027"
//   prepaid                  → "Coverage ends Jan 6, 2027"
//   cancellation pending     → "Coverage ends Jan 6, 2027"
//   cancelled                → "Coverage ended Jan 6, 2027"
//   completed                → "Coverage completed Jan 6, 2027"
//   one-time                 → null (no coverage line — single gift)
//   pending payment          → null (not yet active)
export function coverageLine(s: Sponsorship): string | null {
  // One-time gifts and pending-payment rows have no coverage concept.
  if (s.payment_mode === "one_time" || s.status === "pending_payment") {
    return null;
  }

  // Session 14.7: queued rows haven't started supporting yet —
  // surface the future window instead of "Until you cancel".
  if (s.status === "active" && (s.queue_position ?? 0) > 0) {
    const begins = formatLongDate(s.queued_starts_at);
    const ends = formatLongDate(s.queued_ends_at);
    if (begins && ends) return `Coverage runs ${begins} → ${ends}`;
    if (begins) return `Begins ${begins}`;
    return "Begins when the current sponsor's term ends";
  }

  if (s.status === "cancelled") {
    const ended = formatLongDate(s.cancelled_at ?? s.ended_at);
    return ended ? `Coverage ended ${ended}` : "Coverage ended";
  }

  if (s.status === "completed") {
    const ended = formatLongDate(s.ended_at ?? s.scheduled_end_date);
    return ended ? `Coverage completed ${ended}` : "Coverage completed";
  }

  if (s.status === "active") {
    // Cancellation scheduled — coverage runs out on that date.
    if (s.cancellation_scheduled_at) {
      const ends = formatLongDate(s.cancellation_scheduled_at);
      return ends ? `Coverage ends ${ends}` : "Coverage scheduled to end";
    }
    // Prepaid OR fixed-term recurring — coverage runs out on
    // scheduled_end_date.
    if (s.scheduled_end_date) {
      const ends = formatLongDate(s.scheduled_end_date);
      return ends ? `Coverage ends ${ends}` : "Coverage scheduled to end";
    }
    // Indefinite recurring — until the donor cancels.
    return "Until you cancel";
  }

  return null;
}

// ─── Config line + bottom info ───────────────────────────────────────────────
//
// `describeConfig` is the headline beneath the child's name (Inter 14px),
// e.g. "Monthly · $50/mo". It deliberately does NOT include end-date
// information — that's the coverage line's job.
//
// `bottomInfo` is the structured grid at the bottom of each card:
// label/value pairs for Started, Next charge, Contributed, etc.
export function describeConfig(s: Sponsorship): string {
  const variant = pillVariantFor(s);
  const months = s.duration_months ?? 0;

  if (variant === "active_one_time" || s.payment_mode === "one_time") {
    return `One-time gift · ${formatUsd(s.amount_usd)}`;
  }
  if (variant === "completed") {
    const completedMonths = s.duration_months ?? s.prepaid_months_total ?? 0;
    const total = s.amount_usd * (completedMonths || 1);
    return `Sponsored for ${completedMonths} ${
      completedMonths === 1 ? "month" : "months"
    } · ${formatUsd(total)} total`;
  }
  if (s.payment_schedule === "monthly_prepaid") {
    const total = s.prepaid_months_total ?? 0;
    const remaining = s.prepaid_months_remaining ?? 0;
    const upfront = s.amount_usd * total;
    const tailMonths = Math.max(0, (s.duration_months ?? 0) - total);
    if (tailMonths > 0) {
      return `Prepaid for ${total} ${total === 1 ? "month" : "months"}, then ${formatUsd(s.amount_usd)}/mo for ${tailMonths} ${
        tailMonths === 1 ? "month" : "months"
      }`;
    }
    return `Prepaid · ${formatUsd(upfront)} for ${total} ${
      total === 1 ? "month" : "months"
    } (${remaining} remaining)`;
  }
  if (months === 0 || s.duration_months == null) {
    // Indefinite — "until I cancel" copy moved to coverageLine.
    return `Monthly · ${formatUsd(s.amount_usd)}/mo`;
  }
  const remaining = monthsRemainingUntil(s.scheduled_end_date) ?? months;
  return `Monthly · ${formatUsd(s.amount_usd)}/mo · ${months} ${
    months === 1 ? "month" : "months"
  } (${remaining} remaining)`;
}

export type InfoCol = {
  label: string;
  value: React.ReactNode;
};

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-[14px] text-ink whitespace-nowrap">
      {children}
    </span>
  );
}

// Bottom info row. End-date columns ("Coverage ends", "ends Aug 2027") have
// been removed — that information lives in the coverage line above this row
// now. Bottom info focuses on financial / activity facts.
export function bottomInfo(s: Sponsorship): InfoCol[] {
  const v = pillVariantFor(s);
  const totalContributed = formatUsd(Number(s.total_paid_usd ?? 0));

  if (v === "active_one_time") {
    return [
      {
        label: "Received",
        value: (
          <>
            <Mono>{formatLongDate(s.started_at) ?? "—"}</Mono>
            <span className="text-slate-soft"> · </span>
            <Mono>{formatUsd(s.amount_usd)}</Mono>
          </>
        ),
      },
    ];
  }
  if (v === "completed") {
    const completedMonths = s.duration_months ?? s.prepaid_months_total ?? 0;
    return [
      {
        label: "Total",
        value: (
          <Mono>
            {completedMonths} {completedMonths === 1 ? "month" : "months"} · {totalContributed}
          </Mono>
        ),
      },
    ];
  }
  if (v === "pending") {
    return [
      {
        label: "Status",
        value: <PendingCardActions sponsorshipId={s.id} />,
      },
    ];
  }
  if (v === "queued") {
    // Queued rows: surface position + (for prepaid) the upfront
    // amount paid, OR (for recurring trial_end) the per-month rate
    // that will start charging on activation. "Started" is omitted
    // — it hasn't started yet; the coverage line shows "Begins X".
    const position = s.queue_position ?? 0;
    const isPrepaid = s.payment_schedule === "monthly_prepaid";
    const months = s.duration_months ?? s.prepaid_months_total ?? 0;
    return [
      { label: "Position", value: <Mono>{position} in queue</Mono> },
      isPrepaid
        ? {
            label: "Paid up front",
            value: (
              <Mono>
                {formatUsd(s.amount_usd * (months || 1))} · {months}{" "}
                {months === 1 ? "month" : "months"}
              </Mono>
            ),
          }
        : {
            label: "On activation",
            value: (
              <Mono>
                {formatUsd(s.amount_usd)}/mo
                {months ? ` · ${months} ${months === 1 ? "month" : "months"}` : ""}
              </Mono>
            ),
          },
    ];
  }
  if (v === "cancelled") {
    const reason = (s.cancellation_reason ?? "").replace(/_/g, " ");
    return [
      ...(reason ? [{ label: "Reason", value: <Mono>{reason}</Mono> }] : []),
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  if (v === "cancellation_pending") {
    return [
      ...(s.prepaid_months_remaining != null
        ? [
            {
              label: "Coverage",
              value: (
                <Mono>
                  {s.prepaid_months_remaining}{" "}
                  {s.prepaid_months_remaining === 1 ? "month" : "months"}
                </Mono>
              ),
            },
          ]
        : []),
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  if (v === "active_prepaid") {
    return [
      { label: "Started", value: <Mono>{formatLongDate(s.started_at) ?? "—"}</Mono> },
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  if (v === "active_fixed_term") {
    return [
      { label: "Started", value: <Mono>{formatShort(s.started_at) ?? "—"}</Mono> },
      {
        label: "Next charge",
        value: <Mono>{formatShort(s.next_billing_date) ?? "—"}</Mono>,
      },
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  // active_indefinite
  return [
    { label: "Started", value: <Mono>{formatLongDate(s.started_at) ?? "—"}</Mono> },
    { label: "Next charge", value: <Mono>{formatLongDate(s.next_billing_date) ?? "—"}</Mono> },
    { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
  ];
}

export type ChildBits = {
  id: string | null;
  name: string;
  district: string | null;
  age: number | null;
  photoId: string | null;
};

export function childOf(s: Sponsorship): ChildBits {
  if (!s.child || typeof s.child === "string") {
    return {
      id: typeof s.child === "string" ? s.child : null,
      name: "Child",
      district: null,
      age: null,
      photoId: null,
    };
  }
  return {
    id: s.child.id,
    name: s.child.display_name?.trim() || "Child",
    district: s.child.bd_district?.name?.trim() ?? null,
    age: ageFromDob(s.child.date_of_birth ?? null),
    photoId: s.child.Photo ?? null,
  };
}

export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function formatLongDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatShort(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatShortMonth(
  s: string | null | undefined,
): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function monthsRemainingUntil(endIso: string | null): number | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / (30.44 * 24 * 60 * 60 * 1000)));
}
