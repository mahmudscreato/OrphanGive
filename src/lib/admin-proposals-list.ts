// Session 51 — Admin-side proposal list + detail readers.
//
// Distinct from DI's `listProposalsForUser` / `getProposalForUser` in
// `di-proposals.ts` because:
//   1. No DI scope filter — admin sees all proposals across all DIs.
//   2. Resolves the submitter's first/last name (DI's reader doesn't —
//      DI knows it's their own row).
//   3. Fetches the full editable-field surface for the diff view, not
//      just the Session-44 partial set the DI summary path used.
//   4. Filter by status (All/Pending/Approved/Rejected) for the queue tabs.
//
// Mutations are not in this module — admin's approve/reject paths
// stay in `admin-proposals.ts` (Session 46-fix-2). This file is read-
// only.

import "server-only";

import { readItem, readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

export type ProposalStatus = "draft" | "pending" | "approved" | "rejected";
export type ProposalType = "create" | "update";

export interface AdminProposalSummary {
  id: string;
  proposal_type: ProposalType;
  // For UPDATE proposals this is the live child name (resolved); for
  // CREATE it's the proposed display_name on the proposal row itself.
  child_label: string;
  target_child: string | null;
  submitted_by_name: string;
  submitted_by_id: string | null;
  date_created: string | null;
  status: ProposalStatus;
  // Number of changed-fields surfaced in the queue list. For UPDATE
  // we count keys present in `previous_snapshot` (those are the
  // fields the DI actually proposed touching). For CREATE this is
  // the count of populated mirror columns on the proposal row.
  change_count: number;
  // Surface for status='rejected' rows so admin can scan their own
  // prior reasons without opening the detail page.
  rejection_reason: string | null;
  published_at: string | null;
}

export interface AdminProposalDiffEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AdminProposalDetail {
  id: string;
  proposal_type: ProposalType;
  status: ProposalStatus;
  child_label: string;
  target_child: string | null;
  submitted_by_name: string;
  submitted_by_id: string | null;
  date_created: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  // The full proposed row payload (for CREATE, the new-record values;
  // for UPDATE, just the changed fields).
  proposed: Record<string, unknown>;
  // Photo file UUID on the proposal (admin renders preview).
  photo_uuid: string | null;
  // Diff is null for CREATE (no previous_snapshot exists).
  diff: AdminProposalDiffEntry[] | null;
}

// ─── Internal types ─────────────────────────────────────────────────

// Wildcard read so we don't have to hand-list 41 columns. The
// downstream consumer uses an EDITABLE_FIELDS list to extract
// what's relevant for the diff.
type ProposalRowFlat = {
  id: string;
  proposal_type: string | null;
  target_child: string | null;
  status: string | null;
  date_created: string | null;
  published_at: string | null;
  rejection_reason: string | null;
  display_name: string | null;
  Photo: string | null;
  created_by: string | null;
  previous_snapshot: Record<string, unknown> | null;
} & Partial<Record<string, unknown>>;

// Same field list as MIRROR_FIELDS in admin-proposals.ts — these are
// the columns that the proposal row actually mirrors child columns
// for, so this is the authoritative diff surface.
const EDITABLE_FIELDS: ReadonlyArray<string> = [
  "display_name",
  "first_name",
  "gender",
  "date_of_birth",
  "photo_consent",
  "Photo",
  "bd_division",
  "bd_district",
  "district_internal",
  "permanent_address",
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  "story",
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
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
];

function isProposalStatus(s: string | null): s is ProposalStatus {
  return (
    s === "draft" || s === "pending" || s === "approved" || s === "rejected"
  );
}
function isProposalType(s: string | null): s is ProposalType {
  return s === "create" || s === "update";
}

// ─── Public API: list ───────────────────────────────────────────────

/**
 * List proposals for the admin queue. Default filter is `pending`;
 * pass status='all' to disable the status filter entirely. Sort is
 * ascending date_created when status is `pending` (FIFO review
 * order), descending otherwise (most recent decisions on top).
 */
export async function listAdminProposals(opts?: {
  status?: ProposalStatus | "all";
  limit?: number;
}): Promise<AdminProposalSummary[]> {
  const status = opts?.status ?? "pending";

  const filter: Record<string, unknown> | undefined =
    status === "all" ? undefined : { status: { _eq: status } };

  // FIFO when reviewing pending; reverse-chron when browsing decided
  // history (most recent at top).
  const sort = status === "pending" ? ["date_created"] : ["-date_created"];

  let rows: ProposalRowFlat[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child_proposal" as never, {
        ...(filter ? { filter } : {}),
        // Wildcard pulls everything — needed to compute the
        // change_count without a second roundtrip per row.
        fields: ["*"],
        sort,
        limit: opts?.limit ?? 100,
      } as never),
    )) as unknown as ProposalRowFlat[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-proposals-list] listAdminProposals failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  // Resolve submitter names + UPDATE-target child display names in
  // batched lookups so the queue page is one Directus round-trip per
  // collection regardless of how many rows.
  const submitterIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)),
  );
  const childIds = Array.from(
    new Set(
      rows
        .filter((r) => r.proposal_type === "update" && r.target_child)
        .map((r) => r.target_child as string),
    ),
  );

  const [nameByUserId, nameByChildId] = await Promise.all([
    submitterIds.length > 0 ? resolveUserNames(submitterIds) : new Map(),
    childIds.length > 0 ? resolveChildNames(childIds) : new Map(),
  ]);

  return rows.map((r) => {
    const status: ProposalStatus = isProposalStatus(r.status)
      ? r.status
      : "pending";
    const proposal_type: ProposalType = isProposalType(r.proposal_type)
      ? r.proposal_type
      : "update";

    const childLabel =
      proposal_type === "update" && r.target_child
        ? nameByChildId.get(r.target_child) ?? "Unknown child"
        : r.display_name?.trim() || "New child (unnamed)";

    const submittedByName = r.created_by
      ? nameByUserId.get(r.created_by) ?? "Unknown DI"
      : "Unknown DI";

    return {
      id: r.id,
      proposal_type,
      child_label: childLabel,
      target_child: r.target_child,
      submitted_by_name: submittedByName,
      submitted_by_id: r.created_by,
      date_created: r.date_created,
      status,
      change_count: countProposalChanges(r),
      rejection_reason: r.rejection_reason,
      published_at: r.published_at,
    };
  });
}

