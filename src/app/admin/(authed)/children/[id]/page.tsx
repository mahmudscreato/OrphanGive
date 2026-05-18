// Session 66 — Admin child detail page.
//
// Server component. Audits the view (admin_viewed_child) before
// rendering. Renders seven panels:
//
//   1. Header card — name, age, status pill, sponsor state pill,
//      "Preview as donor" link to /children/[id]
//   2. Admin info — DI submitter, assigned DI, intake date,
//      last update, sponsor state breakdown
//   3. Editable surface preview — Tier 1 + Tier 2 + Tier 3 fields
//      laid out as a definition list. Edit button → /edit subroute.
//   4. Documents — list of every child_document row with status pill
//      + per-row "Request re-upload" button
//   5. Intake photos — grid; status pills; "Request re-upload" per
//      photo. Admin sees photos UN-blurred (no /api/assets blur
//      transform applied).
//   6. Sponsorships — active + queued, linking back to (future)
//      /admin/sponsorships when that ships. For V1 we surface IDs +
//      Stripe ref + amount/status so admin can trace via Stripe.
//   7. Audit log — last 30 entries touching this child via the
//      existing listAuditEventsForChild reader.
//   8. Admin actions (client component) — edit shortcut + archive +
//      reactivate. Re-upload requests live in their respective
//      panels.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminChildDetail,
  listAdminAuditEventsForChild,
  type AdminAuditEvent,
  type AdminChildDetail,
  type AdminChildSponsorState,
} from "@/lib/admin-children";
import { getDocumentsForChild } from "@/lib/admin-documents";
import { getIntakePhotosForChild } from "@/lib/admin-intake-photos";
import { getQueueForChild } from "@/lib/queue";
import { recordAuditEvent } from "@/lib/di-audit";
import { AdminChildActionBar } from "@/components/admin/AdminChildActionBar";
import { ReuploadRequestButton } from "@/components/admin/ReuploadRequestButton";

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
  return formatDate(iso);
}

function formatMoneyBdt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function AdminChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const detail = await getAdminChildDetail(id);
  if (!detail) notFound();

  // Parallel fetches for panels.
  const [documents, intakePhotos, queue, auditEvents] = await Promise.all([
    getDocumentsForChild(detail.id),
    getIntakePhotosForChild(detail.id),
    getQueueForChild(detail.id),
    listAdminAuditEventsForChild(detail.id, 30),
  ]);

  // Audit the view — fires AFTER the data fetch so a Directus
  // failure on data load doesn't generate a misleading "admin
  // viewed" row. recordAuditEvent swallows internally.
  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_child",
    collection: "child",
    recordId: detail.id,
    metadata: {
      status: detail.status,
      sponsor_state: detail.sponsor_state,
    },
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      <Link
        href="/admin/children"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All children
      </Link>

      <HeaderCard detail={detail} />

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AdminInfoPanel detail={detail} />
        <ProfilePreviewPanel detail={detail} />
      </div>

      <div className="mt-5">
        <DocumentsPanel
          childId={detail.id}
          documents={documents}
        />
      </div>

      <div className="mt-5">
        <IntakePhotosPanel
          childId={detail.id}
          photos={intakePhotos}
        />
      </div>

      <div className="mt-5">
        <SponsorshipsPanel queue={queue} />
      </div>

      <div className="mt-5">
        <AuditPanel events={auditEvents} />
      </div>

      <div className="mt-5">
        <AdminChildActionBar
          childId={detail.id}
          status={detail.status}
        />
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────

