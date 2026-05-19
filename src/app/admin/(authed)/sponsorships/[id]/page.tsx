// Session 61 — Admin sponsorship detail page.
//
// Server component. Renders four panels (header, payment history,
// timeline, Stripe charges) plus the SponsorshipActionBar client
// component for pause/resume/cancel/refund.
//
// Reads in parallel:
//   - getAdminSponsorshipDetail(id) — sponsorship row + donor + child
//   - getPaymentsForSponsorship(id) — payment table rows
//   - listChargesForSponsorship(id) — Stripe charges for refund picker
// All three tolerate fetch errors and return empty/null so the page
// always renders.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  Clock,
  CreditCard,
  ExternalLink,
  HeartHandshake,
  Receipt,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminSponsorshipDetail,
  listChargesForSponsorship,
  type AdminSponsorshipDetail,
  type AdminStripeCharge,
} from "@/lib/admin-sponsorships";
import {
  getPaymentsForSponsorship,
  type PaymentRow,
} from "@/lib/sponsorship-data";
import { SponsorshipActionBar } from "@/components/admin/SponsorshipActionBar";

export const dynamic = "force-dynamic";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatMoney(amount: number, currency: string): string {
  return `${(amount ?? 0).toFixed(2)} ${currency || "USD"}`;
}

export default async function AdminSponsorshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();

  const { id } = await params;
  if (!id) notFound();

  const detail = await getAdminSponsorshipDetail(id);
  if (!detail) notFound();

  // Parallel sub-reads. Charges list short-circuits when there's no
  // Stripe customer + no PaymentIntent — both null returns empty.
  const [payments, charges] = await Promise.all([
    getPaymentsForSponsorship(detail.id),
    listChargesForSponsorship(detail.id, {
      customerId: detail.raw.stripe_customer_id,
      paymentIntentId: detail.raw.stripe_payment_intent_id,
      limit: 5,
    }),
  ]);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <Link
        href="/admin/sponsorships?filter=active"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All sponsorships
      </Link>

      <HeaderCard detail={detail} />

      <DonorPanel detail={detail} />

      <ChildPanel detail={detail} />

      <PaymentsPanel payments={payments} currency={detail.raw.currency} />

      <TimelinePanel detail={detail} />

      <SponsorshipActionBar
        sponsorshipId={detail.id}
        status={detail.raw.status}
        paymentMode={detail.raw.payment_mode}
        charges={charges}
      />
    </div>
  );
}

// ─── Header card ───────────────────────────────────────────────────

