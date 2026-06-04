// Session 46 — DI tasks data layer.
//
// Tasks are admin-assigned work items routed to a specific DI. The
// DI's surface is read + transition-only:
//   - List the DI's own tasks (filtered by assignee)
//   - Move a task through di_status: open → in_progress →
//     completed_pending_verification
//   - Re-do a task admin rejected (admin_status='rejected_redo')
//
// Admin owns: creation, priority, due date, verification (admin_status).
// DI cannot create tasks (until Admin Dashboard ships, that lives in
// Directus admin only).
//
// Schema reality (Session 46 discovery):
//   task columns:
//     id            uuid PK
//     title         text   NOT NULL
//     description   text   NULLABLE
//     child         uuid M2O child   NULLABLE  (general tasks have null)
//     assignee      uuid M2O directus_users  NOT NULL
//     created_by    uuid M2O directus_users  NOT NULL  (m2o special only,
//                                                       no user-created
//                                                       auto-fill — explicit
//                                                       value honoured if
//                                                       admin sets one)
//     date_created  timestamp  NULLABLE  no auto-default
//     due_date      date       NULLABLE
//     priority      text       default 'normal'
//     di_status     text       default 'open'
//     admin_status  text       default 'open'
//     completed_at  timestamp  NULLABLE
//     verified_at   timestamp  NULLABLE
//     verified_by   uuid M2O directus_users  NULLABLE
//
// Privacy:
//   - listTasksForUser scopes by assignee = userId
//   - getTaskForUser scopes by id AND assignee
//   - transitionTaskDiStatus rechecks ownership before updating

import "server-only";

import { readItems, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

export type TaskDiStatus =
  | "open"
  | "in_progress"
  | "completed_pending_verification";

export type TaskAdminStatus = "open" | "verified_complete" | "rejected_redo";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

// Task system piece #2 — the structured task category. Backed by the
// nullable `task.type` column (default 'general'; see
// migrations/task-types-1). The quick-create templates in
// src/lib/task-templates.ts map each type to default pre-fill copy.
// 'general' is the neutral/legacy bucket (existing typeless tasks
// coerce to it); 'custom' is an explicit blank-but-typed task.
export type TaskType =
  | "need_report"
  | "delivery_photos"
  | "need_moments"
  | "health_check"
  | "general"
  | "custom";

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  childId: string | null;
  childDisplayName: string | null;
  diStatus: TaskDiStatus;
  adminStatus: TaskAdminStatus;
  createdAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  isOverdue: boolean;
  // Spine 1.2 — surface the sponsorship FK (Phase 0) on the DI's
  // task summary so the report-creation form can pick a task and
  // know which sponsorship to pre-bind. Null when the task is
  // general (no sponsorship tie).
  sponsorshipId: string | null;
}

export type TaskDetail = TaskSummary;

// ─── Typed errors ───────────────────────────────────────────────────

export class TaskNotFoundError extends Error {
  readonly code = "task_not_found" as const;
  constructor(message = "Task not found or not owned by this user") {
    super(message);
    this.name = "TaskNotFoundError";
  }
}

export class InvalidTaskTransitionError extends Error {
  readonly code = "invalid_task_transition" as const;
  constructor(
    public readonly from: TaskDiStatus,
    public readonly to: TaskDiStatus,
    public readonly adminStatus: TaskAdminStatus,
  ) {
    super(
      `Cannot transition di_status from "${from}" to "${to}" with admin_status="${adminStatus}"`,
    );
    this.name = "InvalidTaskTransitionError";
  }
}

// ─── Static option lists (also useful for the page filter pills) ────

export const TASK_DI_STATUS_OPTIONS: ReadonlyArray<{
  value: TaskDiStatus;
  label: string;
}> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  {
    value: "completed_pending_verification",
    label: "Awaiting verification",
  },
];

export const TASK_PRIORITY_OPTIONS: ReadonlyArray<{
  value: TaskPriority;
  label: string;
}> = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const VALID_DI_STATUSES = new Set<string>(
  TASK_DI_STATUS_OPTIONS.map((o) => o.value),
);
const VALID_ADMIN_STATUSES = new Set<string>([
  "open",
  "verified_complete",
  "rejected_redo",
]);
const VALID_PRIORITIES = new Set<string>(
  TASK_PRIORITY_OPTIONS.map((o) => o.value),
);

// ─── Internal row shape ─────────────────────────────────────────────

type TaskRow = {
  id: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  child: { id?: string; display_name?: string | null } | string | null;
  di_status: string | null;
  admin_status: string | null;
  date_created: string | null;
  completed_at: string | null;
  verified_at: string | null;
  // Spine 1.2 — Phase 0 sponsorship FK. String uuid when not expanded.
  sponsorship: string | null;
};

