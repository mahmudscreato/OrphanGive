// Session 51 — Admin-side children list reader.
//
// No DI scope filter — admins see every child. Distinct from
// children-data.ts (donor-facing list with `SAFE_FIELDS` Tier 1
// whitelist) and di-children.ts (DI-scoped list with assigned/uploaded
// constraint). This module returns a small admin-targeted shape
// suitable for the V1 read-only list page.
//
// V1 shape: enough for triage + click-through to the existing donor
// profile page. Full admin child detail (with Tier 3 PII, audit
// history, internal notes) is a future session.
//
// Session 66 — added rich list + detail data layers for the full
// admin children management view:
//   listAdminChildrenPage(opts)       — paginated, filterable,
//                                       searchable, with sponsor
//                                       count + funding state +
//                                       DI creator resolved
//   getAdminChildDetail(childId)      — full editable surface +
//                                       sponsorship list + queue +
//                                       documents + intake photos
//   getAdminChildEditSnapshot(childId)— admin-scope variant of
//                                       di-children's
//                                       getChildEditSnapshot (no DI
//                                       scope filter)
//   countActiveChildrenForBadge()     — sidebar tile
//
// The Session 51 reader `listAdminChildren` is kept untouched for
// backwards compat with anything else that may import it; the new
// list page consumes the paginated variant below.

import "server-only";

import { readItem, readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { getSupportTypeLabel } from "./form-constants";

// Session 52a — renamed `pending_intake` → `awaiting_intake` to
// match the new `child.status` value used for stub children. The
// admin children page surfaces this as a filter pill so admins can
// triage "drafts in progress from DIs."
export type AdminChildStatusFilter =
  | "all"
  | "active"
  | "withdrawn"
  | "awaiting_intake";

export interface AdminChildRow {
  id: string;
  display_name: string;
  age: number | null;
  division_name: string | null;
  district_name: string | null;
  support_type_label: string;
  status: string;
  // Sponsorship snapshot — same Awaiting / Monthly / Prepaid /
  // Paused buckets DI side derives. Computed via a 2-step query.
  sponsor_category: "awaiting" | "monthly" | "prepaid" | "paused";
}

type ChildRow = {
  id: string;
  display_name: string | null;
  date_of_birth: string | null;
  bd_division: { name?: string | null } | null;
  bd_district: { name?: string | null } | null;
  support_type: string | null;
  status: string | null;
};

const CHILD_FIELDS = [
  "id",
  "display_name",
  "date_of_birth",
  "bd_division.name",
  "bd_district.name",
  "support_type",
  "status",
] as const;

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * List all children with sponsorship buckets resolved. `status`
 * filter narrows to a particular row.status; default 'all' returns
 * everything (admin needs visibility on withdrawn children too).
 *
 * Sort is alphabetical by display_name — gives admin a stable index
 * to scan when looking for a specific child by name.
 */
export async function listAdminChildren(opts?: {
  status?: AdminChildStatusFilter;
  limit?: number;
}): Promise<AdminChildRow[]> {
  const status = opts?.status ?? "all";
  const filter: Record<string, unknown> | undefined =
    status === "all" ? undefined : { status: { _eq: status } };

  let rows: ChildRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        ...(filter ? { filter } : {}),
        fields: [...CHILD_FIELDS],
        sort: ["display_name"],
        limit: opts?.limit ?? 500,
      } as never),
    )) as unknown as ChildRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-children] listAdminChildren failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  if (rows.length === 0) return [];

  // Resolve active sponsorships in one batched query, then bucket
  // each child. Same logic shape as DI's ChildCard resolver — but
  // without the per-DI scope filter.
  const childIds = rows.map((r) => r.id);
  const sponsorshipByChild = new Map<
    string,
    { schedule: string | null; status: string | null }
  >();
  try {
    const sps = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _in: childIds } },
            { status: { _in: ["active", "paused"] } },
          ],
        },
        fields: ["child", "status", "payment_schedule"],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      child: string;
      status: string | null;
      payment_schedule: string | null;
    }> | undefined;
    if (Array.isArray(sps)) {
      // Most recent active/paused row per child wins (sort is desc
      // by date_created).
      for (const s of sps) {
        if (!sponsorshipByChild.has(s.child)) {
          sponsorshipByChild.set(s.child, {
            schedule: s.payment_schedule,
            status: s.status,
          });
        }
      }
    }
  } catch (err) {
    console.warn(
      "[admin-children] sponsorship lookup failed (continuing with awaiting buckets):",
      err instanceof Error ? err.message : err,
    );
  }

  return rows.map((r) => {
    const sp = sponsorshipByChild.get(r.id);
    let bucket: AdminChildRow["sponsor_category"] = "awaiting";
    if (sp) {
      if (sp.status === "paused") bucket = "paused";
      else if (sp.schedule === "monthly_prepaid") bucket = "prepaid";
      else if (sp.schedule === "monthly") bucket = "monthly";
      // else falls through to awaiting — defensive against unknown
      // payment_schedule values.
    }
    return {
      id: r.id,
      display_name: r.display_name?.trim() || "Unnamed child",
      age: calcAge(r.date_of_birth),
      division_name: r.bd_division?.name?.trim() ?? null,
      district_name: r.bd_district?.name?.trim() ?? null,
      support_type_label: r.support_type
        ? getSupportTypeLabel(r.support_type)
        : "—",
      status: r.status ?? "active",
      sponsor_category: bucket,
    };
  });
}