function HeaderCard({ detail }: { detail: AdminSponsorshipDetail }) {
  return (
    <header className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
      <div className="flex flex-wrap items-baseline gap-2 mb-2">
        <h1 className="font-display text-[22px] md:text-[26px] text-ink leading-tight tracking-tight">
          {detail.child_label}
        </h1>
        <StatusPill status={detail.raw.status} />
        {(detail.raw.queue_position ?? 0) > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-sky/30 text-sky-deep">
            Queue #{detail.raw.queue_position}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <HeartHandshake
            className="w-3.5 h-3.5 stroke-[1.75]"
            aria-hidden="true"
          />
          {detail.donor_label}
        </span>
        <span className="inline-flex items-center gap-1">
          <CreditCard
            className="w-3.5 h-3.5 stroke-[1.75]"
            aria-hidden="true"
          />
          {formatMoney(detail.raw.amount_usd, detail.raw.currency)} ·{" "}
          {detail.payment_label}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
          started {formatDate(detail.raw.started_at)}
        </span>
        <span className="font-mono text-[11px] text-slate-soft">
          {detail.id}
        </span>
      </div>
      {detail.raw.cancellation_reason ? (
        <div className="mt-3 rounded-xl border border-[#A02B2B]/20 bg-[#FCE9E9] p-3 text-[13px] text-[#A02020]">
          <span className="font-semibold">Cancellation reason:</span>{" "}
          {detail.raw.cancellation_reason}
        </div>
      ) : null}
    </header>
  );
}

// ─── Donor panel ────────────────────────────────────────────────────

function DonorPanel({ detail }: { detail: AdminSponsorshipDetail }) {
  return (
    <section
      aria-label="Donor info"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3 inline-flex items-center gap-2">
        <User2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Donor
      </h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
        <DetailField label="Name">
          {[detail.donor_first_name, detail.donor_last_name]
            .filter((s) => s && s.trim().length > 0)
            .join(" ") || "—"}
        </DetailField>
        <DetailField label="Email">
          {detail.donor_email ? (
            <a
              href={`mailto:${detail.donor_email}`}
              className="text-tangerine-deeper hover:underline"
            >
              {detail.donor_email}
            </a>
          ) : (
            "—"
          )}
        </DetailField>
        <DetailField label="Country">
          {detail.donor_country || "—"}
        </DetailField>
        <DetailField label="Signed up">
          {formatDate(detail.donor_signup_at)}
        </DetailField>
        <DetailField label="Total sponsorships">
          {detail.donor_total_sponsorships}
        </DetailField>
        <DetailField label="Visibility">
          {detail.raw.visibility === "named"
            ? "Named (public)"
            : "Anonymous"}
        </DetailField>
      </dl>
    </section>
  );
}

// ─── Child panel ────────────────────────────────────────────────────

function ChildPanel({ detail }: { detail: AdminSponsorshipDetail }) {
  return (
    <section
      aria-label="Child info"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3">Child</h2>
      <div className="flex items-start gap-4">
        {detail.child_photo_uuid ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/assets/${detail.child_photo_uuid}?width=160&height=160&fit=cover&quality=80`}
            alt=""
            width={80}
            height={80}
            className="w-20 h-20 rounded-xl object-cover bg-stone-100 shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-tangerine-mist text-tangerine-deeper inline-flex items-center justify-center font-display text-[20px] shrink-0">
            ?
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-display text-[18px] text-ink">
            {detail.child_label}
          </p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            {detail.child_district ? `${detail.child_district} · ` : ""}
            status: {detail.child_status ?? "—"}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
            {detail.child_id ? (
              <>
                <Link
                  href={`/children/${detail.child_id}`}
                  className="inline-flex items-center gap-1 text-tangerine-deeper hover:underline"
                >
                  Public profile
                  <ArrowUpRight
                    className="w-3 h-3 stroke-[1.75]"
                    aria-hidden="true"
                  />
                </Link>
                <Link
                  href={`/admin/children`}
                  className="inline-flex items-center gap-1 text-tangerine-deeper hover:underline"
                >
                  Admin children list
                  <ArrowUpRight
                    className="w-3 h-3 stroke-[1.75]"
                    aria-hidden="true"
                  />
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Payments panel ────────────────────────────────────────────────

function PaymentsPanel({
  payments,
  currency,
}: {
  payments: PaymentRow[];
  currency: string;
}) {
  return (
    <section
      aria-label="Payment history"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3 inline-flex items-center gap-2">
        <Receipt className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Payments
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft ml-1">
          {payments.length} total
        </span>
      </h2>
      {payments.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft italic">
          No recorded payments for this sponsorship yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-[13.5px] text-ink">
                  <span className="font-medium">
                    {formatMoney(p.amount_usd, p.currency || currency)}
                  </span>{" "}
                  · {p.payment_method_type || "card"} ·{" "}
                  <span className="text-ink-soft">{p.status}</span>
                </p>
                <span className="font-mono text-[11px] text-slate-soft tabular-nums shrink-0">
                  {formatTimestamp(p.paid_at ?? p.date_created)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-slate-soft font-mono break-all">
                {p.stripe_charge_id ?? p.stripe_payment_intent_id ?? "—"}
              </p>
              {p.failure_reason ? (
                <p className="mt-1 text-[12px] text-[#A02020] italic">
                  {p.failure_reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Timeline panel ────────────────────────────────────────────────

/**
 * Status timeline composed from explicit columns on the sponsorship
 * row. We don't have a proper event-log so this is a reconstruction
 * from the persisted timestamps: created → started → modified →
 * paused → cancelled / ended. Empty events are silently skipped.
 */
function TimelinePanel({ detail }: { detail: AdminSponsorshipDetail }) {
  const s = detail.raw;
  type Event = { label: string; iso: string | null; muted?: boolean };
  const events: Event[] = [
    { label: "Created", iso: s.date_created },
    { label: "Activated", iso: s.started_at },
    { label: "Modified", iso: s.modified_at, muted: !s.modified_at },
    { label: "Paused", iso: s.paused_at, muted: !s.paused_at },
    {
      label: "Cancellation scheduled",
      iso: s.cancellation_scheduled_at,
      muted: !s.cancellation_scheduled_at,
    },
    { label: "Cancelled", iso: s.cancelled_at, muted: !s.cancelled_at },
    { label: "Ended", iso: s.ended_at, muted: !s.ended_at },
  ];
  const visible = events.filter((e) => e.iso);
  return (
    <section
      aria-label="Status timeline"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3 inline-flex items-center gap-2">
        <Clock className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Timeline
      </h2>
      {visible.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft italic">
          No state changes recorded yet.
        </p>
      ) : (
        <ol className="relative border-l border-stone-200 pl-5 space-y-3">
          {visible.map((e) => (
            <li key={e.label} className="relative">
              <span className="absolute -left-[1.45rem] top-1.5 w-2.5 h-2.5 rounded-full bg-tangerine" />
              <p className="text-[13px] text-ink">
                <span className="font-medium">{e.label}</span>{" "}
                <span className="text-ink-soft text-[12px]">
                  · {formatTimestamp(e.iso)}
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}

      {s.modification_history && s.modification_history.length > 0 ? (
        <div className="mt-4 pt-3 border-t border-stone-200">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft mb-2">
            Amount changes
          </p>
          <ul className="space-y-1.5 text-[12.5px]">
            {s.modification_history.map((m, i) => (
              <li key={i} className="text-ink-soft">
                {formatMoney(m.from_amount, s.currency)} →{" "}
                <span className="text-ink font-medium">
                  {formatMoney(m.to_amount, s.currency)}
                </span>
                <span className="text-slate-soft"> · {formatDate(m.at)}</span>
                {m.reason ? (
                  <span className="text-slate-soft italic"> ({m.reason})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ─── Small helpers (kept inline to avoid file sprawl) ──────────────

function StatusPill({
  status,
}: {
  status: AdminSponsorshipDetail["raw"]["status"];
}) {
  const styles: Record<
    AdminSponsorshipDetail["raw"]["status"],
    { bg: string; text: string; label: string }
  > = {
    pending_payment: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Pending",
    },
    active: { bg: "bg-moss-soft", text: "text-moss-deep", label: "Active" },
    paused: { bg: "bg-amber-50", text: "text-amber-800", label: "Paused" },
    cancelled: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Cancelled",
    },
    completed: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Ended",
    },
    failed: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Failed",
    },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft">
        {label}
      </dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

// ─── Type re-export so action bar can typecheck against the same shape ─
// (charges flow into the action bar component prop directly)
export type { AdminStripeCharge };
