// Session 67 — Global admin audit log viewer.
//
// Server component. URL-driven filter / sort / pagination state so
// the back button works and admin can share a deep link to a
// specific entity's audit trail.
//
// URL params (all optional):
//   ?actions=admin_approved_proposal,di_uploaded_moment
//   ?role=admin|data_inputter|donor|system|all
//   ?subject=proposal|child|document|intake_photo|moment|sponsorship|donor|file|other|all
//   ?subject_id=<uuid-or-string>
//   ?from=YYYY-MM-DD
//   ?to=YYYY-MM-DD
//   ?sort=timestamp_desc|timestamp_asc
//   ?page=<n>
//
// Layout: a horizontally-scrolling table on md+ (8 columns); cards
// on mobile. Metadata + diff render inside a collapsible cell per
// row (client component AuditMetadataCell).

import Link from "next/link";
import {
  listAdminAuditPage,
  type AdminAuditRowOut,
  type AdminAuditSort,
} from "@/lib/admin-audit";
import {
  ACTOR_ROLE_STYLES,
  AUDIT_SUBJECT_BUCKETS,
  bucketForCollection,
  formatActionLabel,
  normaliseActorRole,
  resolveAuditSubjectLink,
  type AuditActorRole,
  type AuditSubjectBucket,
} from "@/lib/audit-labels";
import { AuditMetadataCell } from "@/components/admin/AuditMetadataCell";
// Session 67.1 hotfix — replaces the native <select multiple> the
// page shipped with a checkbox list (no Cmd/Ctrl hidden gesture).
import { AuditActionsCheckboxFilter } from "@/components/admin/AuditActionsCheckboxFilter";

export const dynamic = "force-dynamic";

const SORT_OPTIONS: ReadonlyArray<{ value: AdminAuditSort; label: string }> = [
  { value: "timestamp_desc", label: "Newest first" },
  { value: "timestamp_asc", label: "Oldest first" },
];

const ROLE_FILTERS: ReadonlyArray<{
  value: AuditActorRole | "all";
  label: string;
}> = [
  { value: "all", label: "All actors" },
  { value: "admin", label: "Admin" },
  { value: "data_inputter", label: "DI" },
  { value: "donor", label: "Donor" },
  { value: "system", label: "System" },
];

function parseRole(s: string | undefined): AuditActorRole | "all" {
  if (
    s === "admin" ||
    s === "data_inputter" ||
    s === "donor" ||
    s === "system"
  ) {
    return s;
  }
  return "all";
}

function parseSubject(s: string | undefined): AuditSubjectBucket {
  if (
    s === "proposal" ||
    s === "child" ||
    s === "document" ||
    s === "intake_photo" ||
    s === "moment" ||
    s === "sponsorship" ||
    s === "donor" ||
    s === "file" ||
    s === "other"
  ) {
    return s;
  }
  return "all";
}

function parseSort(s: string | undefined): AdminAuditSort {
  return s === "timestamp_asc" ? "timestamp_asc" : "timestamp_desc";
}