// ─── Session 66 — rich list + detail data layer ─────────────────────
//
// The Session 51 read above produces a small alphabetised list good
// for a stub page. The new admin management view needs sponsor count,
// funding state, DI creator name, last-updated timestamp, filters
// (status / division / support type / has-sponsor / created-by),
// free-text search, sort + pagination. Different shape, separate
// helpers — no breaking changes to the V1 reader.
//
// Schema notes used below:
//   child.status                 'active' | 'awaiting_intake' | 'withdrawn'
//                                ('inactive' / 'archived' aren't in the
//                                enum yet — see admin-child-actions.ts
//                                for how we map "Archive" + "Mark
//                                inactive" onto the existing values.)
//   child.uploaded_by_di         M2O directus_users (the DI who
//                                originally submitted the proposal)
//   child.assigned_di            M2O directus_users (the DI currently
//                                shepherding the child's updates)
//   child.date_updated           Directus auto-fill via the
//                                `date-updated` special on the column
//   child.bd_division / bd_district  M2O with .code + .name

export type AdminChildSponsorState =
  | "fully_funded"   // queue_position=0 row exists (one currently supporting)
  | "queued_waiting" // no active row but at least one queued (position>0)
  | "awaiting";      // no active + no queued

export interface AdminChildPageRow {
  id: string;
  display_name: string;
  age: number | null;
  // Photo file UUID — used to build /api/assets/{uuid} thumbnails.
  // Null when the child has no photo on file.
  photo_uuid: string | null;
  division_name: string | null;
  district_name: string | null;
  // Raw status string — UI maps to pill colour.
  status: string;
  support_type: string | null;
  support_type_label: string;
  active_sponsor_count: number;
  queued_sponsor_count: number;
  sponsor_state: AdminChildSponsorState;
  // M2O resolved to first/last name (or email fallback). Null when
  // the column is empty or the user no longer exists.
  uploaded_by_name: string | null;
  uploaded_by_id: string | null;
  // ISO timestamps.
  date_created: string | null;
  date_updated: string | null;
}

export interface AdminChildPage {
  rows: AdminChildPageRow[];
  total: number;
  page: number;
  pageSize: number;
  // Distinct values for the filter dropdowns, computed once across
  // the unfiltered population. Each ships as the raw code + a
  // display label so the UI can show "Dhaka" while filtering on
  // "dhaka".
  available_divisions: Array<{ code: string; name: string }>;
  available_support_types: Array<{ value: string; label: string }>;
  available_dis: Array<{ id: string; name: string }>;
}

export type AdminChildListSort =
  | "date_updated_desc"
  | "display_name_asc"
  | "date_created_desc";

export interface ListAdminChildrenPageOpts {
  page?: number;          // 1-indexed
  pageSize?: number;      // default 25
  status?: string | "all";       // raw status string OR "all"
  division?: string | "all";     // bd_division.code OR "all"
  supportType?: string | "all";  // raw support_type value OR "all"
  hasActiveSponsor?: "yes" | "no" | "all";
  createdByUserId?: string | "all";
  search?: string;        // free-text on display_name (trimmed)
  sort?: AdminChildListSort;
}

