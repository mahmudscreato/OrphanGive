// Session 65 — Admin donor detail page.
//
// Server component. Audits every view (admin_viewed_donor) before
// rendering — same traceability rule as admin_viewed_proposal.
//
// Panels:
//   1. Account summary header (name, email, signup, last access,
//      approval pill, account status, KYC-style consent timestamp)
//   2. Contact panel (phone, country, profile photo, Stripe customer id)
//   3. Sponsorships panel — table of sponsorships with status pill +
//      amount + child name link
//   4. Payments aggregate panel — lifetime giving, charge count,
//      avg monthly, last payment date
//   5. Account actions (client component DonorActionBar) — approve,
//      reject, suspend, reactivate, send password reset
//
// Communication log: brief asks for "any emails sent to this donor"
// from the existing notify system. The notify() helper writes to the
// `notification` collection but for DI recipients only — donors don't
// receive in-app notifications today. Filed for follow-up; this page
// shows a stub message in place of the log so admin knows to expect
// it later.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminDonorDetail,
  type AdminDonorDetail,
  type AdminDonorSponsorship,
  type DonorAccountStatus,
  type DonorApprovalStatus,
} from "@/lib/admin-donors";
import { recordAuditEvent } from "@/lib/di-audit";
import { DonorActionBar } from "@/components/admin/DonorActionBar";
// Session 69.1 hotfix — wire the standalone StripeLink helper into
// the donor's Stripe customer id render.
import { StripeLink } from "@/components/admin/StripeLink";
import {
  formatDonorAmount,
  formatUsdEquivalent,
  shouldShowUsdEquivalent,
} from "@/lib/donor-currency-format";

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

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDateOnly(iso);
}

function formatMoneyUsd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function AdminDonorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();

  const { id } = await params;
  if (!id) notFound();

  const detail = await getAdminDonorDetail(id);
  if (!detail) notFound();

  // Audit the view before rendering. recordAuditEvent swallows
  // failures so we never block the page.
  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_donor",
    collection: "directus_users",
    recordId: detail.id,
    metadata: {
      // Include the approval/account state at view-time for
      // forensic clarity ("admin looked at this donor while they
      // were pending"). No PII fields here — email/phone live on
      // the donor row, not in the audit metadata.
      approval_status: detail.approval_status,
      account_status: detail.account_status,
    },
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Back link */}
      <Link
        href="/admin/donors"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All donors
      </Link>

      <AccountHeader detail={detail} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <ContactPanel detail={detail} />
        <PaymentsPanel detail={detail} />
      </div>

      <div className="mt-5">
        <SponsorshipsPanel sponsorships={detail.sponsorships} />
      </div>

      <div className="mt-5">
        <CommunicationLogStub />
      </div>

      <div className="mt-5">
        <DonorActionBar
          donorId={detail.id}
          approvalStatus={detail.approval_status}
          accountStatus={detail.account_status}
          isSuperAdmin={session.isSuperAdmin}
        />
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────

