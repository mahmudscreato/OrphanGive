// Shared formatters, pill variants, and presentational atoms used by
// both the horizontal SponsorshipCard (dashboard home preview, children
// page) and the VertSponsorshipCard (children-page grid layout).

import { formatUsd } from "@/lib/pricing";
import type { Sponsorship } from "@/lib/sponsorship-data";
import { PendingCardActions } from "./PendingCardActions";

type DisplayStatus = "active" | "completed" | "pending_payment" | "cancelled";

// Filters sponsorships down to ones that should appear on the dashboard
// (active, completed, awaiting payment, cancelled). Failed/paused rows
// don't get rendered in any of the donor-facing groupings.
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

export type PillVariant =
  | "active_indefinite"
  | "active_fixed_term"
  | "active_prepaid"
  | "active_one_time"
  | "completed"
  | "pending"
  | "cancelled"
  | "cancellation_pending";

export function pillVariantFor(s: Sponsorship): PillVariant {
  if (s.cancellation_scheduled_at && s.status === "active") {
    return "cancellation_pending";
  }
  if (s.status === "completed") return "completed";
  if (s.status === "pending_payment") return "pending";
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "active") {
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

export function StatusPill({ s }: { s: Sponsorship }) {
  const variant = pillVariantFor(s);
  switch (variant) {
    case "active_indefinite":
      return <Pill className="bg-moss-soft text-moss border-moss/30">Active</Pill>;
    case "active_fixed_term":
      return (
        <Pill className="bg-moss-soft text-moss border-moss/30">
          Active
          {s.scheduled_end_date ? (
            <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-moss/70">
              ends {formatShortMonth(s.scheduled_end_date)}
            </span>
          ) : null}
        </Pill>
      );
    case "active_prepaid":
      return <Pill className="bg-moss text-cream border-moss">Prepaid</Pill>;
    case "active_one_time":
      return (
        <Pill className="bg-moss-soft text-moss border-moss/30">One-time</Pill>
      );
    case "completed":
      return (
        <Pill className="bg-moss-soft text-moss border-moss/30">
          Completed
          <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-moss/70">
            fulfilled
          </span>
        </Pill>
      );
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
    case "cancellation_pending": {
      const ends = formatShortMonth(s.cancellation_scheduled_at);
      return (
        <Pill className="bg-moss-soft text-moss border-moss/30">
          Will end
          {ends ? (
            <span className="ml-1.5 font-body text-[9px] tracking-[0.06em] normal-case text-tangerine-deep">
              {ends}
            </span>
          ) : null}
        </Pill>
      );
    }
    case "cancelled":
    default:
      return (
        <Pill className="bg-ink/[0.04] text-slate-soft border-ink/[0.08]">
          Cancelled
        </Pill>
      );
  }
}

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
  if (variant === "cancellation_pending") {
    const ends = formatLongDate(
      s.cancellation_scheduled_at ?? s.scheduled_end_date,
    );
    return ends
      ? `Coverage continues until ${ends}, then sponsorship ends`
      : "Coverage continues, then sponsorship ends";
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
    return `Monthly · ${formatUsd(s.amount_usd)}/mo · until I cancel`;
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
        label: "Completed",
        value: <Mono>{formatLongDate(s.ended_at ?? s.scheduled_end_date) ?? "—"}</Mono>,
      },
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
  if (v === "cancelled") {
    const reason = (s.cancellation_reason ?? "").replace(/_/g, " ");
    return [
      { label: "Cancelled", value: <Mono>{formatLongDate(s.cancelled_at ?? s.ended_at) ?? "—"}</Mono> },
      ...(reason ? [{ label: "Reason", value: <Mono>{reason}</Mono> }] : []),
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  if (v === "cancellation_pending") {
    return [
      {
        label: "Cancellation pending",
        value: (
          <Mono>
            Will end {formatLongDate(s.cancellation_scheduled_at) ?? "—"}
          </Mono>
        ),
      },
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
      { label: "Coverage ends", value: <Mono>{formatLongDate(s.scheduled_end_date) ?? "—"}</Mono> },
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
  if (v === "active_fixed_term") {
    return [
      { label: "Started", value: <Mono>{formatShort(s.started_at) ?? "—"}</Mono> },
      {
        label: "Next charge",
        value: (
          <Mono>
            {formatShort(s.next_billing_date) ?? "—"}
            {s.scheduled_end_date ? (
              <span className="text-slate-soft"> · ends {formatShort(s.scheduled_end_date)}</span>
            ) : null}
          </Mono>
        ),
      },
      { label: "Contributed", value: <Mono>{totalContributed}</Mono> },
    ];
  }
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