type ChildPageRowRaw = {
  id: string;
  display_name: string | null;
  date_of_birth: string | null;
  Photo: string | null;
  bd_division: { code?: string | null; name?: string | null } | null;
  bd_district: { name?: string | null } | null;
  support_type: string | null;
  status: string | null;
  uploaded_by_di: string | null;
  date_created: string | null;
  date_updated: string | null;
};

// Session 65-66-61.2 hotfix — `date_created` and `date_updated`
// removed.
//
// On this Directus install, the admin token returns HTTP 403 for
// both child.date_created and child.date_updated (the column
// either isn't on the schema or isn't in the admin read policy).
// Including either in `fields[]` made the WHOLE list query 403 →
// empty array → /admin/children rendered "Showing 0 of 0 children"
// while the sidebar badge (which only reads `id` filtered by
// status='active') showed the real count of 10. Verified via
// direct REST probe — see commit message.
//
// Downstream: the list page falls back to alphabetical sort by
// display_name (was: -date_updated, -date_created); detail page's
// "Created"/"Last updated" rows render "—" until the columns are
// granted to the admin policy. Everything else still works.
const CHILD_PAGE_FIELDS = [
  "id",
  "display_name",
  "date_of_birth",
  "Photo",
  "bd_division.code",
  "bd_division.name",
  "bd_district.name",
  "support_type",
  "status",
  "uploaded_by_di",
] as const;

/**
 * Sidebar badge count. Cheap single read of active-children id-only.
 * Failure returns 0 so the badge hides gracefully.
 */
export async function countActiveChildrenForBadge(): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[admin-children] countActiveChildrenForBadge failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

/**
 * The rich list used by /admin/children. Three Directus round-trips:
 *   1. Wide-fetch children matching server-side filters + search,
 *      capped at a workable window so we can post-filter the
 *      hasActiveSponsor flag locally (Directus REST can't express
 *      "has a row in a related collection" via filter language).
 *   2. Fan-out sponsorship reader for the visible children to compute
 *      sponsor counts + funding state.
 *   3. User-name resolution for the DI creator column.
 *
 * Distinct-value lists for the filter dropdowns are derived from
 * the unfiltered population in a follow-up read — kept separate so
 * the dropdowns don't shrink to "matches only" as the admin narrows
 * the filter set.
 */