function parsePage(s: string | undefined): number {
  if (!s) return 1;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function parseDate(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function parseActions(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && /^[a-z_]+$/.test(t));
}

type FilterBase = {
  actions: string[];
  role: AuditActorRole | "all";
  subject: AuditSubjectBucket;
  subjectId: string;
  from: string;
  to: string;
  sort: AdminAuditSort;
  page: number;
};

function buildHref(base: FilterBase, overrides: Partial<FilterBase>): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (merged.actions.length > 0)
    params.set("actions", merged.actions.join(","));
  if (merged.role !== "all") params.set("role", merged.role);
  if (merged.subject !== "all") params.set("subject", merged.subject);
  if (merged.subjectId.trim().length > 0)
    params.set("subject_id", merged.subjectId.trim());
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.sort !== "timestamp_desc") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    actions?: string;
    role?: string;
    subject?: string;
    subject_id?: string;
    from?: string;
    to?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const actions = parseActions(sp.actions);
  const role = parseRole(sp.role);
  const subject = parseSubject(sp.subject);
  const subjectId = sp.subject_id?.trim() ?? "";
  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  const sort = parseSort(sp.sort);
  const page = parsePage(sp.page);

  const result = await listAdminAuditPage({
    actions,
    role,
    subjectBucket: subject,
    subjectId,
    from,
    to,
    sort,
    page,
    pageSize: 100,
  });

  const base: FilterBase = {
    actions,
    role,
    subject,
    subjectId,
    from: from ?? "",
    to: to ?? "",
    sort,
    page,
  };

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const showingFrom = result.rows.length === 0 ? 0 : (page - 1) * result.pageSize + 1;
  const showingTo = Math.min(result.total, page * result.pageSize);

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-7xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Audit log
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Every recorded mutation across DI, admin, and system actors.
          Filter by action, role, subject, date, or jump straight to a
          specific entity&apos;s trail by pasting its id into the
          subject-id field.
        </p>
      </header>

      {/* Filter form — GET so state lives in the URL */}
      <form
        action="/admin/audit"
        method="GET"
        className="mb-5 grid grid-cols-1 md:grid-cols-12 gap-3"
      >
        {/* Session 67.1 hotfix — checkbox list replaces the native
            <select multiple>. The new component writes its joined
            value into a hidden input named "actions" so this form's
            existing GET submit handler keeps working unchanged. */}
        <div className="md:col-span-4">
          <AuditActionsCheckboxFilter
            options={result.available_actions}
            labelFor={formatActionLabel}
            defaultValue={actions}
          />
        </div>

        <div className="md:col-span-2 flex flex-col gap-3">
          <div>
            <label
              htmlFor="role"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              Actor role
            </label>
            <select
              id="role"
              name="role"
              defaultValue={role}
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            >
              {ROLE_FILTERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="subject"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              Subject type
            </label>
            <select
              id="subject"
              name="subject"
              defaultValue={subject}
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            >
              {AUDIT_SUBJECT_BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-3 flex flex-col gap-3">
          <div>
            <label
              htmlFor="subject_id"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              Subject id
            </label>
            <input
              id="subject_id"
              name="subject_id"
              type="text"
              defaultValue={subjectId}
              placeholder="paste a uuid or record id…"
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[13.5px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 font-mono"
            />
          </div>
          <div>
            <label
              htmlFor="sort"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              Sort
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-3 flex flex-col gap-3">
          <div>
            <label
              htmlFor="from"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              From date
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from ?? ""}
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            />
          </div>
          <div>
            <label
              htmlFor="to"
              className="block font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              To date
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to ?? ""}
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
            />
          </div>
        </div>

        <div className="md:col-span-12 flex justify-end gap-2">
          {(actions.length > 0 ||
            role !== "all" ||
            subject !== "all" ||
            subjectId.length > 0 ||
            from ||
            to ||
            sort !== "timestamp_desc") ? (
            <Link
              href="/admin/audit"
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              Clear filters
            </Link>
          ) : null}
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 rounded-full bg-ink text-white font-medium text-[13.5px] hover:bg-ink-soft transition-colors"
          >
            Apply
          </button>
        </div>
      </form>

      <p className="mb-4 text-[13px] text-ink-soft">
        {result.total === 0
          ? "No events match the current filters."
          : `Showing ${showingFrom}–${showingTo} of ${result.total} event${result.total === 1 ? "" : "s"} (page ${page} of ${totalPages}).`}
        {result.total >= 5000 ? (
          <span className="ml-2 text-amber-700">
            Window capped at 5,000 — narrow filters to find older entries.
          </span>
        ) : null}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState hasFilters={actions.length + (role !== "all" ? 1 : 0) + (subject !== "all" ? 1 : 0) + (subjectId ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) > 0} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="min-w-full text-[13px]">
              <thead className="bg-stone-50 text-ink-soft font-medium">
                <tr>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Time</th>
                  <th className="text-left px-3 py-2.5">Action</th>
                  <th className="text-left px-3 py-2.5">Actor</th>
                  <th className="text-left px-3 py-2.5">Subject</th>
                  <th className="text-left px-3 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <AuditRowTable key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="md:hidden space-y-2">
            {result.rows.map((row) => (
              <AuditRowCard key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}

      {/* Pagination */}
      {result.total > result.pageSize ? (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between"
        >
          {page > 1 ? (
            <Link
              href={buildHref(base, { page: page - 1 })}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-ink-soft">
            Page {page} of {totalPages}
          </span>
          {page * result.pageSize < result.total ? (
            <Link
              href={buildHref(base, { page: page + 1 })}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

// ─── Rows ──────────────────────────────────────────────────────────

function AuditRowTable({ row }: { row: AdminAuditRowOut }) {
  const role = normaliseActorRole(row.actorRole);
  const roleStyle = ACTOR_ROLE_STYLES[role];
  const link = resolveAuditSubjectLink(row.collection, row.recordId, row.metadata);
  const bucket = bucketForCollection(row.collection);

  return (
    <tr className="border-t border-stone-200 align-top hover:bg-stone-50/60 transition-colors">
      <td className="px-3 py-3 whitespace-nowrap text-ink-soft font-mono text-[11.5px]">
        {formatTimestamp(row.timestamp)}
      </td>
      <td className="px-3 py-3">
        {/* Session 67.1 hotfix — dropped the raw-enum sub-line that
            rendered "admin_resumed_sponsorship" under the human
            label. It read as debug output and added clutter to
            every row. The raw action key is still available via
            hover (title attr) for the rare debug case. */}
        <p
          className="text-ink font-medium leading-snug"
          title={row.action}
        >
          {formatActionLabel(row.action)}
        </p>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1 max-w-[200px]">
          <span className="text-ink truncate">{row.actorName}</span>
          <span
            className={`self-start inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${roleStyle.pillBg} ${roleStyle.pillText}`}
          >
            {roleStyle.label}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1 max-w-[260px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            {bucket === "other" ? row.collection ?? "—" : bucket}
          </span>
          {link ? (
            <Link
              href={link.href}
              className="text-tangerine-deeper hover:underline text-[13px] truncate"
            >
              {link.label} · {row.recordId?.slice(0, 8) ?? "—"}
            </Link>
          ) : row.recordId ? (
            <code className="text-[11.5px] bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200 truncate">
              {row.recordId}
            </code>
          ) : (
            <span className="text-ink-soft italic text-[12.5px]">—</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <AuditMetadataCell metadata={row.metadata} diff={row.diff} />
      </td>
    </tr>
  );
}

function AuditRowCard({ row }: { row: AdminAuditRowOut }) {
  const role = normaliseActorRole(row.actorRole);
  const roleStyle = ACTOR_ROLE_STYLES[role];
  const link = resolveAuditSubjectLink(row.collection, row.recordId, row.metadata);
  const bucket = bucketForCollection(row.collection);
  return (
    <li className="rounded-2xl bg-white border border-stone-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-ink leading-snug">
          {formatActionLabel(row.action)}
        </p>
        <span className="text-[11.5px] text-ink-soft font-mono shrink-0">
          {formatTimestamp(row.timestamp)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2 mb-2 text-[12.5px]">
        <span className="text-ink-soft">{row.actorName}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${roleStyle.pillBg} ${roleStyle.pillText}`}
        >
          {roleStyle.label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {bucket === "other" ? row.collection ?? "—" : bucket}
        </span>
      </div>
      {link ? (
        <Link
          href={link.href}
          className="block text-tangerine-deeper hover:underline text-[13px] mb-2 truncate"
        >
          {link.label} · {row.recordId?.slice(0, 12) ?? "—"}
        </Link>
      ) : row.recordId ? (
        <code className="block text-[11.5px] bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200 mb-2 truncate">
          {row.recordId}
        </code>
      ) : null}
      <AuditMetadataCell metadata={row.metadata} diff={row.diff} />
    </li>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
      <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
        {hasFilters ? "Nothing matches." : "No events yet."}
      </p>
      <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
        {hasFilters
          ? "Widen the filters, or clear them to see the full history."
          : "Every DI and admin action gets logged here. Once activity starts, this page fills up."}
      </p>
    </div>
  );
}
