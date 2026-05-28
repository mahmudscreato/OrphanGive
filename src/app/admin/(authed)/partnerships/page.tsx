// P4 — Admin partnership-inquiry queue.
//
// Lists submissions from /for-charities. Status filter pills mirror
// the document/proposal queue layout. Click-through to a detail page
// that lets admin change status + leave internal notes.

import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUSES,
  INQUIRY_TYPE_LABELS,
  listPartnershipInquiries,
  type InquiryStatus,
} from "@/lib/partnership-inquiries";

export const dynamic = "force-dynamic";

const TABS: ReadonlyArray<{ value: InquiryStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

function parseFilter(s: string | undefined): InquiryStatus | "all" {
  if (s === "all") return "all";
  if (s && (INQUIRY_STATUSES as readonly string[]).includes(s))
    return s as InquiryStatus;
  return "new";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

const STATUS_PILL: Record<InquiryStatus, { bg: string; text: string }> = {
  new: { bg: "bg-tangerine", text: "text-white" },
  reviewed: { bg: "bg-amber-50", text: "text-amber-800" },
  contacted: { bg: "bg-moss-soft", text: "text-moss-deep" },
  closed: { bg: "bg-stone-100", text: "text-stone-700" },
};

export default async function AdminPartnershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) return null;

  const sp = await searchParams;
  const activeFilter = parseFilter(sp.filter);

  const rows = await listPartnershipInquiries({ status: activeFilter });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Partnership inquiries
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Submissions from the /for-charities reach-out form. Adult
          partner-org contacts only — not donor or child data.
        </p>
      </header>

      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Status filter"
      >
        {TABS.map((tab) => {
          const isActive = activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/admin/partnerships?filter=${tab.value}`}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-tangerine text-white"
                  : "bg-white border border-stone-200 text-ink-soft hover:border-tangerine-soft hover:text-tangerine-deeper"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <Handshake
            className="w-10 h-10 text-stone-300 mx-auto mb-3 stroke-[1.5]"
            aria-hidden="true"
          />
          <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
            {activeFilter === "new" ? "Inbox zero." : "Nothing here."}
          </p>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            {activeFilter === "new"
              ? "No new inquiries waiting on review."
              : `No inquiries with status "${activeFilter}".`}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pill = STATUS_PILL[r.status] ?? STATUS_PILL.new;
            const typeLabel = r.inquiry_type
              ? INQUIRY_TYPE_LABELS[r.inquiry_type]
              : "—";
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/partnerships/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-stone-200 p-4 hover:shadow-sm hover:border-tangerine-soft transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
                      <h3 className="font-display text-[15.5px] text-ink leading-tight">
                        {r.organisation_name || "(no name)"}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] uppercase tracking-wider font-semibold ${pill.bg} ${pill.text}`}
                      >
                        {INQUIRY_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-ink-soft leading-snug truncate">
                      {r.contact_name ?? "—"}
                      {r.role ? ` · ${r.role}` : ""} · {typeLabel}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-soft">
                      {formatRelative(r.created_at)}
                    </p>
                  </div>
                  <ChevronRight
                    className="w-4 h-4 text-ink-soft stroke-[1.75] shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
