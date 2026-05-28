// Session 66 — Admin Children management list (rewrite of the Session
// 51 stub).
//
// Server component. URL-driven filter + sort + search state so back-
// button and shareable URLs work. Each row links to the new admin
// detail page at /admin/children/[id]; the Session 51 version pointed
// at /children/[id] (donor-facing). The donor URL is still reachable
// via the "Preview as donor" link inside the detail page.
//
// Layout: desktop table with photo thumbnails + 9 columns; mobile
// stacks each row as a card. Both render from the same data fetch.

import Link from "next/link";
import { ChevronRight, User2 } from "lucide-react";
import {
  listAdminChildrenPage,
  type AdminChildPageRow,
  type AdminChildSponsorState,
} from "@/lib/admin-children";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const dynamic = "force-dynamic";

const STATUS_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting_intake", label: "Awaiting intake" },
  { value: "withdrawn", label: "Archived" },
];

const SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "date_updated_desc", label: "Most recently updated" },
  { value: "date_created_desc", label: "Newest profile" },
  { value: "display_name_asc", label: "Name (A → Z)" },
];

function parseStatus(s: string | undefined): string {
  if (
    s === "active" ||
    s === "withdrawn" ||
    s === "awaiting_intake" ||
    s === "all"
  ) {
    return s;
  }
  return "all";
}

function parseHasActive(s: string | undefined): "yes" | "no" | "all" {
  return s === "yes" || s === "no" ? s : "all";
}

function parseSort(s: string | undefined):
  | "date_updated_desc"
  | "date_created_desc"
  | "display_name_asc" {
  if (
    s === "date_updated_desc" ||
    s === "date_created_desc" ||
    s === "display_name_asc"
  ) {
    return s;
  }
  return "date_updated_desc";
}