export async function listAdminChildrenPage(
  opts: ListAdminChildrenPageOpts = {},
): Promise<AdminChildPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, opts.pageSize ?? 25));
  const status = opts.status ?? "all";
  const division = opts.division ?? "all";
  const supportType = opts.supportType ?? "all";
  const hasActive = opts.hasActiveSponsor ?? "all";
  const createdBy = opts.createdByUserId ?? "all";
  const sort = opts.sort ?? "date_updated_desc";
  const search = (opts.search ?? "").trim();

  // ── Build the Directus filter ──
  const filters: Record<string, unknown>[] = [];
  if (status !== "all") filters.push({ status: { _eq: status } });
  if (division !== "all")
    filters.push({ bd_division: { code: { _eq: division } } });
  if (supportType !== "all")
    filters.push({ support_type: { _eq: supportType } });
  if (createdBy !== "all")
    filters.push({ uploaded_by_di: { _eq: createdBy } });
  if (search.length > 0)
    filters.push({ display_name: { _icontains: search } });

  // ── Sort ──
  // Session 65-66-61.2 hotfix — date_updated / date_created are
  // unreadable for the admin token on `child` (HTTP 403). Sorting
  // on them returns the same 403, so every sort path falls back to
  // alphabetical display_name. The sort enum stays for forward
  // compat (UI dropdown keeps the options) but they all resolve
  // to the same clause until the columns are added to the policy.
  const sortClause = ((): string[] => {
    switch (sort) {
      case "display_name_asc":
      case "date_created_desc":
      case "date_updated_desc":
      default:
        return ["display_name"];
    }
  })();

  // If `hasActiveSponsor` is on, widen the raw fetch so the local
  // post-filter doesn't starve the page. 500 is enough for V1 admin
  // scale; bump if the children table ever grows past that.
  const rawLimit =
    hasActive === "all" ? page * pageSize + pageSize : 500;

  let rows: ChildPageRowRaw[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        filter: filters.length > 0 ? { _and: filters } : undefined,
        fields: [...CHILD_PAGE_FIELDS],
        sort: sortClause,
        limit: rawLimit,
      } as never),
    )) as unknown as ChildPageRowRaw[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-children] listAdminChildrenPage raw fetch failed",
      err instanceof Error ? err.message : err,
    );
    rows = [];
  }

  // ── Sponsor aggregates for everyone in the window ──
  const sponsorByChild = await loadSponsorAggregates(
    rows.map((r) => r.id),
  );

  // ── DI-name resolution (batch) ──
  const diIds = Array.from(
    new Set(rows.map((r) => r.uploaded_by_di).filter((x): x is string => !!x)),
  );
  const nameByDi = await resolveUserNames(diIds);

  // ── Build rich rows, apply hasActive post-filter ──
  let allRows: AdminChildPageRow[] = rows.map((r) =>
    toAdminChildPageRow(r, sponsorByChild.get(r.id), nameByDi),
  );
  if (hasActive === "yes") {
    allRows = allRows.filter((r) => r.active_sponsor_count > 0);
  } else if (hasActive === "no") {
    allRows = allRows.filter((r) => r.active_sponsor_count === 0);
  }

  // ── Paginate the post-filtered slice ──
  const total = allRows.length;
  const start = (page - 1) * pageSize;
  const slice = allRows.slice(start, start + pageSize);

  // ── Available-options for filter dropdowns ──
  const [divisions, supportTypes, dis] = await Promise.all([
    fetchAvailableDivisions(),
    fetchAvailableSupportTypes(),
    fetchAvailableDis(),
  ]);

  return {
    rows: slice,
    total,
    page,
    pageSize,
    available_divisions: divisions,
    available_support_types: supportTypes,
    available_dis: dis,
  };
}

// ── Per-child aggregate: active count + queued count + funding state ──
async function loadSponsorAggregates(
  childIds: string[],
): Promise<
  Map<string, { active: number; queued: number }>
