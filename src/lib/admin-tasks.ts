// Spine 1.1 — Admin task creation + listing data layer.
//
// Sits between the admin UI and the existing task collection
// (Session 41-v3 schema, bootstrap/src/v3-register-collections.ts:212).
// DI-side reads + transitions remain in src/lib/di-tasks.ts —
// untouched. This module is admin-write + admin-read.
//
// Why this module exists separately:
//   - di-tasks.ts is "server-only" + scopes every read by
//     assignee = userId. Reusing it for the global admin queue
//     would require leaking past that scope guard.
//   - The Phase 0 task.sponsorship FK is consumed here for the
//     spine: a task created from /admin/sponsorships/[id] always
//     carries the sponsorship id, completing hop 3 of the
//     accountability spine (docs/admin-os/02-spine-design.md §2).
//
// Privacy: every public function in this module returns only
// Tier-1 child fields (id + display_name + bd_division.name).
// No district, no DOB, no guardian, no encrypted fields. The
// audit-log writer is also IDs-only — see recordAuditEvent calls
// in the route handler.

import "server-only";

import {
  createItem,
  readItem,
  readItems,
  readRoles,
  readUsers,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import type {
  TaskPriority,
  TaskDiStatus,
  TaskAdminStatus,
  TaskType,
} from "./di-tasks";

// ─── Public types ───────────────────────────────────────────────────

/** A DI eligible to be assigned a task. Returned by the picker
 *  + auto-assign resolver. */
export interface AssignableDI {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  assignedDivisions: string[];
  /** Whether this DI's assigned_divisions contains the child's
   *  division code (when one is provided). True for "in-scope" DIs;
   *  false for the fallback "all DIs" list. Lets the UI render an
   *  "Out-of-scope" badge or sort in-scope DIs first. */
  coversChildDivision: boolean;
}

export interface CreateTaskInput {
  adminUserId: string;
  // Piece #2 — sponsorship is now OPTIONAL. null = a general task not
  // tied to any sponsorship (the data model + DI UI already support
  // child/sponsorship being null; this relaxes the admin create path).
  sponsorshipId: string | null;
  childId: string | null; // null for campaign sponsorships OR general tasks
  assigneeUserId: string;
  title: string;
  // Piece #2 — the structured task category. Defaults to 'general' if
  // omitted so callers that predate the field still produce a valid row.
  type?: TaskType;
  description?: string | null;
  dueDate?: string | null; // YYYY-MM-DD
  priority?: TaskPriority;
}

export interface CreateTaskResult {
  taskId: string;
  assigneeUserId: string;
  childDivisionCode: string | null;
}

export interface AdminTaskRow {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  due_date: string | null;
  date_created: string | null;
  di_status: TaskDiStatus;
  admin_status: TaskAdminStatus;
  assignee_id: string;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  assignee_email: string;
  child_id: string | null;
  child_display_name: string | null;
  child_division_name: string | null; // Tier-1 only
  sponsorship_id: string | null;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class NoDIForDivisionError extends Error {
  readonly code = "no_di_for_division" as const;
  constructor(public readonly divisionCode: string) {
    super(`No Data Inputter covers division "${divisionCode}"`);
    this.name = "NoDIForDivisionError";
  }
}

export class InvalidTaskInputError extends Error {
  readonly code = "invalid_task_input" as const;
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "InvalidTaskInputError";
  }
}

// ─── Internal helpers ───────────────────────────────────────────────

const DI_ROLE_NAME = "Data Inputter";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DI_USER_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "assigned_divisions",
] as const;

type DiUserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  assigned_divisions: string[] | null;
};

function userRowToAssignable(
  row: DiUserRow,
  childDivision: string | null,
): AssignableDI {
  const assignedDivisions = Array.isArray(row.assigned_divisions)
    ? row.assigned_divisions.filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      )
    : [];
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    assignedDivisions,
    coversChildDivision:
      childDivision !== null && assignedDivisions.includes(childDivision),
  };
}

