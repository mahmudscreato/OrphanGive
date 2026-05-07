// Renders the donor's sponsorships in three groups:
//   1. Active        — moss pill, full card with thumbnail + details
//   2. Pending       — tangerine pill, dimmed card, "Awaiting first payment"
//   3. Cancelled     — collapsed <details> at the bottom
//
// Empty groups are hidden. The "Active" header is suppressed when it's
// the only group on screen so a typical donor sees the simplest layout.

import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatUsd } from "@/lib/pricing";
import type { Sponsorship } from "@/lib/sponsorship-data";
import { PendingCardActions } from "./PendingCardActions";

type DisplayStatus = "active" | "pending_payment" | "cancelled";

const STATUS_PILL: Record<DisplayStatus, string> = {
  active:          "bg-moss-soft text-moss border-moss/30",
  pending_payment: "bg-tangerine-mist text-tangerine-deep border-tangerine-soft",
  cancelled:       "bg-ink/[0.04] text-slate-soft border-ink/[0.08]",
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  active:          "Active",
  pending_payment: "Pending",
  cancelled:       "Cancelled",
};

// Used by /dashboard/page.tsx to decide whether to render this section
// at all vs. show <EmptyDonorState />. We include "cancelled" so a donor
// whose only sponsorships are cancelled still sees them (collapsed).
export function isDisplaySponsorship(
  s: Sponsorship,
): s is Sponsorship & { status: DisplayStatus } {
  return (
    s.status === "active" ||
    s.status === "pending_payment" ||
    s.status === "cancelled"
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

type ChildBits = {
  id: string | null;
  name: string;
  district: string | null;
  age: number | null;
  photoId: string | null;
};
function childOf(s: Sponsorship): ChildBits {
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

// ─── Card pieces ────────────────────────────────────────────────────────────
function ChildThumb({ photoId, name }: { photoId: string | null; name: string }) {
  const src = directusAssetUrl(photoId);
  return (
    <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-tangerine-mist shrink-0">
      {src ? (
        <ProtectedChildImage
          src={src}
          alt={name}
          width={96}
          height={96}
          quality={85}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-tangerine font-display text-[14px]">
          {name.charAt(0)}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${STATUS_PILL[status]}`}
    >
      {status === "pending_payment" ? (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse"
        />
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

function AmountInline({
  amountUsd,
  paymentMode,
}: {
  amountUsd: number;
  paymentMode: Sponsorship["payment_mode"];
}) {
  return (
    <div className="text-right whitespace-nowrap">
      <span className="font-display font-medium text-[20px] text-ink tracking-[-0.01em]">
        {formatUsd(amountUsd)}
      </span>
      <span className="font-body text-[13px] text-slate ml-0.5">
        {paymentMode === "monthly" ? "/month" : " one-time"}
      </span>
    </div>
  );
}

function ActiveCard({ s }: { s: Sponsorship & { status: "active" } }) {
  const c = childOf(s);
  const sub = [c.district, c.age != null ? `age ${c.age}` : null]
    .filter(Boolean)
    .join(" · ");
  const startedAt = formatDate(s.started_at);
  const nextAt = formatDate(s.next_billing_date);
  const bottom =
    s.payment_mode === "monthly"
      ? nextAt
        ? `Next charge: ${nextAt}`
        : null
      : startedAt
        ? `Started ${startedAt}`
        : null;

  return (
    <li className="rounded-[18px] bg-white border border-ink/[0.06] px-5 py-4">
      <div className="flex items-center gap-4 max-md:flex-wrap">
        <ChildThumb photoId={c.photoId} name={c.name} />
        <div className="flex-1 min-w-0">
          {c.id ? (
            <Link
              href={`/children/${c.id}`}
              className="font-display text-[17px] text-ink leading-tight hover:text-tangerine-deep transition-colors"
            >
              {c.name}
            </Link>
          ) : (
            <span className="font-display text-[17px] text-ink leading-tight">
              {c.name}
            </span>
          )}
          {sub ? (
            <div className="text-[13px] text-slate-soft mt-0.5">{sub}</div>
          ) : null}
        </div>
        <AmountInline
          amountUsd={s.amount_usd}
          paymentMode={s.payment_mode}
        />
        <div className="shrink-0">
          <StatusPill status="active" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-ink/[0.04] flex items-center justify-between gap-3 max-md:flex-wrap">
        <div className="font-mono text-[11px] text-slate-soft tracking-[0.1em] uppercase">
          {bottom ?? "—"}
        </div>
        <Link
          href={`/dashboard/sponsorship/${s.id}`}
          className="text-[12px] text-tangerine-deep hover:opacity-80 underline-offset-4 hover:underline whitespace-nowrap"
        >
          View details →
        </Link>
      </div>
    </li>
  );
}

function PendingCard({
  s,
}: {
  s: Sponsorship & { status: "pending_payment" };
}) {
  const c = childOf(s);
  const sub = [c.district, c.age != null ? `age ${c.age}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className="rounded-[18px] bg-ink/[0.025] border border-ink/[0.06] px-5 py-4 opacity-70"
      aria-label={`Pending sponsorship of ${c.name}`}
    >
      <div className="flex items-center gap-4 max-md:flex-wrap">
        <ChildThumb photoId={c.photoId} name={c.name} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-[17px] text-ink leading-tight">
            {c.name}
          </div>
          {sub ? (
            <div className="text-[13px] text-slate-soft mt-0.5">{sub}</div>
          ) : null}
        </div>
        <AmountInline
          amountUsd={s.amount_usd}
          paymentMode={s.payment_mode}
        />
        <div className="shrink-0">
          <StatusPill status="pending_payment" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-ink/[0.04]">
        <PendingCardActions sponsorshipId={s.id} />
      </div>
    </li>
  );
}

function CancelledCard({
  s,
}: {
  s: Sponsorship & { status: "cancelled" };
}) {
  const c = childOf(s);
  const cancelledAt = formatDate(s.cancelled_at ?? s.ended_at);
  return (
    <li
      className="rounded-[14px] bg-cream border border-ink/[0.06] px-4 py-3 flex items-center justify-between gap-3 max-md:flex-wrap"
      aria-label={`Cancelled sponsorship of ${c.name}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <ChildThumb photoId={c.photoId} name={c.name} />
        <div className="min-w-0">
          <div className="text-[14px] text-slate font-medium leading-tight">
            {c.name}
          </div>
          <div className="font-mono text-[10px] text-slate-soft tracking-[0.08em] uppercase mt-0.5">
            {cancelledAt ? `Cancelled ${cancelledAt}` : "Cancelled"}
            {s.cancellation_reason
              ? ` · ${s.cancellation_reason.replace(/_/g, " ")}`
              : ""}
          </div>
        </div>
      </div>
      <StatusPill status="cancelled" />
    </li>
  );
}

// ─── Main section ───────────────────────────────────────────────────────────
export function SponsorshipsSection({ items }: { items: Sponsorship[] }) {
  const active = items.filter(
    (s): s is Sponsorship & { status: "active" } => s.status === "active",
  );
  const pending = items.filter(
    (s): s is Sponsorship & { status: "pending_payment" } =>
      s.status === "pending_payment",
  );
  const cancelled = items.filter(
    (s): s is Sponsorship & { status: "cancelled" } => s.status === "cancelled",
  );

  // Nothing to show — empty-state copy lives here in case the parent
  // switches to "always render section" later. Today the dashboard's
  // EmptyDonorState typically handles this branch.
  if (active.length === 0 && pending.length === 0 && cancelled.length === 0) {
    return (
      <section>
        <SectionHeader />
        <p className="mt-4 text-[14px] text-slate-soft">
          Your sponsorships will appear here once you&rsquo;ve supported a
          child.
        </p>
      </section>
    );
  }

  // The "Active" header is suppressed when it's the only group present —
  // so a typical donor with just active sponsorships sees the simplest
  // version of the section.
  const groupCount =
    (active.length > 0 ? 1 : 0) +
    (pending.length > 0 ? 1 : 0) +
    (cancelled.length > 0 ? 1 : 0);
  const showActiveHeader = groupCount > 1;

  return (
    <section>
      <SectionHeader />

      {active.length > 0 ? (
        <div className="mt-7">
          {showActiveHeader ? <GroupHeader label="Active" /> : null}
          <GroupBody
            items={active}
            renderItem={(s) => <ActiveCard key={s.id} s={s} />}
            listClassName="space-y-3"
          />
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-8">
          <GroupHeader label="Pending payment" pulsing />
          <GroupBody
            items={pending}
            renderItem={(s) => <PendingCard key={s.id} s={s} />}
            listClassName="space-y-3"
          />
        </div>
      ) : null}

      {cancelled.length > 0 ? (
        <details className="mt-8 group">
          <summary className="list-none cursor-pointer flex items-center gap-2 text-[12px] font-mono uppercase tracking-[0.12em] text-slate-soft hover:text-slate transition-colors">
            <span className="inline-block w-2 transition-transform group-open:rotate-90">
              ▸
            </span>
            <span>Cancelled ({cancelled.length})</span>
          </summary>
          <div className="mt-3">
            <GroupBody
              items={cancelled}
              renderItem={(s) => <CancelledCard key={s.id} s={s} />}
              listClassName="space-y-2"
            />
          </div>
        </details>
      ) : null}
    </section>
  );
}

// Splits a group's items by payment_mode and renders subheaders only if
// the donor has BOTH modes in this group. Single-mode donors see a
// plain list with no subheader.
function GroupBody<T extends Sponsorship>({
  items,
  renderItem,
  listClassName,
}: {
  items: T[];
  renderItem: (s: T) => React.ReactNode;
  listClassName: string;
}) {
  const monthly = items.filter((s) => s.payment_mode === "monthly");
  const oneTime = items.filter((s) => s.payment_mode === "one_time");
  const showSubheaders = monthly.length > 0 && oneTime.length > 0;

  if (!showSubheaders) {
    return <ul className={listClassName}>{items.map(renderItem)}</ul>;
  }
  return (
    <>
      {monthly.length > 0 ? (
        <div>
          <SubHeader label="Monthly support" />
          <ul className={listClassName}>{monthly.map(renderItem)}</ul>
        </div>
      ) : null}
      {oneTime.length > 0 ? (
        <div className="mt-5">
          <SubHeader label="One-time gifts" />
          <ul className={listClassName}>{oneTime.map(renderItem)}</ul>
        </div>
      ) : null}
    </>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <h4 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-soft mb-2 mt-0">
      {label}
    </h4>
  );
}

function SectionHeader() {
  return (
    <div className="max-w-[640px]">
      <div className="eyebrow-tag">Sponsorships</div>
      <h2 className="font-display font-normal mt-3 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.75rem,3.25vw,2.5rem)]">
        Your sponsorships.
      </h2>
    </div>
  );
}

function GroupHeader({
  label,
  pulsing = false,
}: {
  label: string;
  pulsing?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-slate-soft m-0">
        {label}
      </h3>
      {pulsing ? (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full bg-tangerine animate-pulse"
        />
      ) : null}
    </div>
  );
}

export default SponsorshipsSection;
