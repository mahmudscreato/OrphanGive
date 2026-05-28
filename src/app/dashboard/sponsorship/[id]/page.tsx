import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import {
  getApprovedChildUpdates,
  getPaymentsForSponsorship,
  getSponsorshipForDonor,
  type ChildUpdate,
  type PaymentRow,
  type Sponsorship,
} from "@/lib/sponsorship-data";
import { formatUsd } from "@/lib/pricing";
import { formatSponsorshipAmount } from "@/app/dashboard/components/sponsorshipCardHelpers";
import { labelForCause } from "@/lib/cause";
import { SponsorshipStatusBadge } from "@/app/dashboard/components/sponsorshipCardHelpers";
import { SponsorshipActions } from "./SponsorshipActions";
import { QueuedActions } from "./QueuedActions";
import { VisibilityEditor } from "./VisibilityEditor";
import { ReSupportButtons } from "./ReSupportButtons";
import { GiveMoreCTA } from "./GiveMoreCTA";
import { InactiveChildNotice } from "./InactiveChildNotice";
// Donation Lifecycle sub-phase 2 — fulfillment status display.
// Reads resolver.donor ONLY; the internal view (with privateReason)
// never reaches this page.
import { FulfillmentPanel } from "./FulfillmentPanel";
import { getSponsorshipFulfillment } from "@/lib/sponsorship-fulfillment-fetch";
import { paymentStatusLabel } from "@/lib/status-labels";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sponsorship — OrphanGive",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DisplayStatus =
  | "active"
  | "prepaid"
  | "paused"
  | "completed"
  | "cancelled";

