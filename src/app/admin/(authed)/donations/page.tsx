// Donation Lifecycle sub-phase 3 — Donations queue (admin overview).
//
// Lists every sponsorship with its FULFILLMENT phase + filter pills.
// This is the operational view for "what's stuck where" — distinct
// from /admin/sponsorships which surfaces the payment axis.
// Click-through to the sponsorship detail page (where the controls
// + the payment-axis actions both live).

import Link from "next/link";
import { ChevronRight, HeartHandshake } from "lucide-react";
import {
  listAdminDonations,
  listDonationPhases,
  type AdminDonationRow,
  type DonationsPhaseFilter,
} from "@/lib/admin-donations";

export const dynamic = "force-dynamic";

function isPhase(s: string | undefined): s is DonationsPhaseFilter {
  return (
    s === "all" ||
    s === "pending" ||
    s === "processing" ||
    s === "in_delivery" ||
    s === "delivered" ||
    s === "on_hold" ||
    s === "disputed" ||
    s === "refund_requested" ||
    s === "refunded" ||
    s === "cancelled"
  );
}

const PHASE_PILL: Record<
  AdminDonationRow["phase"],
  { bg: string; text: string }
> = {
  pending: { bg: "bg-tangerine-mist", text: "text-tangerine-deep" },
  processing: { bg: "bg-tangerine", text: "text-white" },
  in_delivery: { bg: "bg-tangerine-deep", text: "text-white" },
  delivered: { bg: "bg-moss", text: "text-white" },
  on_hold: { bg: "bg-amber-100", text: "text-amber-900" },
  disputed: { bg: "bg-amber-200", text: "text-amber-900" },
  refund_requested: { bg: "bg-stone-200", text: "text-stone-800" },
  refunded: { bg: "bg-stone-700", text: "text-white" },
  cancelled: { bg: "bg-stone-500", text: "text-white" },
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function AdminDonationsPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>;
}) {
  const sp = await searchParams;
  const phaseFilter: DonationsPhaseFilter = isPhase(sp.phase) ? sp.phase : "all";

  const donations = await listAdminDonations({ phaseFilter });
  const phases = listDonationPhases();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Donations
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Fulfillment overview — every gift's journey from pending to
          delivered. Click through to set on-hold / disputed / refund-requested
          on the sponsorship detail page.
        </p>
        <p className="mt-2 text-[12px] text-slate-soft italic max-w-2xl">
          Independent of payment status. The Stripe-driven status
          (active / paused / cancelled) lives on /admin/sponsorships.
        </p>
      </header>

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by fulfillment phase">
        {phases.map((p) => {
          const active = phaseFilter === p.value;
          const href = p.value === "all" ? "/admin/donations" : `/admin/donations?phase=${p.value}`;
          return (
            <Link
              key={p.value}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 inline-flex items-center h-9 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
                active
                  ? "bg-tangerine text-white"
                  : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-tangerine-deeper"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>

      {donations.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-4">
            <HeartHandshake className="w-7 h-7 stroke-[1.5]" aria-hidden="true" />
          </div>
          <p className="font-display text-[20px] text-ink mb-1">
            No donations in this phase
          </p>
          <p className="text-[14px] text-ink-soft">
            Try a different filter — or take a breath, you&apos;re caught up.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {donations.map((d) => (
            <DonationRow key={d.id} row={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DonationRow({ row }: { row: AdminDonationRow }) {
  const pill = PHASE_PILL[row.phase];
  return (
    <li>
      <Link
        href={`/admin/sponsorships/${row.id}`}
        className="group flex items-start gap-3 rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
      >
        <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
          <HeartHandshake className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] uppercase tracking-[0.12em] font-medium ${pill.bg} ${pill.text}`}
            >
              {row.phaseLabel}
            </span>
            {row.hasExceptionReason ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium bg-stone-100 text-stone-700">
                Donor-visible reason set
              </span>
            ) : null}
            <span className="text-[12px] text-ink-soft">
              · {row.paymentMode === "monthly" ? "Monthly" : "One-time"}
            </span>
            <span className="text-[12px] text-ink-soft">
              · ${row.amountUsd.toFixed(2)} {row.currency}
            </span>
          </div>
          <p className="mt-0.5 font-display text-[16px] text-ink leading-snug truncate">
            {row.donorLabel} → {row.childLabel}
          </p>
          <p className="mt-1 text-[12.5px] text-slate-soft">
            {row.donorEmail ?? "(no email)"} · source:{" "}
            <code className="font-mono text-[11.5px]">{row.source ?? "—"}</code>
            {row.phaseSince ? ` · since ${formatTimestamp(row.phaseSince)}` : null}
            {row.startedAt ? ` · started ${formatTimestamp(row.startedAt)}` : null}
          </p>
        </div>
        <ChevronRight
          className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
