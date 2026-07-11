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
  Gift,
  HeartHandshake,
  Receipt,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminSponsorshipDetail,
  listAuditEventsForSponsorship,
  listChargesForSponsorship,
  type AdminSponsorshipAuditEvent,
  type AdminSponsorshipDetail,
  type AdminStripeCharge,
} from "@/lib/admin-sponsorships";
import {
  getPaymentsForSponsorship,
  type PaymentRow,
} from "@/lib/sponsorship-data";
import {
  formatDonorAmount,
  formatUsdEquivalent,
  shouldShowUsdEquivalent,
} from "@/lib/donor-currency-format";
import { SponsorshipActionBar } from "@/components/admin/SponsorshipActionBar";
// Donation Lifecycle sub-phase 3 — admin fulfillment exception controls.
import { AdminFulfillmentPanel } from "@/components/admin/AdminFulfillmentPanel";
import { getSponsorshipFulfillment } from "@/lib/sponsorship-fulfillment-fetch";
// Session 69.1 hotfix — wire the standalone StripeLink helper into
// payment-row charge / payment-intent id renders.
import { StripeLink } from "@/components/admin/StripeLink";
// Spine 1.1 — admin field-task creation. Hop 3 of the accountability
// spine per docs/admin-os/02-spine-design.md §2.
import { CreateTaskButton } from "@/components/admin/CreateTaskButton";
import { listAssignableDIs } from "@/lib/admin-tasks";
import { paymentStatusLabel } from "@/lib/status-labels";

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