> {
  const out = new Map<string, { active: number; queued: number }>();
  if (childIds.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _in: childIds } },
            // Only the active monthly side of the queue counts — the
            // queue helper uses the same filter to derive `current`
            // and `queued`.
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
          ],
        },
        fields: ["child", "queue_position"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      child: string | null;
      queue_position: number | null;
    }> | undefined;
    if (!Array.isArray(rows)) return out;
    for (const r of rows) {
      if (!r.child) continue;
      const entry = out.get(r.child) ?? { active: 0, queued: 0 };
      const pos = r.queue_position ?? 0;
      if (pos === 0) entry.active += 1;
      else entry.queued += 1;
      out.set(r.child, entry);
    }
  } catch (err) {
    console.warn(
      "[admin-children] loadSponsorAggregates failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _in: userIds } },
        fields: ["id", "first_name", "last_name", "email"],
        limit: -1,
      } as never),
    )) as unknown as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    }> | undefined;
    if (Array.isArray(users)) {
      for (const u of users) {
        const name =
          [u.first_name, u.last_name]
            .filter((s) => s && s.trim().length > 0)
            .join(" ")
            .trim() || u.email;
        out.set(u.id, name);
      }
    }
  } catch (err) {
    console.warn(
      "[admin-children] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

function toAdminChildPageRow(
  r: ChildPageRowRaw,
  agg: { active: number; queued: number } | undefined,
  nameByDi: Map<string, string>,
): AdminChildPageRow {
  const active = agg?.active ?? 0;
  const queued = agg?.queued ?? 0;
  let sponsorState: AdminChildSponsorState = "awaiting";
  if (active > 0) sponsorState = "fully_funded";
  else if (queued > 0) sponsorState = "queued_waiting";

  return {
    id: r.id,
    display_name: r.display_name?.trim() || "Unnamed child",
    age: calcAge(r.date_of_birth),
    photo_uuid: r.Photo,
    division_name: r.bd_division?.name?.trim() ?? null,
    district_name: r.bd_district?.name?.trim() ?? null,
    status: r.status ?? "active",
    support_type: r.support_type,
    support_type_label: r.support_type
      ? getSupportTypeLabel(r.support_type)
      : "—",
    active_sponsor_count: active,
    queued_sponsor_count: queued,
    sponsor_state: sponsorState,
    uploaded_by_id: r.uploaded_by_di,
    uploaded_by_name: r.uploaded_by_di
      ? nameByDi.get(r.uploaded_by_di) ?? null
      : null,
    // Session 65-66-61.2 hotfix — these are undefined at runtime
    // because the columns were dropped from CHILD_PAGE_FIELDS
    // (403 on this Directus install). Coerce to null so the
    // AdminChildPageRow's `string | null` type holds.
    date_created: r.date_created ?? null,
    date_updated: r.date_updated ?? null,
  };
}

// ── Filter-dropdown options (scanned across the unfiltered population) ──

async function fetchAvailableDivisions(): Promise<
  Array<{ code: string; name: string }>
> {
  try {
    const rows = (await directusServer().request(
      readItems("bd_division" as never, {
        fields: ["code", "name"],
        sort: ["name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ code: string; name: string }> | undefined;
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[admin-children] fetchAvailableDivisions failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function fetchAvailableSupportTypes(): Promise<
  Array<{ value: string; label: string }>
> {
  // Distinct support_type values actually used on existing children.
  // Cheaper than reading the enum schema and keeps the dropdown to
  // values admin will actually see in production.
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        fields: ["support_type"],
        filter: { support_type: { _nnull: true } },
        limit: -1,
      } as never),
    )) as unknown as Array<{ support_type: string | null }> | undefined;
    if (!Array.isArray(rows)) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const v = r.support_type?.trim();
      if (v) set.add(v);
    }
    return Array.from(set)
      .sort()
      .map((value) => ({ value, label: getSupportTypeLabel(value) }));
  } catch (err) {
    console.warn(
      "[admin-children] fetchAvailableSupportTypes failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function fetchAvailableDis(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        fields: ["uploaded_by_di"],
        filter: { uploaded_by_di: { _nnull: true } },
        limit: -1,
      } as never),
    )) as unknown as Array<{ uploaded_by_di: string | null }> | undefined;
    if (!Array.isArray(rows)) return [];
    const ids = Array.from(
      new Set(rows.map((r) => r.uploaded_by_di).filter((x): x is string => !!x)),
    );
    const nameMap = await resolveUserNames(ids);
    return ids
      .map((id) => ({ id, name: nameMap.get(id) ?? "Unknown DI" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.warn(
      "[admin-children] fetchAvailableDis failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Detail-page data layer ─────────────────────────────────────────

export interface AdminChildDetail {
  // Identity + headline
  id: string;
  display_name: string;
  age: number | null;
  date_of_birth: string | null;
  gender: string | null;
  photo_uuid: string | null;
  photo_consent: boolean | null;
  status: string;
  // Location
  division_code: string | null;
  division_name: string | null;
  district_code: string | null;
  district_name: string | null;
  district_internal: string | null;
  permanent_address: string | null;
  // Care plan
  support_type: string | null;
  support_type_label: string;
  monthly_cost: number | null;
  priority_support: string | null;
  priority_notes: string | null;
  // Education + interests
  education_level: string | null;
  class_grade: string | null;
  educational_organization: string | null;
  school_name_raw: string | null;
  areas_of_interest: string[] | null;
  // Donor story
  story: string;
  // Health
  blood_group: string | null;
  vaccination_status: string | null;
  last_medical_checkup: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  // Family
  parent_loss: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  household_income_source: string | null;
  monthly_household_income_bdt: number | null;
  // Guardian
  guardian_relationship: string | null;
  guardian_employment_type: string | null;
  guardian_employment: string | null;
  guardian_phone: string | null;
  guardian_phone_alt: string | null;
  guardian_summary_internal: string | null;
  additional_family_notes: string | null;
  // Visit
  last_visit_date: string | null;
  submission_date: string | null;
  // Provenance + audit
  uploaded_by_id: string | null;
  uploaded_by_name: string | null;
  assigned_di_id: string | null;
  assigned_di_name: string | null;
  date_created: string | null;
  date_updated: string | null;
  // Aggregates (computed)
  active_sponsor_count: number;
  queued_sponsor_count: number;
  sponsor_state: AdminChildSponsorState;
}

const CHILD_DETAIL_FIELDS = [
  ...CHILD_PAGE_FIELDS,
  "gender",
  "photo_consent",
  "bd_district.code",
  "district_internal",
  "permanent_address",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  "story",
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  "household_income_source",
  "monthly_household_income_bdt",
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  "last_visit_date",
  "submission_date",
  "assigned_di",
] as const;

type ChildDetailRowRaw = ChildPageRowRaw & {
  gender: string | null;
  photo_consent: boolean | null;
  bd_district: { code?: string | null; name?: string | null } | null;
  district_internal: string | null;
  permanent_address: string | null;
  monthly_cost: number | null;
  priority_support: string | null;
  priority_notes: string | null;
  education_level: string | null;
  class_grade: string | null;
  educational_organization: string | null;
  school_name_raw: string | null;
  areas_of_interest: string[] | null;
  story: string | null;
  blood_group: string | null;
  vaccination_status: string | null;
  last_medical_checkup: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  parent_loss: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  household_income_source: string | null;
  monthly_household_income_bdt: number | null;
  guardian_relationship: string | null;
  guardian_employment_type: string | null;
  guardian_employment: string | null;
  guardian_phone: string | null;
  guardian_phone_alt: string | null;
  guardian_summary_internal: string | null;
  additional_family_notes: string | null;
  last_visit_date: string | null;
  submission_date: string | null;
  assigned_di: string | null;
};

/**
 * Full child detail with sponsor aggregates + DI-name resolution.
 * Used by the admin detail page. Returns null when the child doesn't
 * exist OR Directus rejects the read.
 */
export async function getAdminChildDetail(
  childId: string,
): Promise<AdminChildDetail | null> {
  if (!childId) return null;

  let row: ChildDetailRowRaw | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child" as never, childId as never, {
        fields: [...CHILD_DETAIL_FIELDS],
      } as never),
    )) as unknown as ChildDetailRowRaw | null | undefined;
    row = result ?? null;
  } catch (err) {
    if (looksLikeNotFound(err)) return null;
    console.warn(
      "[admin-children] getAdminChildDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  // Sponsor aggregates + DI names in parallel.
  const [agg, nameByDi] = await Promise.all([
    loadSponsorAggregates([row.id]).then((m) => m.get(row!.id)),
    resolveUserNames(
      [row.uploaded_by_di, row.assigned_di].filter((x): x is string => !!x),
    ),
  ]);

  const active = agg?.active ?? 0;
  const queued = agg?.queued ?? 0;
  let sponsorState: AdminChildSponsorState = "awaiting";
  if (active > 0) sponsorState = "fully_funded";
  else if (queued > 0) sponsorState = "queued_waiting";

  return {
    id: row.id,
    display_name: row.display_name?.trim() || "Unnamed child",
    age: calcAge(row.date_of_birth),
    date_of_birth: row.date_of_birth,
    gender: row.gender,
    photo_uuid: row.Photo,
    photo_consent: row.photo_consent,
    status: row.status ?? "active",
    division_code: row.bd_division?.code ?? null,
    division_name: row.bd_division?.name?.trim() ?? null,
    district_code: row.bd_district?.code ?? null,
    district_name: row.bd_district?.name?.trim() ?? null,
    district_internal: row.district_internal,
    permanent_address: row.permanent_address,
    support_type: row.support_type,
    support_type_label: row.support_type
      ? getSupportTypeLabel(row.support_type)
      : "—",
    monthly_cost: row.monthly_cost,
    priority_support: row.priority_support,
    priority_notes: row.priority_notes,
    education_level: row.education_level,
    class_grade: row.class_grade,
    educational_organization: row.educational_organization,
    school_name_raw: row.school_name_raw,
    areas_of_interest: row.areas_of_interest,
    story: row.story?.trim() || "",
    blood_group: row.blood_group,
    vaccination_status: row.vaccination_status,
    last_medical_checkup: row.last_medical_checkup,
    disability_status: row.disability_status,
    disability_notes: row.disability_notes,
    parent_loss: row.parent_loss,
    siblings_count: row.siblings_count,
    sibling_position: row.sibling_position,
    siblings_notes: row.siblings_notes,
    household_size: row.household_size,
    household_income_source: row.household_income_source,
    monthly_household_income_bdt: row.monthly_household_income_bdt,
    guardian_relationship: row.guardian_relationship,
    guardian_employment_type: row.guardian_employment_type,
    guardian_employment: row.guardian_employment,
    guardian_phone: row.guardian_phone,
    guardian_phone_alt: row.guardian_phone_alt,
    guardian_summary_internal: row.guardian_summary_internal,
    additional_family_notes: row.additional_family_notes,
    last_visit_date: row.last_visit_date,
    submission_date: row.submission_date,
    uploaded_by_id: row.uploaded_by_di,
    uploaded_by_name: row.uploaded_by_di
      ? nameByDi.get(row.uploaded_by_di) ?? null
      : null,
    assigned_di_id: row.assigned_di,
    assigned_di_name: row.assigned_di
      ? nameByDi.get(row.assigned_di) ?? null
      : null,
    // Session 65-66-61.2 hotfix — same as list path; columns 403
    // so the spread of CHILD_PAGE_FIELDS into DETAIL_FIELDS no
    // longer asks for them either. Coerce to null.
    date_created: row.date_created ?? null,
    date_updated: row.date_updated ?? null,
    active_sponsor_count: active,
    queued_sponsor_count: queued,
    sponsor_state: sponsorState,
  };
}

// ─── Admin audit reader (no DI scope guard) ─────────────────────────
//
// `listAuditEventsForChild` in di-audit.ts is DI-scoped (rejects
// non-DI callers) and filters to action `_starts_with "di_"`. The
// admin detail page needs the OPPOSITE: no scope guard, include
// admin_* events too. We mirror its window-pull-then-app-side-filter
// pattern because audit_log.metadata is JSON and Directus REST
// can't filter on nested keys.
//
// Match rule: a row is "for this child" if either:
//   - record_id === childId (the row itself was the mutation target,
//     e.g. admin_edited_child / admin_archived_child); OR
//   - metadata.childId === childId (the row mutated a child-attached
//     artifact like child_document / child_intake_photo with the
//     childId stamped into metadata by the action helper).

export interface AdminAuditEvent {
  id: string;
  timestamp: string | null;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  collection: string | null;
  description: string;
}

export async function listAdminAuditEventsForChild(
  childId: string,
  limit: number = 30,
): Promise<AdminAuditEvent[]> {
  if (!childId) return [];
  const windowSize = Math.max(200, limit * 6);

  type AuditRow = {
    id: string;
    timestamp: string | null;
    actor: string | null;
    actor_role: string | null;
    action: string | null;
    collection: string | null;
    record_id: string | null;
    metadata: Record<string, unknown> | null;
  };

  let rows: AuditRow[] = [];
  try {
    // Narrow the window to the collections that ever carry child-
    // related audit rows. record_id = childId covers events on the
    // child row itself; the rest tag via metadata.childId.
    const result = (await directusServer().request(
      readItems("audit_log" as never, {
        filter: {
          collection: {
            _in: [
              "child",
              "child_document",
              "child_intake_photo",
              "child_moment",
              "child_update",
              "aid_delivery",
              "task",
              "child_proposal",
            ],
          },
        },
        fields: [
          "id",
          "timestamp",
          "actor",
          "actor_role",
          "action",
          "collection",
          "record_id",
          "metadata",
        ],
        sort: ["-timestamp"],
        limit: windowSize,
      } as never),
    )) as unknown as AuditRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-children] listAdminAuditEventsForChild fetch failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  // App-side filter by either record_id OR metadata.childId.
  rows = rows
    .filter((r) => {
      if (r.record_id === childId) return true;
      const md = r.metadata;
      if (md && typeof md === "object") {
        const child = (md as Record<string, unknown>).childId;
        const childAlt = (md as Record<string, unknown>).child_id;
        return child === childId || childAlt === childId;
      }
      return false;
    })
    .slice(0, limit);

  if (rows.length === 0) return [];

  // Resolve actor names in one batch.
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor).filter((x): x is string => !!x)),
  );
  const nameById = await resolveUserNames(actorIds);

  return rows.map((r) => {
    const actor = r.actor;
    const name = actor ? nameById.get(actor) ?? "Unknown" : "System";
    return {
      id: r.id,
      timestamp: r.timestamp,
      actorId: actor,
      actorName: name,
      actorRole: r.actor_role ?? "unknown",
      action: r.action ?? "unknown",
      collection: r.collection,
      description: describeAuditAction(r.action ?? "unknown", name),
    };
  });
}

