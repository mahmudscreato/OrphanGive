// P4 — Admin partnership-inquiry detail page.
//
// Read-only view of a single inquiry plus a status-change + admin-
// notes form. Status updates land via /api/admin/partnership-
// inquiries/[id]/status; notes via /api/admin/partnership-
// inquiries/[id]/notes.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  Mail,
  Phone,
  User2,
} from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_TYPE_LABELS,
  listPartnershipInquiries,
  type InquiryStatus,
} from "@/lib/partnership-inquiries";
import { PartnershipInquiryActions } from "@/components/admin/PartnershipInquiryActions";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<InquiryStatus, { bg: string; text: string }> = {
  new: { bg: "bg-tangerine", text: "text-white" },
  reviewed: { bg: "bg-amber-50", text: "text-amber-800" },
  contacted: { bg: "bg-moss-soft", text: "text-moss-deep" },
  closed: { bg: "bg-stone-100", text: "text-stone-700" },
};

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

export default async function AdminPartnershipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) return null;

  const { id } = await params;
  // Single-row read via the list helper (the collection is small so
  // this is fine for v1; switch to a dedicated readItem if the
  // queue grows).
  const all = await listPartnershipInquiries({ status: "all" });
  // partnership_inquiry.id is an INTEGER in the DB (the type says string but
  // the value arrives as a number); the route param is always a string. A
  // strict `r.id === id` compares number-to-string and never matches, so
  // EVERY detail page 404'd. Coerce both sides to string.
  const inquiry = all.find((r) => String(r.id) === id);
  if (!inquiry) notFound();

  const pill = STATUS_PILL[inquiry.status] ?? STATUS_PILL.new;
  const typeLabel = inquiry.inquiry_type
    ? INQUIRY_TYPE_LABELS[inquiry.inquiry_type]
    : "—";

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href={`/admin/partnerships?filter=${inquiry.status}`}
        className="inline-flex items-center gap-1 text-[13px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All partnership inquiries
      </Link>

      {/* Header card */}
      <header className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-wrap items-baseline gap-3 mb-2">
          <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
            {inquiry.organisation_name || "(no name)"}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wider font-semibold ${pill.bg} ${pill.text}`}
          >
            {INQUIRY_STATUS_LABELS[inquiry.status]}
          </span>
        </div>
        <p className="text-[13.5px] text-ink-soft">
          {typeLabel} · received {formatTimestamp(inquiry.created_at)}
        </p>
      </header>

      {/* Contact card */}
      <section
        aria-label="Contact"
        className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      >
        <h2 className="font-display text-[16px] text-ink mb-4">Contact</h2>
        <dl className="space-y-3 text-[13.5px]">
          <div className="flex items-start gap-3">
            <User2
              className="w-4 h-4 text-ink-soft stroke-[1.75] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <dt className="text-ink-soft text-[12px]">Name + role</dt>
              <dd className="text-ink">
                {inquiry.contact_name ?? "—"}
                {inquiry.role ? ` · ${inquiry.role}` : ""}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail
              className="w-4 h-4 text-ink-soft stroke-[1.75] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <dt className="text-ink-soft text-[12px]">Email</dt>
              <dd className="text-ink break-all">
                {inquiry.email ? (
                  <a
                    href={`mailto:${inquiry.email}`}
                    className="text-tangerine-deeper hover:underline underline-offset-2"
                  >
                    {inquiry.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone
              className="w-4 h-4 text-ink-soft stroke-[1.75] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <dt className="text-ink-soft text-[12px]">Phone</dt>
              <dd className="text-ink">{inquiry.phone ?? "—"}</dd>
            </div>
          </div>
        </dl>
      </section>

      {/* Message card */}
      <section
        aria-label="Message"
        className="mb-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      >
        <h2 className="font-display text-[16px] text-ink mb-3">Message</h2>
        <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
          {inquiry.message ?? "(empty)"}
        </p>
      </section>

      {/* Status + notes actions */}
      <PartnershipInquiryActions
        inquiryId={inquiry.id}
        currentStatus={inquiry.status}
        currentNotes={inquiry.admin_notes ?? ""}
        reviewedAt={inquiry.reviewed_at}
      />

      {/* Source + metadata */}
      <section
        aria-label="Metadata"
        className="mt-6 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6"
      >
        <h2 className="font-display text-[16px] text-ink mb-3">Metadata</h2>
        <dl className="space-y-2 text-[13px] text-ink-soft">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase">
              Source
            </span>
            <span className="text-ink">{inquiry.source ?? "—"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase">
              Inquiry id
            </span>
            <span className="text-ink font-mono text-[11.5px] break-all">
              {inquiry.id}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Clock
              className="w-3.5 h-3.5 stroke-[1.75]"
              aria-hidden="true"
            />
            <span>Last touched {formatTimestamp(inquiry.reviewed_at)}</span>
          </div>
        </dl>
      </section>
    </div>
  );
}