// Session 61.1 hotfix — same defence-in-depth pattern as the list
// page. See admin-sponsorships.ts for the proper boundary-coercion
// fix; this guard keeps the page resilient if a fresh caller ever
// pipes a raw Directus value through.
function formatMoney(
  amount: number | string | null | undefined,
  currency: string,
): string {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)} ${currency || "USD"}`;
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
  //
  // Session 61.4 hotfix — audit events for the timeline panel. Best-
  // effort; failure returns empty array → timeline falls back to
  // unattributed events.
  const [payments, charges, auditEvents, availableDIs, fulfillment] =
    await Promise.all([
      getPaymentsForSponsorship(detail.id),
      listChargesForSponsorship(detail.id, {
        customerId: detail.raw.stripe_customer_id,
        paymentIntentId: detail.raw.stripe_payment_intent_id,
        limit: 5,
      }),
      listAuditEventsForSponsorship(detail.id, 50),
      // Spine 1.1 — DIs eligible for the "Create field task" affordance,
      // pre-sorted with division-coverers first. Tier-1 fields only.
      listAssignableDIs(detail.child_division_code),
      // Donation Lifecycle sub-phase 3 — admin-side resolver call.
      // We pass `internal` to the panel; donor never sees this.
      getSponsorshipFulfillment(detail.id),
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

      <DonationContextPanel detail={detail} />

      <ChildPanel detail={detail} />

      <PaymentsPanel payments={payments} currency={detail.raw.currency} />

      <TimelinePanel detail={detail} auditEvents={auditEvents} />

      {/* Spine 1.1 — Create field task (hop 3). Sits ABOVE the
          existing pause/cancel/refund action bar because creating
          a task is constructive (start work) whereas the action
          bar is corrective (stop / refund work). */}
      <div className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-[16px] text-ink leading-tight">
            Field work
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-soft leading-relaxed">
            Create a task for the field team — tied to this sponsorship.
          </p>
        </div>
        <CreateTaskButton
          sponsorshipId={detail.id}
          childId={detail.child_id}
          childDisplayName={detail.child_label}
          childDivisionCode={detail.child_division_code}
          childDivisionName={detail.child_division_name}
          availableDIs={availableDIs.map((d) => ({
            id: d.id,
            firstName: d.firstName,
            lastName: d.lastName,
            email: d.email,
            coversChildDivision: d.coversChildDivision,
          }))}
        />
      </div>

      <SponsorshipActionBar
        sponsorshipId={detail.id}
        status={detail.raw.status}
        paymentMode={detail.raw.payment_mode}
        charges={charges}
        isSuperAdmin={session.isSuperAdmin}
      />

      {/* Donation Lifecycle sub-phase 3 — admin fulfillment exception
          controls. Sits BELOW the payment-axis ActionBar so admin
          reads payment lifecycle first (Stripe-driven) and then the
          fulfillment axis (admin-driven). The panel renders the
          resolver's INTERNAL view; the donor's view is rendered
          separately on /dashboard/sponsorship/[id] via the resolver's
          .donor output. */}
      <div className="mt-6">
        <AdminFulfillmentPanel
          sponsorshipId={detail.id}
          internal={fulfillment?.internal ?? null}
        />
      </div>
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
          {/* Session 58.7 → 58.8.1 — symbol-prefixed donor-currency
              primary; USD-equivalent suffix in parentheses (suppressed
              when the donor's own currency IS USD). */}
          {detail.donor_currency_code && detail.donor_currency_amount != null ? (
            <>
              {formatDonorAmount(
                detail.donor_currency_amount,
                detail.donor_currency_code,
              )}
              {shouldShowUsdEquivalent(detail.donor_currency_code) ? (
                <span className="text-stone-400">
                  {" "}(≈ {formatUsdEquivalent(detail.raw.amount_usd)})
                </span>
              ) : null}
            </>
          ) : (
            formatMoney(detail.raw.amount_usd, detail.raw.currency)
          )}{" "}
          · {detail.payment_label}
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

// ─── Donation context panel (Session 58.7) ─────────────────────────
//
// Surfaces the donor-currency + package context that the new
// /api/donate/init flow writes to the row. Renders ONLY when at least
// one of the new-flow columns is populated — legacy sponsorships skip
// the panel entirely so the detail page reads unchanged for them.
//
// Closes the visibility gap diagnosed in Session 58.7: the row was
// always present in admin, but the admin saw "amount_usd: $18" for a
// sponsorship the donor experienced as "18 GBP" with a specific
// package + cause_tag. Same row, different mental model — now both
// match.

function DonationContextPanel({
  detail,
}: {
  detail: AdminSponsorshipDetail;
}) {
  const hasNewFlowContext =
    detail.donor_currency_code != null ||
    detail.donation_package_id != null ||
    detail.cause_tag != null;
  if (!hasNewFlowContext) return null;

  // Session 58.8.1 — symbol-prefixed donor amount (matches the public
  // site rendering). formatDonorAmount handles locale separators +
  // suppresses decimals on whole-unit amounts (৳2,000 not ৳2,000.00).
  const donorCurrencyLine =
    detail.donor_currency_code && detail.donor_currency_amount != null
      ? formatDonorAmount(
          detail.donor_currency_amount,
          detail.donor_currency_code,
        )
      : null;
  // FX rate: e.g. "112.00 BDT / 1 USD" or "1.00 BDT / 1 BDT" (the
  // identity rate when the donor was on BDT — present for symmetry).
  const rateLine =
    detail.bdt_per_unit_at_checkout != null
      ? `${detail.bdt_per_unit_at_checkout.toFixed(2)} BDT / 1 ${detail.donor_currency_code ?? "unit"}`
      : null;

  return (
    <section
      aria-label="Donation context"
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[16px] text-ink mb-3 inline-flex items-center gap-2">
        <Gift className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        Donation context
      </h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
        {donorCurrencyLine ? (
          <DetailField label="Donor paid">
            <span className="font-medium text-ink">{donorCurrencyLine}</span>
            {detail.payment_label.includes("Monthly") ? " / month" : ""}
          </DetailField>
        ) : null}
        {rateLine ? (
          <DetailField label="FX rate at checkout">
            <span className="font-mono">{rateLine}</span>
          </DetailField>
        ) : null}
        {detail.donation_package_id ? (
          <DetailField label="Package">
            {detail.donation_package_name ?? (
              <span
                className="font-mono text-[12px] text-slate-soft"
                title={detail.donation_package_id}
              >
                {detail.donation_package_id.slice(0, 8)}…
              </span>
            )}
          </DetailField>
        ) : null}
        {detail.cause_tag ? (
          <DetailField label="Cause tag">
            <span className="font-mono text-[12.5px]">{detail.cause_tag}</span>
          </DetailField>
        ) : null}
      </dl>
      <p className="mt-3 text-[11.5px] text-slate-soft italic leading-snug">
        The amount in the header is the donor&rsquo;s actual currency.
        The USD equivalent (shown in parentheses) is computed from the
        FX rate snapshotted at checkout and is preserved even if admin
        rates change later — finance reconciliation uses these
        snapshotted values, not live rates.
      </p>
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
                  <span className="text-ink-soft">
                    {paymentStatusLabel(p.status)}
                  </span>
                </p>
                <span className="font-mono text-[11px] text-slate-soft tabular-nums shrink-0">
                  {formatTimestamp(p.paid_at ?? p.date_created)}
                </span>
              </div>
              {/* Session 69.1 hotfix — charge / payment-intent ids
                  now link to the matching Stripe dashboard view.
                  Prefer charge id (deeper route) when present;
                  fall back to payment intent id. */}
              <p className="mt-1 text-[11.5px] break-all">
                {p.stripe_charge_id ? (
                  <StripeLink kind="charge" id={p.stripe_charge_id} />
                ) : p.stripe_payment_intent_id ? (
                  <StripeLink
                    kind="payment_intent"
                    id={p.stripe_payment_intent_id}
                  />
                ) : (
                  <span className="text-slate-soft font-mono">—</span>
                )}
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
 *
 * Session 61.4 hotfix — actor attribution. The audit_log table is
 * the source of truth for "who did this when"; we fetch matching
 * rows in the page's parallel sub-reads and pass them in here. For
 * each timeline event we look up the audit row with the closest
 * timestamp to attach actor name + role + reason.
 *
 * Pause/cancel/resume admin endpoints write rows tagged
 * admin_paused_sponsorship / admin_cancelled_sponsorship /
 * admin_resumed_sponsorship. Donor-side pause/cancel don't audit
 * today (predates the audit layer), so when an event has a column
 * timestamp set but no audit match we infer "by donor".
 */
function TimelinePanel({
  detail,
  auditEvents,
}: {
  detail: AdminSponsorshipDetail;
  auditEvents: AdminSponsorshipAuditEvent[];
}) {
  const s = detail.raw;
  // Each column-derived timeline event is paired with an audit_log
  // action prefix. When the timestamps roughly line up (within a
  // 60s window — accounts for the DB write + audit write happening
  // microseconds apart) we treat the audit row as authoritative for
  // actor + reason.
  type Event = {
    label: string;
    iso: string | null;
    auditActionContains?: string;
  };
  const events: Event[] = [
    { label: "Created", iso: s.date_created },
    { label: "Activated", iso: s.started_at },
    { label: "Modified", iso: s.modified_at },
    {
      label: "Paused",
      iso: s.paused_at,
      auditActionContains: "paused_sponsorship",
    },
    {
      label: "Cancellation scheduled",
      iso: s.cancellation_scheduled_at,
    },
    {
      label: "Cancelled",
      iso: s.cancelled_at,
      auditActionContains: "cancelled_sponsorship",
    },
    { label: "Ended", iso: s.ended_at },
  ];
  const visible = events.filter((e) => e.iso);

  // For each event, find the closest matching audit row (action
  // suffix match + timestamp within 60s). Returns null when no
  // plausible match exists — caller renders a "by donor"
  // inference for actions admin owns but no audit row was found,
  // or no attribution at all for create/activate events that
  // don't correspond to an admin action.
  function attribute(
    event: Event,
  ): { actorLabel: string; reason: string | null } | null {
    if (!event.iso) return null;
    if (!event.auditActionContains) return null;
    const eventMs = Date.parse(event.iso);
    if (Number.isNaN(eventMs)) return null;
    let best: AdminSponsorshipAuditEvent | null = null;
    let bestDelta = Infinity;
    for (const a of auditEvents) {
      if (!a.action.includes(event.auditActionContains)) continue;
      if (!a.timestamp) continue;
      const aMs = Date.parse(a.timestamp);
      if (Number.isNaN(aMs)) continue;
      const delta = Math.abs(aMs - eventMs);
      if (delta <= 60_000 && delta < bestDelta) {
        best = a;
        bestDelta = delta;
      }
    }
    if (best) {
      const roleLabel =
        best.actorRole === "admin"
          ? `admin (${best.actorName})`
          : best.actorRole === "data_inputter"
            ? `DI (${best.actorName})`
            : best.actorRole === "donor"
              ? "donor"
              : best.actorRole === "system"
                ? "system"
                : best.actorName;
      return { actorLabel: roleLabel, reason: best.reason };
    }
    // The event has a timestamp but no matching admin audit row. The
    // mutation must have come from somewhere — donor self-action via
    // /api/sponsorship/[id]/* is the only other path that flips
    // these columns. Donor flow doesn't currently audit, so the
    // inference is reliable.
    return { actorLabel: "donor", reason: null };
  }

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
          {visible.map((e) => {
            const attribution = attribute(e);
            return (
              <li key={e.label} className="relative">
                <span className="absolute -left-[1.45rem] top-1.5 w-2.5 h-2.5 rounded-full bg-tangerine" />
                <p className="text-[13px] text-ink">
                  <span className="font-medium">{e.label}</span>
                  {attribution ? (
                    <span className="text-ink-soft">
                      {" "}
                      by {attribution.actorLabel}
                    </span>
                  ) : null}{" "}
                  <span className="text-ink-soft text-[12px]">
                    · {formatTimestamp(e.iso)}
                  </span>
                </p>
                {attribution?.reason ? (
                  <p className="mt-0.5 text-[12px] text-ink-soft italic">
                    &ldquo;{attribution.reason}&rdquo;
                  </p>
                ) : null}
              </li>
            );
          })}
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
