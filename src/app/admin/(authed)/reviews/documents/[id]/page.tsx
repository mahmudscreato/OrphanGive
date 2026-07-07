// Session 52b — Admin document review detail.
//
// Inline preview: image via <img>, PDF via <iframe> with a PDF.js-
// like toolbar=0 hash to suppress the browser's controls.
//
// Browser compatibility notes for the PDF iframe approach:
//   - Chrome/Edge: built-in PDF viewer renders inline; `#toolbar=0`
//     hides the Chrome PDF toolbar (search/print bars).
//   - Safari (macOS, iPadOS): WebKit's PDF viewer also renders
//     inline; `#toolbar=0` is ignored but the toolbar's small and
//     unobtrusive anyway.
//   - Firefox: built-in PDF.js viewer renders inline; `#toolbar=0`
//     is also ignored, similar UX to Safari.
//   - Mobile Safari/Chrome on iOS: many older versions refused to
//     render PDFs in iframes for security reasons; the user would
//     see a blank frame. We surface an "Open PDF in new tab" link
//     below the iframe as a fallback for those cases.
//
// View is audited (admin_viewed_document) per render — force-dynamic
// ensures every load logs.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ExternalLink, FileText, User2 } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminDocumentDetail } from "@/lib/admin-documents";
import { recordAuditEvent } from "@/lib/di-audit";
import { ReviewActionBar } from "@/components/admin/ReviewActionBar";
import { AdminRemoveButton } from "@/components/admin/AdminRemoveButton";
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

export default async function AdminDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const doc = await getAdminDocumentDetail(id);
  if (!doc) notFound();

  // Audit view BEFORE rendering. Best-effort.
  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_document",
    collection: "child_document",
    recordId: doc.id,
    metadata: {
      ...(doc.childId ? { childId: doc.childId } : {}),
      documentType: doc.documentType,
    },
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <Link
        href="/admin/reviews/documents?filter=pending"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All documents
      </Link>

      {/* Header card */}
      <header className="mb-6 md:mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
            {doc.documentTypeLabel}
          </h1>
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
            for {doc.childDisplayName}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <User2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {doc.uploadedByName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {formatTimestamp(doc.uploadedAt)}
          </span>
        </div>
        {doc.notes ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[13px] text-amber-900">
            <span className="font-semibold">DI notes:</span> {doc.notes}
          </div>
        ) : null}
        {doc.status === "rejected" && doc.rejectionReason ? (
          <div className="mt-3 rounded-xl border border-[#A02B2B]/20 bg-[#FCE9E9] p-3 text-[13px] text-[#A02020]">
            <span className="font-semibold">Your prior rejection note:</span>{" "}
            {doc.rejectionReason}
          </div>
        ) : null}
      </header>

      {/* Inline preview */}
      <section
        className="mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden"
        aria-label="Document preview"
      >
        {doc.fileUrl ? (
          doc.mimeHint === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.fileUrl}
              alt=""
              className="w-full h-auto bg-stone-100"
            />
          ) : doc.mimeHint === "pdf" ? (
            <div>
              <iframe
                src={`${doc.fileUrl}#toolbar=0`}
                title="Document PDF preview"
                className="w-full"
                style={{ minHeight: 600, border: 0 }}
              />
              <div className="px-4 py-3 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between">
                <p className="text-[12.5px] text-ink-soft">
                  PDF preview. If it doesn&apos;t render here, open in a new
                  tab.
                </p>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-tangerine-deeper hover:underline"
                >
                  <ExternalLink
                    className="w-3.5 h-3.5 stroke-[1.75]"
                    aria-hidden="true"
                  />
                  Open in new tab
                </a>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center">
              <FileText
                className="w-10 h-10 text-stone-400 mx-auto mb-3 stroke-[1.5]"
                aria-hidden="true"
              />
              <p className="text-[14px] text-ink-soft">
                Preview not available for this file type.
              </p>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-tangerine-deeper hover:underline"
              >
                <ExternalLink
                  className="w-3.5 h-3.5 stroke-[1.75]"
                  aria-hidden="true"
                />
                Download to view
              </a>
            </div>
          )
        ) : (
          <div className="p-10 text-center">
            <p className="text-[14px] text-ink-soft">
              This document has no file attached.
            </p>
          </div>
        )}
      </section>

      <ReviewActionBar
        approveUrl={`/api/admin/documents/${doc.id}/approve`}
        rejectUrl={`/api/admin/documents/${doc.id}/reject`}
        redirectTo="/admin/reviews/documents?filter=pending"
        entityNoun="document"
        disabled={doc.status !== "pending"}
        disabledStatusLabel={doc.status}
      />

      {/* Rejected docs: the approve/reject bar above is disabled, which
          left the admin at a dead end. Surface the existing "request
          re-upload" action so there's an obvious next step. The uploader
          is already notified on reject; this sends an explicit nudge with
          a note. Admins never upload replacements themselves — only DIs
          re-upload (via their DocumentsSection, which already unlocks for
          status='rejected'). */}
      {doc.status === "rejected" && doc.childId ? (
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="mb-3 text-[13px] text-ink-soft leading-relaxed">
            This document was rejected. The uploader is notified
            automatically — use this to send an explicit re-upload request
            with a note.
          </p>
          <ReuploadRequestButton
            childId={doc.childId}
            target={{
              kind: "document",
              documentId: doc.id,
              label: doc.documentTypeLabel,
            }}
          />
        </div>
      ) : null}

      {/* Session 52c → 52d — Remove cleanup. Pending: two-tap
          confirm, silent. Approved: opens modal prompting for
          required reason, DI notified. Archived rows are
          terminal (admin uses Directus admin directly to undo);
          rejected rows already have admin's reason in
          rejection_reason, no further admin remove needed. */}
      <AdminRemoveButton
        endpoint={`/api/admin/documents/${doc.id}`}
        redirectTo="/admin/reviews/documents?filter=pending"
        entityNoun="document"
        wasApproved={doc.status === "approved"}
        disabled={doc.status === "archived" || doc.status === "rejected"}
      />
    </div>
  );
}
