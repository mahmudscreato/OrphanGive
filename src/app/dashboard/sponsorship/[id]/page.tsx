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
import { SponsorshipActions } from "./SponsorshipActions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sponsorship — OrphanGive",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DisplayStatus = "active" | "paused" | "cancelled";

const STATUS_PILL: Record<DisplayStatus, string> = {
  active:    "bg-moss-soft text-moss border-moss/30",
  paused:    "bg-sky/20 text-sky border-sky/30",
  cancelled: "bg-ink/[0.04] text-slate-soft border-ink/[0.08]",
};
const STATUS_LABEL: Record<DisplayStatus, string> = {
  active:    "Active",
  paused:    "Paused",
  cancelled: "Cancelled",
};

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
  const [payments, updates] = await Promise.all([
    getPaymentsForSponsorship(sponsorship.id),
    getApprovedChildUpdates(childId, 20),
  ]);

  const childName = childObj?.display_name?.trim() || "Child";
  const childPhoto = childObj?.Photo ?? null;
  const district = childObj?.bd_district?.name?.trim() ?? null;
  const age = ageFromDob(childObj?.date_of_birth ?? null);

  const status = normalizeStatus(sponsorship.status);

  const totalContributed = payments
    .filter((p) => p.status === "succeeded")
    .reduce((acc, p) => acc + Number(p.amount_usd ?? 0), 0);

  return (
    <main className="bg-cream min-h-screen">
      <section className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <div className="max-w-[720px] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <Link
              href="/dashboard"
              className="text-[13.5px] text-slate-soft hover:text-tangerine-deep transition-colors"
            >
              ← Dashboard
            </Link>
            <StatusPill status={status} />
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

          {/* Actions */}
          {sponsorship.payment_mode === "monthly" && status !== "cancelled" ? (
            <section className="mt-10">
              <SponsorshipActions
                sponsorshipId={sponsorship.id}
                paymentMode={sponsorship.payment_mode}
                status={status}
                amountUsd={sponsorship.amount_usd}
                childName={childName}
                nextBillingDate={sponsorship.next_billing_date}
              />
            </section>
          ) : sponsorship.payment_mode === "one_time" ? (
            <p className="mt-10 text-[13.5px] text-slate-soft italic">
              One-time sponsorships cannot be modified.
            </p>
          ) : null}

          {/* Payments */}
          <PaymentsSection payments={payments} />

          {/* Child updates */}
          <UpdatesSection updates={updates} childName={childName} />
        </div>
      </section>
    </main>
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
          className="inline-flex mt-2 items-center gap-1 text-[13px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline"
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
  const cancelledAt = formatDate(sponsorship.cancelled_at ?? sponsorship.ended_at);
  const pausedAt = formatDate(sponsorship.paused_at);
  const nextAt = formatDate(sponsorship.next_billing_date);

  return (
    <section className="mt-6 rounded-[20px] bg-white border border-ink/[0.06] px-6 py-5 max-md:px-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-md:grid-cols-1">
        <Field label="Sponsoring since" value={startedAt ?? "—"} />
        <Field
          label={sponsorship.payment_mode === "monthly" ? "Monthly" : "One-time"}
          value={
            <span>
              <span className="font-display font-medium text-ink text-[20px]">
                {formatUsd(sponsorship.amount_usd)}
              </span>
              <span className="font-body text-[13px] text-slate ml-0.5">
                {sponsorship.payment_mode === "monthly" ? "/month" : " gift"}
              </span>
            </span>
          }
        />
        <Field
          label="Total contributed"
          value={
            <span className="font-display font-medium text-ink text-[20px]">
              {formatUsd(totalContributed)}
            </span>
          }
        />
        {status === "active" && sponsorship.payment_mode === "monthly" && nextAt ? (
          <Field label="Next charge" value={nextAt} />
        ) : null}
        {status === "paused" && pausedAt ? (
          <Field label="Paused since" value={pausedAt} />
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
    ? "bg-moss-soft text-moss border-moss/30"
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
          {p.status}
        </span>
        {receiptHref ? (
          <a
            href={receiptHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline"
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
function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${STATUS_PILL[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

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

function normalizeStatus(s: string): DisplayStatus {
  if (s === "active" || s === "paused" || s === "cancelled") return s;
  // Anything else (pending_payment, completed, failed) renders as
  // "cancelled" tone for the pill so the UI doesn't break — the page
  // also hides actions in that case.
  if (s === "pending_payment") return "active";
  return "cancelled";
}