// ─── Public API: detail ─────────────────────────────────────────────

/**
 * Single proposal with full diff, no DI scope filter (admin sees
 * everything). Returns null on miss.
 *
 * Used by the admin detail page (Part C-detail of Session 51).
 */
export async function getAdminProposalDetail(
  proposalId: string,
): Promise<AdminProposalDetail | null> {
  if (!proposalId) return null;

  let row: ProposalRowFlat | null = null;
  try {
    const result = (await directusServer().request(
      readItem("child_proposal" as never, proposalId as never, {
        fields: ["*"],
      } as never),
    )) as unknown as ProposalRowFlat | null | undefined;
    row = result ?? null;
  } catch (err) {
    // Same FORBIDDEN-as-not-found pattern admin-proposals.ts uses.
    if (looksLikeNotFound(err)) return null;
    console.warn(
      "[admin-proposals-list] getAdminProposalDetail failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  const status: ProposalStatus = isProposalStatus(row.status)
    ? row.status
    : "pending";
  const proposal_type: ProposalType = isProposalType(row.proposal_type)
    ? row.proposal_type
    : "update";

  const [nameByUserId, nameByChildId] = await Promise.all([
    row.created_by ? resolveUserNames([row.created_by]) : Promise.resolve(new Map()),
    proposal_type === "update" && row.target_child
      ? resolveChildNames([row.target_child])
      : Promise.resolve(new Map()),
  ]);

  const childLabel =
    proposal_type === "update" && row.target_child
      ? nameByChildId.get(row.target_child) ?? "Unknown child"
      : row.display_name?.trim() || "New child (unnamed)";

  const submittedByName = row.created_by
    ? nameByUserId.get(row.created_by) ?? "Unknown DI"
    : "Unknown DI";

  // Build the proposed-payload + diff. We extract only the
  // EDITABLE_FIELDS columns so admin's UI doesn't render internal
  // metadata columns (status, target_child, etc.) as if they were
  // user-facing changes.
  const proposed: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    const v = (row as Record<string, unknown>)[f];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    proposed[f] = v;
  }

  let diff: AdminProposalDiffEntry[] | null = null;
  if (proposal_type === "update" && row.previous_snapshot) {
    const snap = row.previous_snapshot;
    diff = [];
    for (const field of EDITABLE_FIELDS) {
      const newValue = (row as Record<string, unknown>)[field];
      // For UPDATE proposals we only show fields the DI actually
      // proposed changing. The DI's submit logic only populates
      // changed columns, so a null/empty newValue means "no change
      // proposed". Skip.
      if (newValue === null || newValue === undefined) continue;
      if (typeof newValue === "string" && newValue.trim().length === 0) continue;
      if (Array.isArray(newValue) && newValue.length === 0) continue;
      const oldValue = (snap as Record<string, unknown>)[field] ?? null;
      diff.push({ field, oldValue, newValue });
    }
  }

  return {
    id: row.id,
    proposal_type,
    status,
    child_label: childLabel,
    target_child: row.target_child,
    submitted_by_name: submittedByName,
    submitted_by_id: row.created_by,
    date_created: row.date_created,
    published_at: row.published_at,
    rejection_reason: row.rejection_reason,
    proposed,
    photo_uuid: row.Photo,
    diff,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function countProposalChanges(row: ProposalRowFlat): number {
  if (row.proposal_type === "update" && row.previous_snapshot) {
    // For UPDATE proposals: count the number of populated mirror
    // columns on the proposal row. The DI's submit only writes
    // columns that actually changed.
    let n = 0;
    for (const f of EDITABLE_FIELDS) {
      const v = (row as Record<string, unknown>)[f];
      if (v === null || v === undefined) continue;
      if (typeof v === "string" && v.trim().length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      n += 1;
    }
    return n;
  }
  // CREATE: count populated mirror columns.
  let n = 0;
  for (const f of EDITABLE_FIELDS) {
    const v = (row as Record<string, unknown>)[f];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim().length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    n += 1;
  }
  return n;
}

async function resolveUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
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
      "[admin-proposals-list] resolveUserNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

async function resolveChildNames(
  childIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _in: childIds } },
        fields: ["id", "display_name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string; display_name: string | null }> | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r.display_name?.trim()) out.set(r.id, r.display_name.trim());
      }
    }
  } catch (err) {
    console.warn(
      "[admin-proposals-list] resolveChildNames failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

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