const TASK_FIELDS = [
  "id",
  "title",
  "description",
  "priority",
  "due_date",
  "child.id",
  "child.display_name",
  "di_status",
  "admin_status",
  "date_created",
  "completed_at",
  "verified_at",
  // Spine 1.2 — Phase 0 sponsorship FK.
  "sponsorship",
] as const;

function asPriority(s: string | null): TaskPriority {
  return VALID_PRIORITIES.has(s ?? "") ? (s as TaskPriority) : "normal";
}
function asDiStatus(s: string | null): TaskDiStatus {
  return VALID_DI_STATUSES.has(s ?? "") ? (s as TaskDiStatus) : "open";
}
function asAdminStatus(s: string | null): TaskAdminStatus {
  return VALID_ADMIN_STATUSES.has(s ?? "") ? (s as TaskAdminStatus) : "open";
}

function isOverdueByDate(due: string | null): boolean {
  if (!due) return false;
  const d = new Date(`${due}T23:59:59Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function rowToSummary(row: TaskRow): TaskSummary {
  // child can come back as a UUID string (when not expanded) or an
  // object (when expanded). We always request the expanded form;
  // handle both for safety.
  const childObj =
    row.child && typeof row.child === "object" ? row.child : null;
  const childId =
    typeof row.child === "string" ? row.child : (childObj?.id ?? null);
  return {
    id: row.id,
    title: row.title?.trim() || "(untitled)",
    description: row.description?.trim() ?? null,
    priority: asPriority(row.priority),
    dueDate: row.due_date,
    childId,
    childDisplayName: childObj?.display_name?.trim() ?? null,
    diStatus: asDiStatus(row.di_status),
    adminStatus: asAdminStatus(row.admin_status),
    createdAt: row.date_created,
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
    // Spine 1.2 — Phase 0 sponsorship FK (nullable).
    sponsorshipId: row.sponsorship,
    isOverdue:
      asDiStatus(row.di_status) !== "completed_pending_verification" &&
      isOverdueByDate(row.due_date),
  };
}

// Sort: rejected-redo first (DI must redo work), then urgent priority,
// then overdue, then by due_date asc, then by created_at desc.
const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function compareTasks(a: TaskSummary, b: TaskSummary): number {
  // Rejected-redo bubbles to top regardless of priority.
  const aRedo = a.adminStatus === "rejected_redo" ? 0 : 1;
  const bRedo = b.adminStatus === "rejected_redo" ? 0 : 1;
  if (aRedo !== bRedo) return aRedo - bRedo;

  // Open/in_progress before completed_pending_verification.
  const aDone = a.diStatus === "completed_pending_verification" ? 1 : 0;
  const bDone = b.diStatus === "completed_pending_verification" ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;

  // Overdue ahead of on-time.
  const aOver = a.isOverdue ? 0 : 1;
  const bOver = b.isOverdue ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;

  // Priority.
  const dr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (dr !== 0) return dr;

  // Due date asc (earlier first).
  if (a.dueDate && b.dueDate) {
    if (a.dueDate < b.dueDate) return -1;
    if (a.dueDate > b.dueDate) return 1;
  } else if (a.dueDate) return -1;
  else if (b.dueDate) return 1;

  // Created_at desc (newer first).
  if (a.createdAt && b.createdAt) {
    if (a.createdAt > b.createdAt) return -1;
    if (a.createdAt < b.createdAt) return 1;
  }
  return 0;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * List tasks assigned to this DI. Optional status / priority filters.
 * Sort happens in JS so the multi-axis ordering above works
 * regardless of Directus's per-collection sort capabilities.
 */
export async function listTasksForUser(
  userId: string,
  opts?: { diStatus?: TaskDiStatus | "all"; priority?: TaskPriority },
): Promise<TaskSummary[]> {
  const filters: Record<string, unknown>[] = [
    { assignee: { _eq: userId } },
  ];
  if (opts?.diStatus && opts.diStatus !== "all") {
    filters.push({ di_status: { _eq: opts.diStatus } });
  }
  if (opts?.priority) {
    filters.push({ priority: { _eq: opts.priority } });
  }

  let rows: TaskRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: { _and: filters },
        fields: [...TASK_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as TaskRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-tasks] listTasksForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows.map(rowToSummary).sort(compareTasks);
}

/**
 * Session 47 — preview list for the home page UrgentTasksPanel.
 * Filter: assignee = self, di_status IN (open, in_progress),
 * priority IN (high, urgent). Sort: due_date ASC NULLS LAST,
 * date_created DESC. Returns at most `limit` rows (default 5).
 */
export async function getUrgentTasksForUser(
  userId: string,
  limit: number = 5,
): Promise<TaskSummary[]> {
  let rows: TaskRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: {
          _and: [
            { assignee: { _eq: userId } },
            { di_status: { _in: ["open", "in_progress"] } },
            { priority: { _in: ["high", "urgent"] } },
          ],
        },
        fields: [...TASK_FIELDS],
        // Pull a generous slice; we apply the multi-axis JS sort
        // below and slice to `limit` afterwards.
        limit: 50,
      } as never),
    )) as unknown as TaskRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-tasks] getUrgentTasksForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.map(rowToSummary).sort(compareTasks).slice(0, limit);
}

/**
 * Single task with scope guard. Returns null if not owned (collapses
 * with not-exists for privacy).
 */
export async function getTaskForUser(
  taskId: string,
  userId: string,
): Promise<TaskDetail | null> {
  if (!taskId) return null;
  let row: TaskRow | undefined;
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: {
          _and: [
            { id: { _eq: taskId } },
            { assignee: { _eq: userId } },
          ],
        },
        fields: [...TASK_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as TaskRow[] | undefined;
    row = Array.isArray(result) ? result[0] : undefined;
  } catch (err) {
    console.warn(
      "[di-tasks] getTaskForUser failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;
  return rowToSummary(row);
}

/**
 * Best-effort read of a task's `type` for display on the detail page.
 * Isolated from getTaskForUser's field set so the DI task LIST never
 * depends on the piece-#2 `type` column existing — if the column is
 * absent (migration pending) this returns null and the badge is hidden.
 * The caller must have already scope-checked the task (getTaskForUser).
 */
export async function getTaskTypeById(
  taskId: string,
): Promise<TaskType | null> {
  const VALID = new Set<string>([
    "need_report",
    "delivery_photos",
    "need_moments",
    "health_check",
    "general",
    "custom",
  ]);
  try {
    const result = (await directusServer().request(
      readItems("task" as never, {
        filter: { id: { _eq: taskId } },
        fields: ["type"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ type: string | null }> | undefined;
    const t = Array.isArray(result) ? result[0]?.type ?? null : null;
    return t && VALID.has(t) ? (t as TaskType) : null;
  } catch {
    return null;
  }
}

// ─── Transition logic ──────────────────────────────────────────────

// Legal di_status moves:
//   open                                → in_progress      (admin_status: any)
//   in_progress                         → completed_pending_verification
//                                                            (admin_status: any)
//   completed_pending_verification      → in_progress       ONLY when
//                                                            admin_status='rejected_redo'
//                                                            (DI redoing rejected work)
function isLegalTransition(
  from: TaskDiStatus,
  to: TaskDiStatus,
  adminStatus: TaskAdminStatus,
): boolean {
  if (from === "open" && to === "in_progress") return true;
  if (from === "in_progress" && to === "completed_pending_verification")
    return true;
  if (
    from === "completed_pending_verification" &&
    to === "in_progress" &&
    adminStatus === "rejected_redo"
  ) {
    return true;
  }
  // Special-case: a task that's been rejected_redo and the DI hasn't
  // moved yet may be at di_status 'open' (admin set rejected_redo but
  // didn't change di_status). Allow open → in_progress in that case
  // too — already handled by the first rule.
  return false;
}

/**
 * Transition the DI's task to a new di_status. Validates ownership
 * and legality of the move. Sets `completed_at = now()` when entering
 * `completed_pending_verification`. Clears `completed_at` when going
 * back to `in_progress` (rework).
 *
 * Throws TaskNotFoundError on not-owned/not-found.
 * Throws InvalidTaskTransitionError on illegal move.
 */
export async function transitionTaskDiStatus(
  taskId: string,
  userId: string,
  newStatus: TaskDiStatus,
): Promise<{
  taskId: string;
  di_status: TaskDiStatus;
  // Returned so the route handler's audit row can include it in
  // metadata when present — that puts child-specific task
  // transitions onto the per-child History feed.
  childId: string | null;
}> {
  const current = await getTaskForUser(taskId, userId);
  if (!current) throw new TaskNotFoundError();

  if (!isLegalTransition(current.diStatus, newStatus, current.adminStatus)) {
    throw new InvalidTaskTransitionError(
      current.diStatus,
      newStatus,
      current.adminStatus,
    );
  }

  const patch: Record<string, unknown> = { di_status: newStatus };
  if (newStatus === "completed_pending_verification") {
    patch.completed_at = new Date().toISOString();
  } else if (newStatus === "in_progress") {
    // Re-doing a rejected task: clear the prior completed timestamp
    // so the verification clock starts fresh on next mark-complete.
    patch.completed_at = null;
  }

  try {
    await directusServer().request(
      updateItem("task" as never, taskId as never, patch as never),
    );
  } catch (err) {
    console.warn(
      "[di-tasks] transitionTaskDiStatus update failed",
      err instanceof Error ? err.message : err,
    );
    // Re-throw as a generic Error — the route will 500.
    throw new Error("task update failed");
  }

  return { taskId, di_status: newStatus, childId: current.childId };
}