function sortDIs(list: AssignableDI[]): AssignableDI[] {
  // In-scope first, then alphabetical by first_name (case-insensitive),
  // then email as the tiebreaker. Deterministic so auto-assign always
  // picks the same DI given the same input.
  return [...list].sort((a, b) => {
    if (a.coversChildDivision !== b.coversChildDivision) {
      return a.coversChildDivision ? -1 : 1;
    }
    const an = (a.firstName ?? "").toLowerCase();
    const bn = (b.firstName ?? "").toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.email < b.email ? -1 : 1;
  });
}

// ─── Public API: DI picker + auto-assign ────────────────────────────

/**
 * Look up the Directus role id for the "Data Inputter" role. The
 * SDK can't filter `directus_users` on the nested `role.name` field
 * (Directus permission quirk — admin token gets FORBIDDEN on the
 * nested filter even though direct REST works). Two-step lookup
 * via the roles endpoint is the reliable path.
 *
 * Memoised at module scope: roles rarely change, and we only need
 * the id. A null return means the role is missing (catastrophic
 * config error) — listAssignableDIs surfaces that as "no DIs".
 */
let DI_ROLE_ID_CACHE: string | null | undefined = undefined;
async function getDIRoleId(): Promise<string | null> {
  if (DI_ROLE_ID_CACHE !== undefined) return DI_ROLE_ID_CACHE;
  try {
    // readRoles is the SDK helper for the core `directus_roles`
    // collection — `readItems("directus_roles", …)` throws "Cannot
    // use readItems for core collections" by design.
    const roles = (await directusServer().request(
      readRoles({
        filter: { name: { _eq: DI_ROLE_NAME } },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    const id = Array.isArray(roles) && roles[0] ? roles[0].id : null;
    DI_ROLE_ID_CACHE = id;
    return id;
  } catch (err) {
    console.warn(
      "[admin-tasks] getDIRoleId failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * List DIs eligible to be assigned a task. If `childDivisionCode` is
 * provided, returns DIs covering that division FIRST (with
 * coversChildDivision=true), then the rest (out-of-scope but still
 * eligible) — admin's manual picker can show both and surface a
 * warning if they pick out-of-scope.
 *
 * For null `childDivisionCode` (campaign sponsorships with no
 * child), returns all DIs with coversChildDivision=false (the
 * concept doesn't apply).
 */
export async function listAssignableDIs(
  childDivisionCode: string | null,
): Promise<AssignableDI[]> {
  const roleId = await getDIRoleId();
  if (!roleId) {
    console.warn(
      "[admin-tasks] Data Inputter role not found — no DIs assignable",
    );
    return [];
  }
  let rows: DiUserRow[] = [];
  try {
    const result = (await directusServer().request(
      readUsers({
        filter: {
          _and: [
            { role: { _eq: roleId } },
            { status: { _eq: "active" } },
          ],
        },
        fields: [...DI_USER_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as DiUserRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-tasks] listAssignableDIs failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return sortDIs(
    rows.map((r) => userRowToAssignable(r, childDivisionCode)),
  );
}

/**
 * Auto-assign resolver. Returns the FIRST DI (deterministic via
 * sortDIs) that covers `childDivisionCode`. Throws
 * NoDIForDivisionError when no DI covers the division — callers
 * MUST handle this case by falling back to the manual picker.
 *
 * When `childDivisionCode` is null (campaign sponsorship), the
 * caller should not invoke auto-assign — there's no division to
 * scope on. We throw a guard error so misuse is loud.
 */
export async function autoAssignDI(
  childDivisionCode: string | null,
): Promise<AssignableDI> {
  if (!childDivisionCode) {
    throw new NoDIForDivisionError("(none — campaign sponsorship)");
  }
  const all = await listAssignableDIs(childDivisionCode);
  const inScope = all.filter((d) => d.coversChildDivision);
  if (inScope.length === 0) {
    throw new NoDIForDivisionError(childDivisionCode);
  }
  return inScope[0]!; // sortDIs already put in-scope first + alphabetised
}

// ─── Public API: create ─────────────────────────────────────────────

/**
 * Create a task linked to a sponsorship and assigned to a DI. The
 * task lands in the DI's queue immediately because
 *   - task.assignee is set
 *   - task.di_status defaults to 'open'
 *   - di-tasks.ts:listTasksForUser filters only by assignee
 *
 * Does NOT write the audit row — the route handler does that AFTER
 * createTask returns so the audit captures the actual taskId.
 */
export async function createTask(
  input: CreateTaskInput,
): Promise<CreateTaskResult> {
  if (!UUID_RE.test(input.adminUserId)) {
    throw new InvalidTaskInputError("adminUserId", "must be a uuid");
  }
  // Piece #2 — sponsorship is optional (null = general task). Validate
  // the uuid shape only when one IS provided.
  if (input.sponsorshipId !== null && !UUID_RE.test(input.sponsorshipId)) {
    throw new InvalidTaskInputError("sponsorshipId", "must be a uuid or null");
  }
  if (input.childId !== null && !UUID_RE.test(input.childId)) {
    throw new InvalidTaskInputError("childId", "must be a uuid or null");
  }
  if (!UUID_RE.test(input.assigneeUserId)) {
    throw new InvalidTaskInputError("assigneeUserId", "must be a uuid");
  }
  const title = input.title.trim();
  if (title.length === 0 || title.length > 200) {
    throw new InvalidTaskInputError("title", "1-200 chars required");
  }
  const description = input.description?.trim() ?? null;
  if (description !== null && description.length > 2000) {
    throw new InvalidTaskInputError(
      "description",
      "max 2000 chars",
    );
  }
  const dueDate = input.dueDate?.trim() || null;
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new InvalidTaskInputError("dueDate", "must be YYYY-MM-DD or null");
  }
  const priority: TaskPriority = input.priority ?? "normal";
  // Piece #2 — coerce an unknown/missing type to 'general' (the column
  // default + legacy bucket) so we never write a bad enum value.
  const type: TaskType = VALID_TASK_TYPES_SET.has(input.type ?? "")
    ? (input.type as TaskType)
    : "general";

  // Look up the child's division code for the result (the route
  // handler uses it in the audit metadata so we know whether the
  // assignment was in-scope at creation time).
  let childDivisionCode: string | null = null;
  if (input.childId) {
    try {
      const child = (await directusServer().request(
        readItem("child" as never, input.childId as never, {
          fields: ["bd_division.code"],
        } as never),
      )) as unknown as {
        bd_division?: { code?: string | null } | null;
      } | null;
      childDivisionCode = child?.bd_division?.code ?? null;
    } catch {
      /* non-fatal — the child may have no bd_division */
    }
  }

  const payload: Record<string, unknown> = {
    title,
    description,
    type,
    child: input.childId,
    sponsorship: input.sponsorshipId,
    assignee: input.assigneeUserId,
    created_by: input.adminUserId,
    date_created: new Date().toISOString(),
    due_date: dueDate,
    priority,
    // di_status + admin_status default to 'open' at the column
    // level; we omit them so a future enum change in the DB
    // default doesn't get overridden by a stale literal here.
  };

  let created: { id?: string } | null = null;
  try {
    created = (await directusServer().request(
      createItem("task" as never, payload as never),
    )) as unknown as { id?: string } | null;
  } catch (err) {
    console.error(
      "[admin-tasks] createTask insert failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("task insert failed");
  }
  if (!created?.id) {
    throw new Error("task insert returned no id");
  }
  return {
    taskId: created.id,
    assigneeUserId: input.assigneeUserId,
    childDivisionCode,
  };
}

// ─── Public API: admin list (/admin/tasks) ──────────────────────────

const ADMIN_TASK_FIELDS = [
  "id",
  "title",
  "description",
  "type",
  "priority",
  "due_date",
  "date_created",
  "di_status",
  "admin_status",
  "assignee.id",
  "assignee.first_name",
  "assignee.last_name",
  "assignee.email",
  "child.id",
  "child.display_name",
  // Tier-1 only — division name, NEVER district.
  "child.bd_division.name",
  "sponsorship",
] as const;

type AdminTaskQueryRow = {
  id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  priority: string | null;
  due_date: string | null;
  date_created: string | null;
  di_status: string | null;
  admin_status: string | null;
  assignee:
    | string
    | {
        id?: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string;
      }
    | null;
  child:
    | string
    | {
        id?: string;
        display_name?: string | null;
        bd_division?: { name?: string | null } | null;
      }
    | null;
  sponsorship: string | null;
};

const VALID_DI_STATUSES_SET = new Set<string>([
  "open",
  "in_progress",
  "completed_pending_verification",
]);
const VALID_ADMIN_STATUSES_SET = new Set<string>([
  "open",
  "verified_complete",
  "rejected_redo",
]);
const VALID_PRIORITIES_SET = new Set<string>([
  "low",
  "normal",
  "high",
  "urgent",
]);
const VALID_TASK_TYPES_SET = new Set<string>([
  "need_report",
  "delivery_photos",
  "need_moments",
  "health_check",
  "general",
  "custom",
]);

function rowToAdminTaskRow(row: AdminTaskQueryRow): AdminTaskRow {
  const assigneeObj =
    row.assignee && typeof row.assignee === "object" ? row.assignee : null;
  const childObj =
    row.child && typeof row.child === "object" ? row.child : null;
  return {
    id: row.id,
    title: row.title?.trim() || "(untitled)",
    description: row.description?.trim() ?? null,
    // Piece #2 — coerce null/unknown type → 'general' (legacy bucket).
    type: (VALID_TASK_TYPES_SET.has(row.type ?? "")
      ? row.type
      : "general") as TaskType,
    priority: (VALID_PRIORITIES_SET.has(row.priority ?? "")
      ? row.priority
      : "normal") as TaskPriority,
    due_date: row.due_date,
    date_created: row.date_created,
    di_status: (VALID_DI_STATUSES_SET.has(row.di_status ?? "")
      ? row.di_status
      : "open") as TaskDiStatus,
    admin_status: (VALID_ADMIN_STATUSES_SET.has(row.admin_status ?? "")
      ? row.admin_status
      : "open") as TaskAdminStatus,
    assignee_id: assigneeObj?.id ?? (typeof row.assignee === "string" ? row.assignee : ""),
    assignee_first_name: assigneeObj?.first_name ?? null,
    assignee_last_name: assigneeObj?.last_name ?? null,
    assignee_email: assigneeObj?.email ?? "",
    child_id: childObj?.id ?? (typeof row.child === "string" ? row.child : null),
    child_display_name: childObj?.display_name?.trim() ?? null,
    child_division_name: childObj?.bd_division?.name?.trim() ?? null,
    sponsorship_id: row.sponsorship,
  };
}

/**
 * Global admin task list for /admin/tasks. Filter shape mirrors
 * `listTasksForUser`'s but without the assignee scope guard —
 * admin sees everything.
 */
export async function listAdminTasks(opts?: {
  diStatus?: TaskDiStatus | "all";
  adminStatus?: TaskAdminStatus | "all";
  assigneeId?: string;
}): Promise<AdminTaskRow[]> {
  const filters: Record<string, unknown>[] = [];
  if (opts?.diStatus && opts.diStatus !== "all") {
    filters.push({ di_status: { _eq: opts.diStatus } });
  }
  if (opts?.adminStatus && opts.adminStatus !== "all") {
    filters.push({ admin_status: { _eq: opts.adminStatus } });
  }
  if (opts?.assigneeId && UUID_RE.test(opts.assigneeId)) {
    filters.push({ assignee: { _eq: opts.assigneeId } });
  }

  let rows: AdminTaskQueryRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: filters.length > 0 ? { _and: filters } : undefined,
        fields: [...ADMIN_TASK_FIELDS],
        sort: ["-date_created"],
        limit: 200,
      } as never),
    )) as unknown as AdminTaskQueryRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-tasks] listAdminTasks failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.map(rowToAdminTaskRow);
}

// ─── Public API: admin single-task detail (/admin/tasks/[id]) ───────

/**
 * Richer single-task view for the admin detail page. Extends
 * AdminTaskRow with the lifecycle timestamps + actors + the auto-task
 * idempotency key. `source_payment_id` is fetched in a SEPARATE
 * best-effort read so a stack where the piece-#3 column hasn't been
 * migrated yet still renders the detail page (the field just shows as
 * null).
 */
export interface AdminTaskDetail extends AdminTaskRow {
  completed_at: string | null;
  verified_at: string | null;
  verified_by_name: string | null;
  created_by_name: string | null;
  /** Set only on donation auto-created tasks (piece #3). */
  source_payment_id: string | null;
}

const ADMIN_TASK_DETAIL_FIELDS = [
  ...ADMIN_TASK_FIELDS,
  "completed_at",
  "verified_at",
  "verified_by.id",
  "verified_by.first_name",
  "verified_by.last_name",
  "verified_by.email",
  "created_by.id",
  "created_by.first_name",
  "created_by.last_name",
  "created_by.email",
] as const;

type UserRef =
  | string
  | {
      id?: string;
      first_name?: string | null;
      last_name?: string | null;
      email?: string;
    }
  | null;

function userRefName(ref: UserRef): string | null {
  if (!ref || typeof ref !== "object") return null;
  const name = [ref.first_name?.trim(), ref.last_name?.trim()]
    .filter(Boolean)
    .join(" ");
  if (name.length > 0) return name;
  return ref.email?.trim() || null;
}

export async function getAdminTaskById(
  taskId: string,
): Promise<AdminTaskDetail | null> {
  if (!UUID_RE.test(taskId)) return null;

  let row:
    | (AdminTaskQueryRow & {
        completed_at: string | null;
        verified_at: string | null;
        verified_by: UserRef;
        created_by: UserRef;
      })
    | undefined;
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: { id: { _eq: taskId } },
        fields: [...ADMIN_TASK_DETAIL_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as Array<
      AdminTaskQueryRow & {
        completed_at: string | null;
        verified_at: string | null;
        verified_by: UserRef;
        created_by: UserRef;
      }
    >;
    row = Array.isArray(result) ? result[0] : undefined;
  } catch (err) {
    console.warn(
      "[admin-tasks] getAdminTaskById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;

  // Best-effort read of the piece-#3 idempotency column — isolated so
  // a missing column (migration pending) doesn't break the main read.
  let sourcePaymentId: string | null = null;
  try {
    const r = (await directusServer().request(
      readItems("task" as never, {
        filter: { id: { _eq: taskId } },
        fields: ["source_payment_id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ source_payment_id: string | null }>;
    sourcePaymentId = r?.[0]?.source_payment_id ?? null;
  } catch {
    /* column pending migration — leave null */
  }

  const base = rowToAdminTaskRow(row);
  return {
    ...base,
    completed_at: row.completed_at ?? null,
    verified_at: row.verified_at ?? null,
    verified_by_name: userRefName(row.verified_by),
    created_by_name: userRefName(row.created_by),
    source_payment_id: sourcePaymentId,
  };
}

// ─── Public API: child picker (create-task form, SS1 fix) ───────────

/**
 * Tier-1 child list for the create-task child picker. Carries
 * `assignedDiId` so the client can surface the chosen assignee DI's
 * children first, while keeping ALL children searchable. Privacy: NO
 * Tier-3 fields — first_name (public) is the label; display_name is
 * only a fallback when first_name is empty (admin already sees it on
 * the task list). Division name disambiguates.
 */
export interface PickableChild {
  id: string;
  firstName: string | null;
  displayName: string | null;
  divisionName: string | null;
  assignedDiId: string | null;
}

const PICKABLE_CHILD_FIELDS = [
  "id",
  "first_name",
  "display_name",
  "bd_division.name",
  "assigned_di",
] as const;

export async function listPickableChildren(): Promise<PickableChild[]> {
  let rows: Array<{
    id: string;
    first_name: string | null;
    display_name: string | null;
    bd_division: { name?: string | null } | null;
    assigned_di: string | { id?: string } | null;
  }> = [];
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _neq: "withdrawn" } },
        fields: [...PICKABLE_CHILD_FIELDS],
        sort: ["first_name", "display_name"],
        limit: 500,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-tasks] listPickableChildren failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.map((r) => {
    const di = r.assigned_di;
    return {
      id: r.id,
      firstName: r.first_name?.trim() || null,
      displayName: r.display_name?.trim() || null,
      divisionName: r.bd_division?.name?.trim() || null,
      assignedDiId: typeof di === "string" ? di : di?.id ?? null,
    };
  });
}

/**
 * Convenience reader: which sponsorships are eligible for task
 * creation from the standalone /admin/tasks/new form. Filter:
 * status in (active, paused, pending_payment, completed) AND
 * payment_mode in (monthly, one_time). Sort: newest first.
 *
 * Returns only the columns the picker needs. NO Tier-3 child
 * fields.
 */
export interface SelectableSponsorship {
  id: string;
  donor_label: string;
  child_id: string | null;
  child_display_name: string | null;
  child_division_code: string | null;
  child_division_name: string | null;
  payment_mode: string;
  status: string;
  cause_tag: string | null;
  date_created: string | null;
}

const SELECTABLE_FIELDS = [
  "id",
  "donor",
  "payment_mode",
  "status",
  "cause_tag",
  "date_created",
  "child.id",
  "child.display_name",
  "child.bd_division.code",
  "child.bd_division.name",
] as const;

type SelectableRow = {
  id: string;
  donor: string;
  payment_mode: string;
  status: string;
  cause_tag: string | null;
  date_created: string | null;
  child:
    | string
    | {
        id?: string;
        display_name?: string | null;
        bd_division?: {
          code?: string | null;
          name?: string | null;
        } | null;
      }
    | null;
};

export async function listSelectableSponsorships(): Promise<
  SelectableSponsorship[]
> {
  let rows: SelectableRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          status: { _in: ["active", "paused", "pending_payment", "completed"] },
        },
        fields: [...SELECTABLE_FIELDS],
        sort: ["-date_created"],
        limit: 100,
      } as never),
    )) as unknown as SelectableRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-tasks] listSelectableSponsorships failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  // Resolve donor display label by batched users read (a single
  // round trip vs N).
  const donorIds = Array.from(new Set(rows.map((r) => r.donor).filter(Boolean)));
  const donorLabelById = new Map<string, string>();
  if (donorIds.length > 0) {
    try {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: donorIds } },
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
          const name = [u.first_name?.trim(), u.last_name?.trim()]
            .filter(Boolean)
            .join(" ");
          donorLabelById.set(u.id, name.length > 0 ? name : u.email);
        }
      }
    } catch {
      /* non-fatal — donor labels fall back to id */
    }
  }

  return rows.map((r) => {
    const childObj = r.child && typeof r.child === "object" ? r.child : null;
    return {
      id: r.id,
      donor_label: donorLabelById.get(r.donor) ?? r.donor,
      child_id: childObj?.id ?? (typeof r.child === "string" ? r.child : null),
      child_display_name: childObj?.display_name?.trim() ?? null,
      child_division_code: childObj?.bd_division?.code ?? null,
      child_division_name: childObj?.bd_division?.name?.trim() ?? null,
      payment_mode: r.payment_mode,
      status: r.status,
      cause_tag: r.cause_tag,
      date_created: r.date_created,
    };
  });
}

// ─── Public API: admin verify / reject (admin half of the task
//                state machine) ──────────────────────────────────────
//
// The DI owns the `di_status` axis (di-tasks.ts): they move a task
// open → in_progress → completed_pending_verification. When a task
// lands in `completed_pending_verification` it is waiting for an
// admin's decision on the SEPARATE `admin_status` axis:
//
//   VERIFY  → admin_status = 'verified_complete'   (work accepted; done)
//   REJECT  → admin_status = 'rejected_redo'       (sent back to the DI)
//
// After a 'rejected_redo' write the DI's OWN transition logic
// (di-tasks.ts isLegalTransition) permits
// completed_pending_verification → in_progress, so the DI can pick the
// task back up and redo it. We do NOT touch di_status here — that axis
// is the DI's, and modifying it from the admin side would break the
// single-owner invariant the two-axis model depends on.
//
// No reject-reason is captured: the task schema has no free-text
// reason/notes column for verification, and this slice does not add
// one (per the build's "no new columns" guardrail). The decision +
// actor + timestamp live on the row (admin_status / verified_by /
// verified_at) and in the audit_log event the route writes.

export class AdminTaskNotFoundError extends Error {
  readonly code = "task_not_found" as const;
  constructor(message = "Task not found") {
    super(message);
    this.name = "AdminTaskNotFoundError";
  }
}

export class TaskNotVerifiableError extends Error {
  readonly code = "task_not_verifiable" as const;
  constructor(public readonly currentDiStatus: TaskDiStatus) {
    super(
      `Task is not awaiting verification (di_status="${currentDiStatus}"). ` +
        `Only a task the DI has marked "completed_pending_verification" can be ` +
        `verified or sent back.`,
    );
    this.name = "TaskNotVerifiableError";
  }
}

export interface AdminTaskDecisionResult {
  taskId: string;
  adminStatus: Extract<TaskAdminStatus, "verified_complete" | "rejected_redo">;
  childId: string | null;
  sponsorshipId: string | null;
  // fix/task-fulfillment-loop — the DI who owns the task, so the route
  // can notify them of the verify/reject decision. Null on the (rare)
  // unassigned task; the route gates notify on non-null.
  assigneeId: string | null;
}

const TASK_DECISION_FIELDS = [
  "id",
  "di_status",
  "admin_status",
  "child",
  "sponsorship",
  "assignee",
] as const;

type TaskDecisionRow = {
  id: string;
  di_status: string | null;
  admin_status: string | null;
  child: string | { id?: string } | null;
  sponsorship: string | null;
  assignee: string | { id?: string } | null;
};

/**
 * Shared writer for the admin verification axis. Validates the task
 * exists and is in `completed_pending_verification` (the only state a
 * DI hands to the admin for a decision), then writes:
 *   admin_status = newAdminStatus
 *   verified_at  = now()
 *   verified_by  = adminUserId   (M2O directus_users — uuid key)
 *
 * Reads via readItems+filter (NOT readItem) so a genuinely-missing id
 * resolves to [] (→ AdminTaskNotFoundError) rather than throwing,
 * letting a real Directus/transport error bubble as a generic 500.
 *
 * Does NOT touch di_status (the DI's axis). Does NOT write the audit
 * row — the route handler does that AFTER this returns so it can
 * attach the request IP / user-agent.
 *
 * Throws AdminTaskNotFoundError / TaskNotVerifiableError /
 * InvalidTaskInputError; a transport failure on the write throws a
 * generic Error (→ route 500).
 */
async function setTaskAdminStatus(
  taskId: string,
  adminUserId: string,
  newAdminStatus: "verified_complete" | "rejected_redo",
): Promise<AdminTaskDecisionResult> {
  if (!UUID_RE.test(taskId)) {
    throw new AdminTaskNotFoundError("invalid task id");
  }
  if (!UUID_RE.test(adminUserId)) {
    throw new InvalidTaskInputError("adminUserId", "must be a uuid");
  }

  let row: TaskDecisionRow | null = null;
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: { id: { _eq: taskId } },
        fields: [...TASK_DECISION_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as TaskDecisionRow[] | undefined;
    row = Array.isArray(result) ? result[0] ?? null : null;
  } catch (err) {
    console.error(
      "[admin-tasks] setTaskAdminStatus read failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("task read failed");
  }
  if (!row || !row.id) throw new AdminTaskNotFoundError();

  const diStatus = (VALID_DI_STATUSES_SET.has(row.di_status ?? "")
    ? row.di_status
    : "open") as TaskDiStatus;
  if (diStatus !== "completed_pending_verification") {
    throw new TaskNotVerifiableError(diStatus);
  }

  try {
    await directusServer().request(
      updateItem("task" as never, taskId as never, {
        admin_status: newAdminStatus,
        verified_at: new Date().toISOString(),
        verified_by: adminUserId,
      } as never),
    );
  } catch (err) {
    console.error(
      "[admin-tasks] setTaskAdminStatus update failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("task update failed");
  }

  const childObj = row.child && typeof row.child === "object" ? row.child : null;
  const assigneeObj =
    row.assignee && typeof row.assignee === "object" ? row.assignee : null;
  return {
    taskId,
    adminStatus: newAdminStatus,
    childId: childObj?.id ?? (typeof row.child === "string" ? row.child : null),
    sponsorshipId: row.sponsorship,
    assigneeId:
      assigneeObj?.id ??
      (typeof row.assignee === "string" ? row.assignee : null),
  };
}

/**
 * VERIFY a task the DI marked complete. admin_status →
 * 'verified_complete'. Only valid when di_status ===
 * 'completed_pending_verification'.
 */
export function verifyTask(
  taskId: string,
  adminUserId: string,
): Promise<AdminTaskDecisionResult> {
  return setTaskAdminStatus(taskId, adminUserId, "verified_complete");
}

/**
 * REJECT / send a task back to the DI. admin_status → 'rejected_redo'.
 * Only valid when di_status === 'completed_pending_verification'. The
 * DI's own transition logic then lets them move the task back to
 * in_progress to redo it (see di-tasks.ts isLegalTransition).
 */
export function rejectTask(
  taskId: string,
  adminUserId: string,
): Promise<AdminTaskDecisionResult> {
  return setTaskAdminStatus(taskId, adminUserId, "rejected_redo");
}

// ─── Public API: quick-assign (assign an unassigned task to a DI) ────

/**
 * Set a task's assignee to a Data Inputter. Used by the quick-assign
 * control on the admin task list + detail (piece #3 can leave
 * donation auto-tasks unassigned). Validates that `assigneeId` is a
 * REAL ACTIVE DI by checking it against the same source the create
 * form uses (listAssignableDIs) — never trusts an arbitrary user id.
 *
 * Does NOT touch di_status / admin_status. Does NOT write the audit
 * row — the route does that after this returns.
 *
 * Throws InvalidTaskInputError (bad task id / not an active DI) or a
 * generic Error on a transport failure (→ route 500). The route checks
 * task existence (getAdminTaskById) before calling this.
 */
export async function assignTask(
  taskId: string,
  assigneeId: string,
): Promise<{ taskId: string; assigneeId: string }> {
  if (!UUID_RE.test(taskId)) {
    throw new InvalidTaskInputError("taskId", "must be a uuid");
  }
  if (!UUID_RE.test(assigneeId)) {
    throw new InvalidTaskInputError("assigneeId", "must be a uuid");
  }

  // Reuse the create-form DI source. listAssignableDIs(null) returns
  // every active Data Inputter (the role + status=active filter lives
  // there) — membership is our server-side validation that the target
  // is a real, active DI.
  const activeDIs = await listAssignableDIs(null);
  if (!activeDIs.some((d) => d.id === assigneeId)) {
    throw new InvalidTaskInputError(
      "assigneeId",
      "must be an active Data Inputter",
    );
  }

  try {
    await directusServer().request(
      updateItem("task" as never, taskId as never, {
        assignee: assigneeId,
      } as never),
    );
  } catch (err) {
    console.error(
      "[admin-tasks] assignTask update failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("task assignee update failed");
  }

  return { taskId, assigneeId };
}
