// Session 51 — Admin proposal detail page.
//
// Server component. Fetches the full proposal (with computed diff
// for UPDATE), writes one `admin_viewed_proposal` audit row per
// render (force-dynamic ensures every visit logs), then renders:
//   - Header card: child label, proposal type pill, submitter name,
//     submitted timestamp
//   - For UPDATE: a two-column "Previous | New" diff with Tier pills
//     and phone redaction baked into the formatter
//   - For CREATE: a single-column "New record" view (no previous_snapshot)
//   - Bottom action bar (Approve / Reject) — disabled on non-pending
//
// Two-column on desktop, stacked on mobile. Each row gets a Tier
// pill so admin can see at a glance which fields are donor-visible
// vs internal vs Tier 3 PII.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  FileText,
  History,
  Image as ImageIcon,
  ImageOff,
  Paperclip,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  getAdminProposalDetail,
  listAuditEventsForProposal,
  type ProposalHistoryEvent,
} from "@/lib/admin-proposals-list";
import { listAdminDocumentsForChild } from "@/lib/admin-documents";
import { getIntakePhotosForChild } from "@/lib/admin-intake-photos";
import { intakePhotoStatusLabel } from "@/lib/status-labels";
import { recordAuditEvent } from "@/lib/di-audit";
import {
  getFieldMeta,
  type FieldTier,
} from "@/lib/proposal-diff-display";
import { ProposalActionBar } from "@/components/admin/ProposalActionBar";

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

export default async function AdminProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  // Layout already enforced auth; this branch is defensive.
  if (!session) notFound();

  const { id } = await params;
  if (!id) notFound();

  const detail = await getAdminProposalDetail(id);
  if (!detail) notFound();

  // Audit the view BEFORE rendering. Best-effort — recordAuditEvent
  // swallows failures internally (audit must never block UX).
  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_proposal",
    collection: "child_proposal",
    recordId: detail.id,
    metadata: {
      operation: detail.proposal_type,
      ...(detail.target_child ? { childId: detail.target_child } : {}),
    },
  });

  // Session 60 — fetch the supporting panels in parallel.
  // - Documents and intake photos attach to the child_proposal's
  //   target_child (always set for UPDATE; set on CREATE post-52a
  //   once the DI saves the first draft, which creates a stub
  //   child for FK attachment). If target_child is missing — a
  //   legacy pre-52a CREATE proposal — both arrays come back
  //   empty and the panels show their "nothing attached" states.
  // - History pulls events across both `child_proposal` (this
  //   proposal's own audit trail) and `child` (per-target_child
  //   events for documents, intake photos, moments, deliveries).
  const [docs, intakePhotos, history] = await Promise.all([
    detail.target_child
      ? listAdminDocumentsForChild(detail.target_child)
      : Promise.resolve([]),
    detail.target_child
      ? getIntakePhotosForChild(detail.target_child)
      : Promise.resolve([]),
    listAuditEventsForProposal(detail.id, detail.target_child, 30),
  ]);

  const isUpdate = detail.proposal_type === "update";
  const typeLabel = isUpdate ? "Update" : "New child";

  // For UPDATE, render the diff (rows live in detail.diff). For
  // CREATE we synthesize "diff entries" where the old value is
  // always null/missing — same row component handles both shapes.
  const rows: ReadonlyArray<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }> = isUpdate
    ? detail.diff ?? []
    : Object.entries(detail.proposed).map(([field, newValue]) => ({
        field,
        oldValue: null,
        newValue,
      }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/admin/proposals?filter=pending"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All proposals
      </Link>

      {/* Header card */}
      <header className="mb-6 md:mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
            {detail.child_label}
          </h1>
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
            {typeLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <User2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {detail.submitted_by_name}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {formatTimestamp(detail.date_created)}
          </span>
          <span>
            {rows.length} change{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {detail.status === "rejected" && detail.rejection_reason ? (
          <div className="mt-3 rounded-xl border border-[#A02B2B]/20 bg-[#FCE9E9] p-3 text-[13px] text-[#A02020]">
            <span className="font-semibold">Your prior rejection note:</span>{" "}
            {detail.rejection_reason}
          </div>
        ) : null}
      </header>

      {/* Diff grid */}
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center mb-6">
          <p className="text-[14px] text-ink-soft leading-relaxed">
            This proposal has no field-level changes recorded.
          </p>
        </div>
      ) : (
        <section
          className="mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
          aria-label={isUpdate ? "Field changes" : "New record fields"}
        >
          <h2 className="font-display text-[18px] text-ink mb-4">
            {isUpdate ? "Field changes" : "New record"}
          </h2>
          <div className="space-y-4">
            {rows.map(({ field, oldValue, newValue }) => (
              <DiffRow
                key={field}
                field={field}
                oldValue={oldValue}
                newValue={newValue}
                isUpdate={isUpdate}
              />
            ))}
          </div>
        </section>
      )}

      {/* Session 60 — supporting panels. All four sections render
          unconditionally (even when empty) so admin reviewing a
          proposal has a predictable surface: they always know where
          to look for documents, intake photos, and history. Empty
          states make the absence explicit instead of hiding it. */}
      <DocumentsPanel docs={docs} />
      <IntakePhotosPanel
        photos={intakePhotos.map((p) => ({
          id: p.id,
          photoUrl: p.photoUrl,
          caption: p.caption,
          status: p.status,
          uploadedByName: p.uploadedByName,
        }))}
      />
      <HistoryPanel events={history} />

      {/* Action bar */}
      <ProposalActionBar proposalId={detail.id} currentStatus={detail.status} />
    </div>
  );
}