// Human-readable copy for the audit panel. Mirrors di-audit's
// ACTION_DESCRIPTIONS but with admin-facing phrasing — admin sees
// "Admin approved a document" (third-person) rather than the DI's
// "Admin approved your document".
function describeAuditAction(action: string, actor: string): string {
  switch (action) {
    case "di_submitted_proposal":
      return `${actor} submitted a profile-edit proposal`;
    case "di_withdrew_proposal":
      return `${actor} withdrew a pending proposal`;
    case "di_uploaded_moment":
      return `${actor} uploaded a moment`;
    case "di_submitted_report":
      return `${actor} submitted a report`;
    case "di_marked_delivery":
      return `${actor} marked an aid delivery`;
    case "di_started_task":
      return `${actor} started a task`;
    case "di_completed_task":
      return `${actor} completed a task`;
    case "di_uploaded_photo":
      return `${actor} uploaded a photo`;
    case "di_uploaded_video":
      return `${actor} uploaded a video`;
    case "di_uploaded_intake_photo":
      return `${actor} uploaded an intake photo`;
    case "di_edited_intake_photo":
      return `${actor} edited an intake photo`;
    case "di_deleted_intake_photo":
      return `${actor} removed an intake photo`;
    case "di_uploaded_document":
      return `${actor} uploaded a document`;
    case "di_updated_document_notes":
      return `${actor} edited a document's notes`;
    case "di_deleted_document":
      return `${actor} removed a document`;
    case "admin_approved_proposal":
      return `${actor} approved a proposal`;
    case "admin_rejected_proposal":
      return `${actor} rejected a proposal`;
    case "admin_viewed_proposal":
      return `${actor} opened a proposal`;
    case "admin_viewed_document":
      return `${actor} opened a document`;
    case "admin_approved_document":
      return `${actor} approved a document`;
    case "admin_rejected_document":
      return `${actor} rejected a document`;
    case "admin_viewed_intake_photo_batch":
      return `${actor} opened intake photos`;
    case "admin_approved_intake_photo":
      return `${actor} approved an intake photo`;
    case "admin_rejected_intake_photo":
      return `${actor} rejected an intake photo`;
    case "admin_viewed_moment":
      return `${actor} opened a moment`;
    case "admin_approved_moment":
      return `${actor} approved a moment`;
    case "admin_rejected_moment":
      return `${actor} rejected a moment`;
    case "admin_removed_document":
      return `${actor} removed a pending document`;
    case "admin_removed_intake_photo":
      return `${actor} removed a pending intake photo`;
    case "admin_removed_approved_document":
      return `${actor} removed a previously-approved document`;
    case "admin_removed_approved_intake_photo":
      return `${actor} removed a previously-approved intake photo`;
    case "admin_uploaded_document":
      return `${actor} uploaded a document directly`;
    case "admin_uploaded_intake_photo":
      return `${actor} uploaded an intake photo directly`;
    case "admin_viewed_child":
      return `${actor} opened this child profile`;
    case "admin_edited_child":
      return `${actor} edited the child profile`;
    case "admin_archived_child":
      return `${actor} archived this child`;
    case "admin_reactivated_child":
      return `${actor} reactivated this child`;
    case "admin_requested_document_reupload":
      return `${actor} asked for a document re-upload`;
    case "admin_requested_intake_reupload":
      return `${actor} asked for an intake-photo re-upload`;
    default:
      return `${actor} performed ${action}`;
  }
}

// ─── Failure-mode helpers ───────────────────────────────────────────

function looksLikeNotFound(err: unknown): boolean {
  if (!err) return false;
  const errors = (err as { errors?: Array<{ extensions?: { code?: string } }> })
    .errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const code = e?.extensions?.code;
      if (code === "FORBIDDEN" || code === "ROUTE_NOT_FOUND") return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("FORBIDDEN") ||
    msg.includes("permission to access") ||
    msg.includes("not found")
  );
}