export default async function SponsorshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const donor = await getCurrentDonor();
  const state = getDonorState(donor);
  if (state === "unauthenticated") {
    redirect(`/signin?next=/dashboard/sponsorship/${id}`);
  }
  if (state !== "approved") {
    // Pending/suspended/rejected donors don't see this page.
    redirect("/dashboard");
  }
  const sponsorship = await getSponsorshipForDonor(id, donor!.id);
  if (!sponsorship) notFound();

  // Parallel-load secondary data.
  const childObj =
    typeof sponsorship.child === "string" ? null : sponsorship.child;
  const childId =
    typeof sponsorship.child === "string"
      ? sponsorship.child
      : sponsorship.child.id;
  const [payments, updates, fulfillment] = await Promise.all([
    getPaymentsForSponsorship(sponsorship.id),
    getApprovedChildUpdates(childId, 20),
    // Donation Lifecycle sub-phase 2 — resolves fulfillment phase
    // from sponsorship row + latest task + latest report. Returns
    // both internal + donor views; we use ONLY .donor on this page.
    getSponsorshipFulfillment(sponsorship.id),
  ]);

  const childName = childObj?.display_name?.trim() || "Child";
  const childPhoto = childObj?.Photo ?? null;
  const district = childObj?.bd_district?.name?.trim() ?? null;
  const age = ageFromDob(childObj?.date_of_birth ?? null);
  // Session 14.7c: child.status drives the inactive-child fallback.
  // When the row is no longer 'active' in Directus, the re-support
  // buttons would route to a /sponsor/[childId] that 404s — instead
  // we render an off-ramp to /children. status defaults to 'active'
  // when the field is missing (legacy rows, public-tier responses).
  const childIsActive = (childObj?.status ?? "active") === "active";
  // Queued row (status='active' AND queue_position>0): existing
  // cancel-queued surface only; no re-support / give-more affordance
  // since the donor is already queued to start supporting.
  const isQueuedRow = (sponsorship.queue_position ?? 0) > 0;

  const status = normalizeStatus(sponsorship);

  const totalContributed = payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + Number(p.amount_usd ?? 0), 0);

  return (
    <div className="max-w-[720px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
        <Link
          href="/dashboard/sponsorships"
          className="text-[13.5px] text-slate-soft hover:text-tangerine-deeper transition-colors"
        >
          ← Back to children
        </Link>
        <SponsorshipStatusBadge s={sponsorship} />
      </div>

      {/* Cause label sits between the back-link/badge row and the child
          card so it leads visually — donor sees "supporting EDUCATION
          AND LEARNING for Fuad Hasan" as one read. */}
      <div className="mb-3 font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep">
        {labelForCause(sponsorship.cause)}
      </div>

      {/* Child summary card */}
      <ChildCard
        childId={childId}
        childName={childName}
        photoId={childPhoto}
        district={district}
        age={age}
      />

      {/* Sponsorship summary */}
      <SponsorshipSummary
        sponsorship={sponsorship}
        status={status}
        totalContributed={totalContributed}
      />

      <p className="mt-4 text-[12.5px] text-slate-soft italic leading-snug max-w-[640px]">
        Allocated by Children&rsquo;s Heaven Trust based on operational
        need. Your stated intent guides allocation but funds may be
        applied where most needed.
      </p>

      {/* Donation Lifecycle sub-phase 2 — fulfillment phase panel.
          The resolver returns null when the donation hasn't entered
          fulfillment yet (sponsorship.status='pending_payment'); we
          hide the panel in that case so the donor sees the existing
          "Awaiting payment" treatment without competing affordances. */}
      {fulfillment?.donor ? (
        <FulfillmentPanel donor={fulfillment.donor} />
      ) : null}

      {/* Actions — hidden entirely for completed/cancelled. The
          SponsorshipActions client component itself decides which
          modal to surface for "Add more months" based on the
          sponsorship's type (recurring / prepaid / indefinite).
          Session 14.7 Phase 2: queued rows (queue_position > 0) get
          QueuedActions instead — only "Cancel & refund" (and optional
          "Review change" CTA when shift_decision_required) make sense
          before the slot activates. SponsorshipActions' Add-more-
          months / Cancel modals would call routes that don't know
          about the queue lifecycle and leave the queue unwound. */}
      {status !== "completed" && status !== "cancelled" ? (
        isQueuedRow ? (
          <QueuedActions
            sponsorshipId={sponsorship.id}
            childName={childName}
            paymentSchedule={sponsorship.payment_schedule}
            amountUsd={sponsorship.amount_usd}
            durationMonths={sponsorship.duration_months}
            shiftDecisionRequired={Boolean(
              sponsorship.shift_decision_required,
            )}
          />
        ) : (
          <section className="mt-10">
            <SponsorshipActions
              sponsorshipId={sponsorship.id}
              paymentMode={sponsorship.payment_mode}
              status={status}
              amountUsd={sponsorship.amount_usd}
              childId={childId}
              childName={childName}
              nextBillingDate={sponsorship.next_billing_date}
              durationMonths={sponsorship.duration_months}
              paymentSchedule={sponsorship.payment_schedule}
              prepaidMonthsTotal={sponsorship.prepaid_months_total}
              prepaidMonthsRemaining={sponsorship.prepaid_months_remaining}
              scheduledEndDate={sponsorship.scheduled_end_date}
            />
          </section>
        )
      ) : null}

      {/* Session 14.7c re-support paths.
          Branch by row state + child state:
            • Queued (queue_position > 0)  → no re-support / give-more
              affordance. The existing cancel-queued lives in
              SponsorshipActions above; the donor is already paid up
              and waiting, no need to nudge them to give more.
            • Child inactive in Directus    → kind off-ramp to /children.
              Skips the re-support buttons entirely because routing to
              /sponsor/[childId] would 404.
            • Active (non-queued)           → "Want to give more?" CTA
              for an additional one-time gift to the same child. Sits
              below the management cluster with a moss separator so
              the two intents read distinctly.
            • Completed / Cancelled         → primary "Sponsor again"
              + secondary "the other mode" buttons. Both route through
              /sponsor/[childId]?mode=… */}
      {!isQueuedRow ? (
        !childIsActive ? (
          <InactiveChildNotice childName={childName} />
        ) : status === "completed" || status === "cancelled" ? (
          <ReSupportButtons
            childId={childId}
            childName={childName}
            originalPaymentMode={sponsorship.payment_mode}
          />
        ) : (
          <GiveMoreCTA
            childId={childId}
            childName={childName}
            alreadyOneTime={sponsorship.payment_mode === "one_time"}
          />
        )
      ) : null}

      {/* Editable visibility — only meaningful while the sponsorship
          can affect a public surface. Hidden for completed/cancelled
          rows where the row is finalized. */}
      {status !== "completed" && status !== "cancelled" ? (
        <VisibilityEditor
          sponsorshipId={sponsorship.id}
          initialVisibility={sponsorship.visibility}
          donorFirstName={donor!.first_name?.trim() ?? null}
        />
      ) : null}

      {/* Payments */}
      <PaymentsSection payments={payments} />

      {/* Child updates */}
      <UpdatesSection updates={updates} childName={childName} />
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────
function ChildCard({
  childId,
  childName,
  photoId,
  district,
  age,
}: {
  childId: string;
  childName: string;
  photoId: string | null;
  district: string | null;
  age: number | null;
}) {
  const photoSrc = directusAssetUrl(photoId);
  const sub = [district, age != null ? `age ${age}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="rounded-[20px] bg-white border border-ink/[0.06] px-6 py-5 flex items-center gap-5 max-md:px-5">
      <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-tangerine-mist shrink-0">
        {photoSrc ? (
          <ProtectedChildImage
            src={photoSrc}
            alt={childName}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[28px]">
            {childName.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-[28px] text-ink leading-tight tracking-[-0.01em] m-0">
          {childName}
        </h1>
        {sub ? (
          <div className="text-[14px] text-slate-soft mt-1">{sub}</div>
        ) : null}
        <Link
          href={`/children/${childId}`}
          className="inline-flex mt-2 items-center gap-1 text-[13px] text-tangerine-deeper hover:opacity-80 underline-offset-4 hover:underline"
        >
          View profile →
        </Link>
      </div>
    </section>
  );
}

function SponsorshipSummary({
  sponsorship,
  status,
  totalContributed,
}: {
  sponsorship: Sponsorship;
  status: DisplayStatus;
  totalContributed: number;
}) {
  const startedAt = formatDate(sponsorship.started_at);
  const endedAt = formatDate(sponsorship.ended_at);
  const cancelledAt = formatDate(sponsorship.cancelled_at ?? sponsorship.ended_at);
  const pausedAt = formatDate(sponsorship.paused_at);
  const nextAt = formatDate(sponsorship.next_billing_date);
  const scheduledEnd = formatDate(sponsorship.scheduled_end_date);

  // Headline label + value mirror the dashboard cards' config.
  const isPrepaid = sponsorship.payment_schedule === "monthly_prepaid";
  const isFixedTermRecurring =
    sponsorship.payment_mode === "monthly" &&
    sponsorship.payment_schedule === "monthly" &&
    sponsorship.duration_months != null;

  let typeLabel: string;
  let typeValue: React.ReactNode;
  // Session 58.10 — donor-currency-first via formatSponsorshipAmount.
  // For prepaid, multiplier=N gives the upfront total in donor units.
  if (sponsorship.payment_mode === "one_time") {
    typeLabel = "One-time gift";
    typeValue = (
      <span className="font-display font-medium text-ink text-[20px]">
        {formatSponsorshipAmount(sponsorship)}
      </span>
    );
  } else if (isPrepaid) {
    const total = sponsorship.prepaid_months_total ?? 0;
    typeLabel = "Prepaid";
    typeValue = (
      <span>
        <span className="font-display font-medium text-ink text-[20px]">
          {formatSponsorshipAmount(sponsorship, total)}
        </span>
        <span className="font-body text-[13px] text-slate ml-1">
          for {total} {total === 1 ? "month" : "months"}
        </span>
      </span>
    );
  } else {
    typeLabel = "Monthly";
    typeValue = (
      <span>
        <span className="font-display font-medium text-ink text-[20px]">
          {formatSponsorshipAmount(sponsorship)}
        </span>
        <span className="font-body text-[13px] text-slate ml-0.5">/month</span>
        {isFixedTermRecurring ? (
          <span className="font-body text-[13px] text-slate-soft ml-2">
            · {sponsorship.duration_months} months
          </span>
        ) : null}
      </span>
    );
  }

  // Progress for fixed-term + prepaid.
  let progressLabel: string | null = null;
  let progressValue: string | null = null;
  if (isFixedTermRecurring && sponsorship.duration_months) {
    const total = sponsorship.duration_months;
    const completedMonths = Math.max(
      0,
      Math.min(total, total - (monthsRemainingUntil(sponsorship.scheduled_end_date) ?? 0)),
    );
    progressLabel = "Progress";
    progressValue = `Month ${Math.max(1, completedMonths + 1)} of ${total}`;
  } else if (isPrepaid && sponsorship.prepaid_months_total) {
    progressLabel = "Months remaining";
    progressValue = `${sponsorship.prepaid_months_remaining ?? 0} of ${sponsorship.prepaid_months_total}`;
  }

  return (
    <section className="mt-6 rounded-[20px] bg-white border border-ink/[0.06] px-6 py-5 max-md:px-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
        <Field label="Sponsoring since" value={startedAt ?? "—"} />
        <Field label={typeLabel} value={typeValue} />
        <Field
          label="Total contributed"
          value={
            <span className="font-display font-medium text-ink text-[20px]">
              {formatUsd(totalContributed)}
            </span>
          }
        />
        {progressLabel && progressValue ? (
          <Field label={progressLabel} value={progressValue} />
        ) : null}
        {status === "active" &&
        sponsorship.payment_mode === "monthly" &&
        !isPrepaid &&
        nextAt ? (
          <Field
            label="Next charge"
            value={
              isFixedTermRecurring && scheduledEnd ? (
                <span>
                  {nextAt}
                  <span className="text-slate-soft"> · Ends {scheduledEnd}</span>
                </span>
              ) : (
                nextAt
              )
            }
          />
        ) : null}
        {isPrepaid && scheduledEnd ? (
          <Field label="Coverage ends" value={scheduledEnd} />
        ) : null}
        {status === "paused" && pausedAt ? (
          <Field label="Paused since" value={pausedAt} />
        ) : null}
        {status === "completed" ? (
          <Field
            label="Completed"
            value={
              <span>
                {endedAt ?? "—"}
                <span className="text-slate-soft">
                  {" · "}
                  {sponsorship.duration_months ?? sponsorship.prepaid_months_total ?? "—"}-month commitment fulfilled
                </span>
              </span>
            }
          />
        ) : null}
        {status === "cancelled" && cancelledAt ? (
          <Field
            label="Ended"
            value={
              <span>
                {cancelledAt}
                {sponsorship.cancellation_reason ? (
                  <span className="text-slate-soft">
                    {" · "}
                    {sponsorship.cancellation_reason.replace(/_/g, " ")}
                  </span>
                ) : null}
              </span>
            }
          />
        ) : null}
      </div>
    </section>
  );
}

// Best-effort "months between today and end date" using 30.44-day months
// (matches the cancel_at scheduling in /api/checkout/init). 0 if past.
function monthsRemainingUntil(endIso: string | null): number | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / (30.44 * 24 * 60 * 60 * 1000)));
}

function PaymentsSection({ payments }: { payments: PaymentRow[] }) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-[22px] text-ink mb-4">Payments</h2>
      {payments.length === 0 ? (
        <p className="text-[14px] text-slate-soft">No payments yet.</p>
      ) : (
        <ul className="space-y-2">
          {payments.map((p) => (
            <PaymentRowItem key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentRowItem({ p }: { p: PaymentRow }) {
  const date = formatDate(p.paid_at ?? p.date_created);
  const isSucceeded = p.status === "succeeded";
  const isFailed = p.status === "failed";
  const statusClass = isSucceeded
    ? "bg-moss-soft text-moss-deep border-moss/30"
    : isFailed
      ? "bg-[#FEEFEF] text-[#A02B2B] border-[#F4C7C7]"
      : "bg-tangerine-mist text-tangerine-deep border-tangerine-soft";
  const receiptHref = p.stripe_charge_id
    ? `https://dashboard.stripe.com/payments/${p.stripe_charge_id}`
    : null;
  return (
    <li className="rounded-[14px] bg-white border border-ink/[0.06] px-4 py-3 flex items-center justify-between gap-3 max-md:flex-wrap">
      <div className="flex items-center gap-4 min-w-0">
        <div className="font-mono text-[12px] text-slate-soft tracking-[0.05em] tabular-nums w-32 shrink-0">
          {date ?? "—"}
        </div>
        <div className="font-display text-[16px] text-ink shrink-0">
          {formatUsd(Number(p.amount_usd ?? 0))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${statusClass}`}
        >
          {paymentStatusLabel(p.status)}
        </span>
        {receiptHref ? (
          <a
            href={receiptHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-tangerine-deeper hover:opacity-80 underline-offset-4 hover:underline"
          >
            Receipt →
          </a>
        ) : null}
      </div>
    </li>
  );
}

function UpdatesSection({
  updates,
  childName,
}: {
  updates: ChildUpdate[];
  childName: string;
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-[22px] text-ink mb-4">
        Updates from {childName}
      </h2>
      {updates.length === 0 ? (
        <p className="text-[14px] text-slate-soft">
          No updates yet. We&rsquo;ll post here when {childName}&rsquo;s next
          update is shared.
        </p>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => (
            <UpdateItem key={u.id} u={u} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UpdateItem({ u }: { u: ChildUpdate }) {
  const photoSrc = directusAssetUrl(u.photo);
  const date = formatDate(u.published_at);
  return (
    <li className="rounded-[16px] bg-white border border-ink/[0.06] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <h3 className="font-display text-[17px] text-ink m-0 leading-tight">
          {u.title?.trim() || "Update"}
        </h3>
        <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase text-slate-soft">
          {date ?? ""}
        </span>
      </div>
      {photoSrc ? (
        <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-tangerine-mist mb-3">
          <ProtectedChildImage
            src={photoSrc}
            alt={u.title ?? "Update"}
            fill
            sizes="(max-width: 720px) 100vw, 720px"
            quality={85}
            className="object-cover"
          />
        </div>
      ) : null}
      {u.content ? (
        <p className="text-[14.5px] text-ink leading-[1.65] whitespace-pre-line">
          {u.content}
        </p>
      ) : null}
    </li>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────────
function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-slate-soft mb-1">
        {label}
      </div>
      <div className="text-[15px] text-ink leading-tight">{value}</div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Maps the DB status (+ payment_schedule) to a richer display status.
// A sponsorship with status='active' AND payment_schedule='monthly_prepaid'
// is shown with the deeper "Prepaid" pill instead of the standard Active.
function normalizeStatus(s: Sponsorship): DisplayStatus {
  if (s.status === "completed") return "completed";
  if (s.status === "paused") return "paused";
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "active") {
    return s.payment_schedule === "monthly_prepaid" ? "prepaid" : "active";
  }
  // pending_payment / failed / anything else → fall back to "active"
  // tone (the page itself decides whether to render actions).
  if (s.status === "pending_payment") return "active";
  return "cancelled";
}