// ─── Documents panel (Session 60) ─────────────────────────────────

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

function DocumentsPanel({
  docs,
}: {
  docs: Awaited<ReturnType<typeof listAdminDocumentsForChild>>;
}) {
  return (
    <section
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      aria-label="Verification documents"
    >
      <header className="mb-4 flex items-baseline gap-2 flex-wrap">
        <h2 className="font-display text-[18px] text-ink inline-flex items-center gap-2">
          <Paperclip className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Documents
        </h2>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft">
          {docs.length} uploaded
        </span>
      </header>
      {docs.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft italic">
          No documents uploaded for this child yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/40 px-3.5 py-3"
            >
              <div className="shrink-0 w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-500">
                {d.mimeHint === "pdf" ? (
                  <FileText className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
                ) : (
                  <ImageIcon
                    className="w-4 h-4 stroke-[1.75]"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-[13.5px] font-medium text-ink">
                    {d.documentTypeLabel}
                  </p>
                  <DocStatusPill status={d.status} />
                </div>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  Uploaded by {d.uploadedByName} · {formatDate(d.uploadedAt)}
                </p>
                {d.status === "rejected" && d.rejectionReason ? (
                  <p className="mt-1 text-[12px] text-[#A02020] italic line-clamp-2">
                    {d.rejectionReason}
                  </p>
                ) : null}
              </div>
              {d.fileUrl ? (
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[12.5px] text-tangerine-deeper hover:underline font-medium"
                >
                  Open ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocStatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected" | "archived";
}) {
  const styles: Record<
    typeof status,
    { bg: string; text: string; label: string }
  > = {
    pending: { bg: "bg-amber-50", text: "text-amber-800", label: "Pending" },
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
      text: "text-stone-600",
      label: "Archived",
    },
  };
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

// ─── Intake photos panel (Session 60) ─────────────────────────────

function IntakePhotosPanel({
  photos,
}: {
  photos: Array<{
    id: string;
    photoUrl: string;
    caption: string | null;
    status: "pending" | "approved" | "rejected" | "archived";
    uploadedByName: string;
  }>;
}) {
  return (
    <section
      className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      aria-label="Intake photos"
    >
      <header className="mb-4 flex items-baseline gap-2 flex-wrap">
        <h2 className="font-display text-[18px] text-ink inline-flex items-center gap-2">
          <ImageIcon className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          Intake photos
        </h2>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft">
          {photos.length} uploaded
        </span>
        {photos.length > 0 ? (
          <span className="text-[11.5px] text-ink-soft">
            (admin sees them clear; donor view applies the locked-thumbnail blur)
          </span>
        ) : null}
      </header>
      {photos.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft italic inline-flex items-center gap-2">
          <ImageOff className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          No intake photos uploaded for this child yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-stone-200 bg-stone-50/40 overflow-hidden"
            >
              <div className="relative aspect-square bg-stone-100">
                {p.photoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.photoUrl}
                    alt={p.caption ?? "Intake photo"}
                    className="w-full h-full object-cover"
                  />
                ) : null}
                <div
                  className={`absolute top-1.5 right-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-wider font-semibold ${
                    p.status === "approved"
                      ? "bg-moss-soft text-moss-deep"
                      : p.status === "rejected"
                        ? "bg-[#FCE9E9] text-[#A02020]"
                        : p.status === "archived"
                          ? "bg-stone-100 text-stone-700"
                          : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {intakePhotoStatusLabel(p.status)}
                </div>
              </div>
              <div className="px-2.5 py-2">
                <p className="text-[11.5px] text-ink-soft truncate">
                  {p.caption ?? <span className="italic">No caption</span>}
                </p>
                <p className="text-[10.5px] text-slate-soft truncate mt-0.5">
                  {p.uploadedByName}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── History panel (Session 60) ────────────────────────────────────

function HistoryPanel({ events }: { events: ProposalHistoryEvent[] }) {
  return (
    <section
      className="mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      aria-label="Audit history"
    >
      <header className="mb-4 flex items-baseline gap-2 flex-wrap">
        <h2 className="font-display text-[18px] text-ink inline-flex items-center gap-2">
          <History className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
          History
        </h2>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-soft">
          last {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </header>
      {events.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft italic">
          No audit events recorded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-stone-200 bg-stone-50/40 px-3.5 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-[13px] text-ink">
                  <span className="font-medium">{e.actorName}</span>{" "}
                  <span className="text-ink-soft">({e.actorRole})</span>{" "}
                  <span className="font-mono text-[11px] text-slate">
                    {e.action}
                  </span>
                </p>
                <span className="font-mono text-[11px] text-slate-soft tabular-nums shrink-0">
                  {formatDate(e.timestamp)}
                </span>
              </div>
              {e.reason ? (
                <p className="mt-1 text-[12px] text-ink-soft italic line-clamp-2">
                  &ldquo;{e.reason}&rdquo;
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Per-field row ─────────────────────────────────────────────────

function DiffRow({
  field,
  oldValue,
  newValue,
  isUpdate,
}: {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  isUpdate: boolean;
}) {
  const meta = getFieldMeta(field);
  const oldFormatted = meta.format(oldValue);
  // Phone redaction (Tier 3 columns flagged with redactNewValue):
  // the formatter already returns the literal "Updated" for those
  // fields, so we just consume meta.format() for both sides.
  const newFormatted = meta.format(newValue);

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-3.5">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          {meta.label}
        </span>
        <TierPill tier={meta.tier} />
        {meta.redactNewValue ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Redacted
          </span>
        ) : null}
      </div>
      {isUpdate ? (
        <div className="grid md:grid-cols-2 gap-3">
          <ValueBlock label="Previous" value={oldFormatted} dim />
          <ValueBlock label="New" value={newFormatted} highlight />
        </div>
      ) : (
        <ValueBlock label="Value" value={newFormatted} highlight />
      )}
    </div>
  );
}

function ValueBlock({
  label,
  value,
  dim = false,
  highlight = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight
          ? "border-tangerine-soft/60 bg-tangerine-mist/30"
          : dim
            ? "border-stone-200 bg-white"
            : "border-stone-200 bg-white"
      }`}
    >
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft mb-1">
        {label}
      </div>
      <div
        className={`text-[14px] leading-snug whitespace-pre-line break-words ${
          dim ? "text-ink-soft" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function TierPill({ tier }: { tier: FieldTier }) {
  const styles: Record<FieldTier, { bg: string; text: string; border: string; label: string }> = {
    1: {
      bg: "bg-stone-100",
      text: "text-stone-700",
      border: "border-stone-200",
      label: "Tier 1 · Public",
    },
    2: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-200",
      label: "Tier 2 · Sponsor",
    },
    3: {
      bg: "bg-[#FCE9E9]",
      text: "text-[#A02020]",
      border: "border-[#F5C8C8]",
      label: "Tier 3 · Internal",
    },
  };
  const s = styles[tier];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${s.bg} ${s.text} ${s.border}`}
      title={s.label}
    >
      {s.label}
    </span>
  );
}