function parsePage(s: string | undefined): number {
  if (!s) return 1;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

type FilterBase = {
  status: string;
  division: string;
  supportType: string;
  has: "yes" | "no" | "all";
  createdBy: string;
  q: string;
  sort: string;
  page: number;
};

function buildHref(
  base: FilterBase,
  overrides: Partial<FilterBase>,
): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.division !== "all" && merged.division)
    params.set("division", merged.division);
  if (merged.supportType !== "all" && merged.supportType)
    params.set("support_type", merged.supportType);
  if (merged.has !== "all") params.set("has", merged.has);
  if (merged.createdBy !== "all" && merged.createdBy)
    params.set("created_by", merged.createdBy);
  if (merged.q.trim().length > 0) params.set("q", merged.q.trim());
  if (merged.sort !== "date_updated_desc") params.set("sort", merged.sort);
  if (merged.page > 1) params.set("page", String(merged.page));
  const qs = params.toString();
  return qs ? `/admin/children?${qs}` : "/admin/children";
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
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default async function AdminChildrenListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    division?: string;
    support_type?: string;
    has?: string;
    created_by?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const division = sp.division?.trim() || "all";
  const supportType = sp.support_type?.trim() || "all";
  const has = parseHasActive(sp.has);
  const createdBy = sp.created_by?.trim() || "all";
  const search = (sp.q ?? "").trim();
  const sort = parseSort(sp.sort);
  const page = parsePage(sp.page);

  const result = await listAdminChildrenPage({
    status,
    division,
    supportType,
    hasActiveSponsor: has,
    createdByUserId: createdBy,
    search,
    sort,
    page,
    pageSize: 25,
  });

  const base: FilterBase = {
    status,
    division,
    supportType,
    has,
    createdBy,
    q: search,
    sort,
    page,
  };

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-6xl mx-auto">
      <AdminPageHeader
        title="Children"
        subtitle="Every child on record. Click into a row for the full admin detail — editable fields, documents, intake photos, sponsorships, audit trail, and admin actions."
      />

      {/* Status tabs */}
      <nav
        className="mb-4 flex flex-wrap gap-2"
        aria-label="Child status filter"
      >
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.value;
          return (
            <Link
              key={tab.value}
              href={buildHref(base, { status: tab.value, page: 1 })}
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

      {/* Secondary filter form */}
      <form
        action="/admin/children"
        method="GET"
        className="mb-5 grid grid-cols-1 md:grid-cols-12 gap-3"
      >
        {status !== "all" ? (
          <input type="hidden" name="status" value={status} />
        ) : null}

        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by display name…"
          className="md:col-span-4 rounded-xl border border-ink/[0.12] bg-white px-4 py-2.5 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Search children"
        />

        <select
          name="division"
          defaultValue={division}
          className="md:col-span-2 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Division filter"
        >
          <option value="all">All divisions</option>
          {result.available_divisions.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          name="support_type"
          defaultValue={supportType}
          className="md:col-span-2 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Support type filter"
        >
          <option value="all">All support types</option>
          {result.available_support_types.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          name="has"
          defaultValue={has}
          className="md:col-span-1 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Has active sponsor filter"
        >
          <option value="all">Sponsor</option>
          <option value="yes">Has</option>
          <option value="no">None</option>
        </select>

        <select
          name="created_by"
          defaultValue={createdBy}
          className="md:col-span-2 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Created-by filter"
        >
          <option value="all">All DIs</option>
          {result.available_dis.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          name="sort"
          defaultValue={sort}
          className="md:col-span-1 rounded-xl border border-ink/[0.12] bg-white px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150"
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="md:col-span-12 flex justify-end gap-2">
          {(search.length > 0 ||
            division !== "all" ||
            supportType !== "all" ||
            has !== "all" ||
            createdBy !== "all" ||
            sort !== "date_updated_desc") ? (
            <Link
              href={buildHref(
                {
                  status,
                  division: "all",
                  supportType: "all",
                  has: "all",
                  createdBy: "all",
                  q: "",
                  sort: "date_updated_desc",
                  page: 1,
                },
                {},
              )}
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
        Showing {result.rows.length} of {result.total} child
        {result.total === 1 ? "" : "ren"}
        {result.rows.length < result.total
          ? ` (page ${result.page} of ${Math.max(1, Math.ceil(result.total / result.pageSize))})`
          : null}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="min-w-full text-[13.5px]">
              <thead className="bg-stone-50 text-ink-soft font-medium">
                <tr>
                  <th className="text-left px-3 py-2.5 w-14" />
                  <th className="text-left px-3 py-2.5">Child</th>
                  <th className="text-left px-3 py-2.5">Location</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Support</th>
                  <th className="text-right px-3 py-2.5">Sponsor</th>
                  <th className="text-left px-3 py-2.5">DI</th>
                  <th className="text-left px-3 py-2.5">Updated</th>
                  <th className="text-right px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {result.rows.map((c) => (
                  <ChildRowTable key={c.id} child={c} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="md:hidden space-y-2">
            {result.rows.map((c) => (
              <ChildRowCard key={c.id} child={c} />
            ))}
          </ul>
        </>
      )}

      {result.total > result.pageSize ? (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between"
        >
          {result.page > 1 ? (
            <Link
              href={buildHref(base, { page: result.page - 1 })}
              className="inline-flex items-center px-4 py-2 rounded-full border border-stone-300 text-stone-700 bg-white font-medium text-[13.5px] hover:bg-stone-50 transition-colors"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-ink-soft">
            Page {result.page} of{" "}
            {Math.max(1, Math.ceil(result.total / result.pageSize))}
          </span>
          {result.page * result.pageSize < result.total ? (
            <Link
              href={buildHref(base, { page: result.page + 1 })}
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

function PhotoThumb({ photoUuid, alt }: { photoUuid: string | null; alt: string }) {
  if (!photoUuid) {
    return (
      <div className="w-10 h-10 rounded-lg bg-stone-100 inline-flex items-center justify-center">
        <User2 className="w-4 h-4 text-stone-400 stroke-[1.75]" aria-hidden="true" />
      </div>
    );
  }
  // /api/assets/{uuid} is the Directus-proxied image route used
  // everywhere else in the app. Plain <img> rather than next/image
  // because Cloudinary preconnect is in the root layout and these
  // are decorative thumbnails (no LCP concern).
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/api/assets/${photoUuid}?width=80&height=80&fit=cover&format=auto`}
      alt={alt}
      className="w-10 h-10 rounded-lg object-cover bg-stone-100"
      width={40}
      height={40}
    />
  );
}

function ChildRowTable({ child }: { child: AdminChildPageRow }) {
  return (
    <tr className="border-t border-stone-200 hover:bg-stone-50/60 transition-colors">
      <td className="px-3 py-2.5">
        <PhotoThumb photoUuid={child.photo_uuid} alt="" />
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/admin/children/${child.id}`}
          className="text-ink font-medium hover:text-tangerine-deeper transition-colors"
        >
          {child.display_name}
        </Link>
        {child.age !== null ? (
          <div className="text-[12px] text-ink-soft mt-0.5">
            Age {child.age}
          </div>
        ) : (
          <div className="text-[12px] text-ink-soft mt-0.5">Age unknown</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-ink-soft">
        {[child.district_name, child.division_name]
          .filter(Boolean)
          .join(", ") || "—"}
      </td>
      <td className="px-3 py-2.5">
        <StatusPill status={child.status} />
      </td>
      <td className="px-3 py-2.5 text-ink-soft">{child.support_type_label}</td>
      <td className="px-3 py-2.5 text-right">
        <SponsorStatePill
          state={child.sponsor_state}
          active={child.active_sponsor_count}
          queued={child.queued_sponsor_count}
        />
      </td>
      <td className="px-3 py-2.5 text-ink-soft text-[12.5px] truncate max-w-[140px]">
        {child.uploaded_by_name ?? "—"}
      </td>
      <td className="px-3 py-2.5 text-ink-soft">
        {formatRelative(child.date_updated ?? child.date_created)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <Link
          href={`/admin/children/${child.id}`}
          className="inline-flex items-center text-ink-soft hover:text-tangerine-deeper transition-colors"
          aria-label="Open child detail"
        >
          <ChevronRight className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function ChildRowCard({ child }: { child: AdminChildPageRow }) {
  return (
    <li>
      <Link
        href={`/admin/children/${child.id}`}
        className="group block rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 transition-colors hover:border-tangerine-soft"
      >
        <div className="flex items-start gap-3">
          <PhotoThumb photoUuid={child.photo_uuid} alt="" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-[17px] text-ink leading-snug truncate">
                {child.display_name}
              </p>
              <StatusPill status={child.status} />
              <SponsorStatePill
                state={child.sponsor_state}
                active={child.active_sponsor_count}
                queued={child.queued_sponsor_count}
              />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed truncate">
              {child.age !== null ? `Age ${child.age} · ` : ""}
              {[child.district_name, child.division_name]
                .filter(Boolean)
                .join(", ") || "Location unknown"}
              {" · "}
              {child.support_type_label}
            </p>
            <p className="mt-1 text-[12px] text-ink-soft leading-relaxed">
              {child.uploaded_by_name ? `${child.uploaded_by_name} · ` : ""}
              updated {formatRelative(child.date_updated ?? child.date_created)}
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}

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
      label: `Active · ${active}${queued > 0 ? ` (+${queued} queued)` : ""}`,
    },
    queued_waiting: {
      bg: "bg-amber-50",
      text: "text-amber-800",
      label: `Queued ${queued}`,
    },
    awaiting: {
      bg: "bg-moss-soft",
      text: "text-moss-deep",
      label: "Awaiting",
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

function EmptyState() {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
      <p className="font-script italic text-[18px] text-tangerine-deeper mb-2">
        No children match.
      </p>
      <p className="text-[14px] text-ink-soft leading-relaxed max-w-md mx-auto">
        Try widening the filters, or clear the search box.
      </p>
    </div>
  );
}