function AccountHeader({ detail }: { detail: AdminDonorDetail }) {
  return (
    <header className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
      <div className="flex items-start gap-4">
        {detail.profile_photo_url ? (
          // Plain <img> rather than next/image because the avatar is
          // small + decorative and Cloudinary preconnect is already
          // in the root layout.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.profile_photo_url}
            alt=""
            className="w-14 h-14 rounded-full object-cover bg-stone-100 shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-stone-100 inline-flex items-center justify-center shrink-0">
            <User2
              className="w-6 h-6 text-stone-500 stroke-[1.75]"
              aria-hidden="true"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight truncate">
              {detail.display_name}
            </h1>
            <ApprovalPill status={detail.approval_status} />
            <AccountStatusPill status={detail.account_status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
            <span className="inline-flex items-center gap-1 truncate">
              <Mail
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              {detail.email || "(no email)"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              Signed up {formatRelative(detail.date_created)}
            </span>
            <span className="text-stone-400">·</span>
            <span>Last active {formatRelative(detail.last_access)}</span>
          </div>
          {detail.approval_decided_at ? (
            <p className="mt-2 text-[12.5px] text-ink-soft">
              Approval decision recorded {formatTimestamp(detail.approval_decided_at)}.
            </p>
          ) : null}
          {detail.agreed_to_terms_at ? (
            <p className="text-[12.5px] text-ink-soft">
              Terms accepted {formatTimestamp(detail.agreed_to_terms_at)}.
            </p>
          ) : (
            <p className="text-[12.5px] text-amber-700">
              Terms acceptance not recorded — predates the gate or never
              agreed.
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Contact ───────────────────────────────────────────────────────

function ContactPanel({ detail }: { detail: AdminDonorDetail }) {
  return (
    <section
      aria-label="Contact"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Contact</h2>
      <dl className="space-y-3 text-[14px]">
        <Row
          icon={<Phone className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />}
          label="Phone"
          value={detail.phone ?? "—"}
        />
        <Row
          icon={<MapPin className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />}
          label="Country"
          value={
            detail.country_name
              ? `${detail.country_name}${detail.country_code ? ` (${detail.country_code})` : ""}`
              : "—"
          }
        />
        <Row
          icon={<CreditCard className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />}
          label="Stripe customer"
          value={
            // Session 69.1 hotfix — StripeLink renders the id as a
            // monospace link to the test/live Stripe dashboard (the
            // helper picks the right base via STRIPE_SECRET_KEY).
            // Falls back to the previous "none yet" italic when the
            // donor has no customer record yet.
            <StripeLink
              kind="customer"
              id={detail.stripe_customer_id}
              fallback={
                <span className="text-ink-soft italic">none yet</span>
              }
            />
          }
        />
      </dl>
      {/* Full address: brief mentions og_full_address_encrypted —
          but the donor-data.ts FULL_FIELDS doesn't read it (it's not
          in the donor policy's allow-list). Skipped for now so we
          don't show a misleading "—" against a field that exists in
          schema but admins can't actually read on this page. Filed
          for follow-up if admin needs it surfaced. */}
    </section>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-ink-soft mt-1 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium">
          {label}
        </dt>
        <dd className="text-ink mt-0.5 break-words">{value}</dd>
      </div>
    </div>
  );
}

// ─── Payments ──────────────────────────────────────────────────────

function PaymentsPanel({ detail }: { detail: AdminDonorDetail }) {
  const { payments } = detail;
  return (
    <section
      aria-label="Payment summary"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Payment summary</h2>
      <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-[14px]">
        <Metric
          label="Lifetime giving"
          value={formatMoneyUsd(payments.lifetime_giving_usd)}
          emphasise
        />
        <Metric label="Total charges" value={String(payments.total_charge_count)} />
        <Metric
          label="Active sponsorships"
          value={String(payments.active_sponsorship_count)}
        />
        <Metric
          label="Avg monthly"
          value={
            payments.avg_monthly_usd === null
              ? "—"
              : formatMoneyUsd(payments.avg_monthly_usd)
          }
        />
        <Metric
          label="Last payment"
          value={formatDateOnly(payments.last_payment_iso)}
        />
      </dl>
      <p className="mt-4 text-[12px] text-ink-soft leading-relaxed">
        Last-payment date is approximated from the most recent active
        sponsorship&apos;s <code>started_at</code>; a per-charge feed
        ships when sponsorship_charge gets an admin reader.
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium">
        {label}
      </dt>
      <dd
        className={`mt-0.5 ${
          emphasise
            ? "font-display text-[22px] text-ink"
            : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Sponsorships ──────────────────────────────────────────────────

function SponsorshipsPanel({
  sponsorships,
}: {
  sponsorships: AdminDonorSponsorship[];
}) {
  return (
    <section
      aria-label="Sponsorships"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[18px] text-ink">Sponsorships</h2>
        <span className="text-[12.5px] text-ink-soft">
          {sponsorships.length} total
        </span>
      </div>
      {sponsorships.length === 0 ? (
        <p className="text-[14px] text-ink-soft italic">
          This donor has not started any sponsorships yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {sponsorships.map((s) => (
            <SponsorshipRow key={s.id} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SponsorshipRow({ s }: { s: AdminDonorSponsorship }) {
  const childHref = s.child_id ? `/children/${s.child_id}` : null;
  // Session 58.9 — distinguish campaign donations (no child) from
  // legacy "unknown child" data corruption. A row with no child_id
  // AND any new-flow signal is a campaign gift — label it as such
  // (with the cause_tag when present). True data gaps still show
  // "Unnamed child".
  const isCampaignDonation =
    !s.child_id &&
    (s.cause_tag != null || s.donation_package_id != null);
  const displayLabel = s.child_name
    ? s.child_name
    : isCampaignDonation
      ? s.cause_tag
        ? `Campaign: ${s.cause_tag}`
        : "Campaign donation"
      : "Unnamed child";
  return (
    <li className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          {childHref ? (
            <Link
              href={childHref}
              className="font-medium text-ink hover:text-tangerine-deeper transition-colors"
            >
              {displayLabel}
            </Link>
          ) : (
            <span className="font-medium text-ink">{displayLabel}</span>
          )}
          <SponsorshipStatusPill status={s.status} />
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
            {s.payment_mode === "one_time" ? "One-time" : "Monthly"}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
          {/* Session 58.9 — donor-currency-first when present;
              amount_usd fallback for legacy rows. Suffix suppressed
              for USD donors to avoid "$18 (≈ $18 USD)". */}
          {s.donor_currency_code && s.donor_currency_amount != null ? (
            <>
              {formatDonorAmount(
                s.donor_currency_amount,
                s.donor_currency_code,
              )}
              {shouldShowUsdEquivalent(s.donor_currency_code) ? (
                <span className="text-stone-400">
                  {" "}(≈ {formatUsdEquivalent(s.amount_usd)})
                </span>
              ) : null}
            </>
          ) : (
            <>
              {formatMoneyUsd(s.amount_usd)} {s.currency}
            </>
          )}
          {" · "}
          Started {formatDateOnly(s.started_at)}
          {" · "}
          Paid {formatMoneyUsd(s.total_paid_usd)} across {s.payment_count}{" "}
          charge{s.payment_count === 1 ? "" : "s"}
        </p>
      </div>
      <ChevronRight
        className="w-4 h-4 mt-1 text-stone-400 stroke-[1.75] shrink-0"
        aria-hidden="true"
      />
    </li>
  );
}

function SponsorshipStatusPill({ status }: { status: string }) {
  // Inline-resolve known statuses; anything unknown falls through to
  // a neutral pill so we don't crash on a new status someone added.
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    pending_payment: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Pending payment",
    },
    active: { bg: "bg-moss-soft", text: "text-moss-deep", label: "Active" },
    paused: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Paused",
    },
    cancelled: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Cancelled",
    },
    completed: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Completed",
    },
    failed: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Failed",
    },
  };
  const s = styles[status] ?? {
    bg: "bg-stone-100",
    text: "text-stone-700",
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

// ─── Communication log stub ────────────────────────────────────────

function CommunicationLogStub() {
  return (
    <section
      aria-label="Communication log"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-2">
        Communication log
      </h2>
      <p className="text-[13.5px] text-ink-soft leading-relaxed">
        Donor-facing emails (approval, password reset, payment receipts) flow
        through Directus + Stripe today and aren&apos;t tracked in a dedicated
        per-donor log yet. Coming in a follow-up session — for now use the
        audit log + Directus mail dashboard.
      </p>
    </section>
  );
}

// ─── Pills ─────────────────────────────────────────────────────────

function ApprovalPill({ status }: { status: DonorApprovalStatus }) {
  const styles: Record<
    DonorApprovalStatus,
    { bg: string; text: string; label: string }
  > = {
    // Approval gate removed — 'pending' / 'not_started' donors are already
    // sponsorship-capable once OTP-verified, so a neutral "Not required"
    // (not an amber "Pending") avoids reading as "awaiting your review".
    pending: { bg: "bg-stone-100", text: "text-stone-700", label: "Not required" },
    approved: {
      bg: "bg-moss-soft",
      text: "text-moss-deep",
      label: "Approved",
    },
    rejected: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Rejected",
    },
    not_started: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Not required",
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

function AccountStatusPill({ status }: { status: DonorAccountStatus }) {
  // Suspended is the only non-active status worth flagging at the
  // header level. 'active' is the happy path so we skip it; 'draft'
  // / 'pending_email_verification' get an amber tag.
  if (status === "active") return null;
  const styles: Record<
    Exclude<DonorAccountStatus, "active">,
    { bg: string; text: string; label: string }
  > = {
    suspended: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      label: "Suspended",
    },
    draft: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Email unverified",
    },
    pending_email_verification: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Email unverified",
    },
    unknown: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Unknown state",
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