function HeaderCard({ detail }: { detail: AdminChildDetail }) {
  return (
    <header className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
      <div className="flex items-start gap-4">
        {detail.photo_uuid ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${detail.photo_uuid}?width=160&height=160&fit=cover&format=auto`}
            alt={detail.display_name}
            className="w-20 h-20 rounded-2xl object-cover bg-stone-100 shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-stone-100 inline-flex items-center justify-center shrink-0">
            <User2
              className="w-8 h-8 text-stone-400 stroke-[1.75]"
              aria-hidden="true"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display text-[26px] md:text-[30px] text-ink leading-tight tracking-tight truncate">
              {detail.display_name}
            </h1>
            <StatusPill status={detail.status} />
            <SponsorStatePill
              state={detail.sponsor_state}
              active={detail.active_sponsor_count}
              queued={detail.queued_sponsor_count}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
            {detail.age !== null ? <span>Age {detail.age}</span> : null}
            {detail.date_of_birth ? (
              <span>DOB {formatDate(detail.date_of_birth)}</span>
            ) : null}
            <span>
              {[detail.district_name, detail.division_name]
                .filter(Boolean)
                .join(", ") || "Location unknown"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              Updated {formatRelative(detail.date_updated ?? detail.date_created)}
            </span>
          </div>
          <div className="mt-3">
            <Link
              href={`/children/${detail.id}`}
              className="inline-flex items-center gap-1 text-[13px] text-tangerine-deeper hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview as donor
              <ExternalLink
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Admin info ────────────────────────────────────────────────────

function AdminInfoPanel({ detail }: { detail: AdminChildDetail }) {
  return (
    <section
      aria-label="Admin info"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Admin info</h2>
      <dl className="space-y-3 text-[14px]">
        <DlRow label="Submitted by" value={detail.uploaded_by_name ?? "—"} />
        <DlRow label="Assigned DI" value={detail.assigned_di_name ?? "—"} />
        <DlRow
          label="Created"
          value={formatTimestamp(detail.date_created)}
        />
        <DlRow
          label="Last updated"
          value={formatTimestamp(detail.date_updated)}
        />
        <DlRow
          label="Submission date"
          value={formatDate(detail.submission_date)}
        />
        <DlRow
          label="Last visit"
          value={formatDate(detail.last_visit_date)}
        />
      </dl>
    </section>
  );
}

// ─── Profile preview (full editable surface) ───────────────────────

function ProfilePreviewPanel({ detail }: { detail: AdminChildDetail }) {
  return (
    <section
      aria-label="Profile fields"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <h2 className="font-display text-[18px] text-ink mb-4">Profile fields</h2>
      <dl className="space-y-3 text-[14px]">
        <DlRow label="Support type" value={detail.support_type_label} />
        <DlRow
          label="Monthly cost"
          value={formatMoneyBdt(detail.monthly_cost)}
        />
        <DlRow
          label="Priority"
          value={detail.priority_support ?? "—"}
        />
        {detail.priority_notes ? (
          <DlRow label="Priority notes" value={detail.priority_notes} multiline />
        ) : null}
        <DlRow label="Blood group" value={detail.blood_group ?? "—"} />
        <DlRow
          label="Vaccinations"
          value={detail.vaccination_status ?? "—"}
        />
        <DlRow
          label="Last checkup"
          value={formatDate(detail.last_medical_checkup)}
        />
        <DlRow
          label="Disability"
          value={detail.disability_status ?? "—"}
        />
        {detail.disability_notes ? (
          <DlRow label="Disability notes" value={detail.disability_notes} multiline />
        ) : null}
        <DlRow
          label="Guardian"
          value={
            [
              detail.guardian_relationship,
              detail.guardian_phone ? `(phone on file)` : null,
            ]
              .filter(Boolean)
              .join(" ") || "—"
          }
        />
        {detail.guardian_summary_internal ? (
          <DlRow
            label="Guardian summary"
            value={detail.guardian_summary_internal}
            multiline
          />
        ) : null}
      </dl>
    </section>
  );
}

function DlRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={multiline ? "" : "flex items-baseline gap-3"}>
      <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium shrink-0 w-36">
        {label}
      </dt>
      <dd
        className={`text-ink ${multiline ? "mt-1 whitespace-pre-line leading-relaxed" : ""} break-words`}
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Documents ─────────────────────────────────────────────────────

type DocSummary = Awaited<ReturnType<typeof getDocumentsForChild>>[number];

function DocumentsPanel({
  childId,
  documents,
}: {
  childId: string;
  documents: DocSummary[];
}) {
  return (
    <section
      aria-label="Documents"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[18px] text-ink">Documents</h2>
        <span className="text-[12.5px] text-ink-soft">
          {documents.length} on file
        </span>
      </div>
      {documents.length === 0 ? (
        <p className="text-[14px] text-ink-soft italic">
          No documents uploaded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-tangerine-mist text-tangerine-deeper inline-flex items-center justify-center shrink-0">
                <FileText
                  className="w-4 h-4 stroke-[1.75]"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-medium text-ink">{d.documentTypeLabel}</p>
                  <DocStatusPill status={d.status} />
                </div>
                <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
                  Uploaded {formatRelative(d.uploadedAt)} · by {d.uploadedByName}
                </p>
                {d.notes ? (
                  <p className="mt-1 text-[12px] text-ink-soft italic line-clamp-2">
                    {d.notes}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-stone-300 text-stone-700 bg-white text-[12.5px] font-medium hover:bg-stone-50 transition-colors"
                  >
                    Open
                    <ExternalLink
                      className="w-3 h-3 stroke-[1.75]"
                      aria-hidden="true"
                    />
                  </a>
                  <ReuploadRequestButton
                    childId={childId}
                    target={{
                      kind: "document",
                      documentId: d.id,
                      label: d.documentTypeLabel,
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocStatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Pending review",
    },
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
    archived: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Archived",
    },
  };
  const s =
    styles[status] ?? { bg: "bg-stone-100", text: "text-stone-700", label: status };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

// ─── Intake photos ─────────────────────────────────────────────────

type IntakeSummary = Awaited<ReturnType<typeof getIntakePhotosForChild>>[number];

function IntakePhotosPanel({
  childId,
  photos,
}: {
  childId: string;
  photos: IntakeSummary[];
}) {
  return (
    <section
      aria-label="Intake photos"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[18px] text-ink">Intake photos</h2>
        <span className="text-[12.5px] text-ink-soft">
          {photos.length} on file
        </span>
      </div>
      {photos.length === 0 ? (
        <p className="text-[14px] text-ink-soft italic">
          No intake photos uploaded yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-stone-200 bg-stone-50/40 overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] bg-stone-100 relative">
                {p.photoUuid ? (
                  // Admin always sees unblurred — no transform params.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/assets/${p.photoUuid}?width=600&format=auto`}
                    alt={p.caption ?? "Intake photo"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full inline-flex items-center justify-center">
                    <ImageIcon
                      className="w-6 h-6 text-stone-400 stroke-[1.75]"
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <DocStatusPill status={p.status} />
                </div>
              </div>
              <div className="p-2 flex flex-col gap-1">
                {p.caption ? (
                  <p className="text-[12px] text-ink line-clamp-2">
                    {p.caption}
                  </p>
                ) : null}
                <p className="text-[11px] text-ink-soft">
                  by {p.uploadedByName}
                </p>
                <div className="mt-1">
                  <ReuploadRequestButton
                    childId={childId}
                    target={{
                      kind: "intake",
                      intakePhotoId: p.id,
                      label: p.caption ?? "this intake photo",
                    }}
                    compact
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Sponsorships ──────────────────────────────────────────────────

type Queue = Awaited<ReturnType<typeof getQueueForChild>>;

function SponsorshipsPanel({ queue }: { queue: Queue }) {
  const { active, queued } = queue;
  const total = (active ? 1 : 0) + queued.length;
  return (
    <section
      aria-label="Sponsorships"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[18px] text-ink">Sponsorships</h2>
        <span className="text-[12.5px] text-ink-soft">
          {total} total ({active ? 1 : 0} active, {queued.length} queued)
        </span>
      </div>
      {total === 0 ? (
        <p className="text-[14px] text-ink-soft italic">
          No sponsorships on this child yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {active ? <SponsorshipRow s={active} isActive /> : null}
          {queued.map((s) => (
            <SponsorshipRow key={s.id} s={s} isActive={false} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SponsorshipRow({
  s,
  isActive,
}: {
  s: Queue["queued"][number];
  isActive: boolean;
}) {
  return (
    <li className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <code className="text-[12.5px] bg-white px-1.5 py-0.5 rounded border border-stone-200">
          {s.id.slice(0, 8)}
        </code>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${
            isActive
              ? "bg-moss-soft text-moss-deep"
              : "bg-amber-50 text-amber-800"
          }`}
        >
          {isActive ? "Active" : `Queued #${s.queue_position ?? "?"}`}
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
          {s.payment_mode}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
        ${s.amount_usd} {s.currency}
        {" · "}
        Started {formatDate(s.started_at)}
        {s.stripe_subscription_id ? (
          <>
            {" · "}
            Stripe sub{" "}
            <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-stone-200">
              {s.stripe_subscription_id.slice(0, 14)}…
            </code>
          </>
        ) : null}
      </p>
    </li>
  );
}

// ─── Audit panel ───────────────────────────────────────────────────

function AuditPanel({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section
      aria-label="Audit log"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-[18px] text-ink">Audit log</h2>
        <span className="text-[12.5px] text-ink-soft">
          Last {events.length} events
        </span>
      </div>
      {events.length === 0 ? (
        <p className="text-[14px] text-ink-soft italic">
          No audit events for this child yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex gap-3 py-2 border-b border-stone-200 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] text-ink leading-snug">
                  {e.description}
                </p>
                <p className="text-[11.5px] text-ink-soft mt-0.5">
                  {e.actorName} · {e.actorRole} · {formatRelative(e.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Pills ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-moss-soft", text: "text-moss-deep", label: "Active" },
    awaiting_intake: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: "Awaiting intake",
    },
    withdrawn: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      label: "Archived",
    },
  };
  const s =
    styles[status] ?? { bg: "bg-stone-100", text: "text-stone-700", label: status };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

function SponsorStatePill({
  state,
  active,
  queued,
}: {
  state: AdminChildSponsorState;
  active: number;
  queued: number;
}) {
  const styles: Record<
    AdminChildSponsorState,
    { bg: string; text: string; label: string }
  > = {
    fully_funded: {
      bg: "bg-tangerine-mist",
      text: "text-tangerine-deeper",
      label: `Sponsored · ${active}${queued > 0 ? ` (+${queued})` : ""}`,
    },
    queued_waiting: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: `Queued ${queued}`,
    },
    awaiting: {
      bg: "bg-moss-soft",
      text: "text-moss-deep",
      label: "Awaiting first sponsor",
    },
  };
  const s = styles[state];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
