// Task system — piece #3 — donation → auto fulfilment task.
//
// When a donation's payment is successfully RECORDED (Stripe webhook,
// fresh payment row), auto-create ONE fulfilment task so the field
// team knows to deliver + confirm with a photo. The task flows into
// the verify/reject machine (piece #1) and carries the
// 'delivery_photos' type (piece #2).
//
// This module owns ONLY the task side effect. It is BEST-EFFORT and
// NEVER throws: a hiccup here must not break the payment flow (a
// donation must always succeed). Every path is wrapped; failures are
// logged and swallowed.
//
// ── Idempotency (the critical correctness property) ──────────────────
// "Exactly one task per payment" is guaranteed by THREE layers:
//   0. Stripe event de-dup — the webhook drops duplicate event
//      DELIVERIES up front via isStripeEventProcessed(event.id).
//   1. Payment-row idempotency — createPaymentIfMissing only inserts a
//      payment row once per (sponsorship, PI/invoice) and returns
//      `created`. The webhook calls us ONLY when created === true, so a
//      replay that finds an existing payment never reaches us.
//   2. Durable task de-dup — we store the PAYMENT ROW id in
//      task.source_payment_id (a UNIQUE column) and check for an
//      existing task with that key before inserting. The UNIQUE
//      constraint is the ultimate guard: even a concurrent double-fire
//      that slips past layers 0/1 cannot insert a second task — the
//      second insert violates UNIQUE and is swallowed.
// The payment ROW id (not the Stripe id) is the dedupe key on purpose:
// a one-time bundle shares ONE PaymentIntent across N sponsorships but
// produces N payment rows — one task per child, each keyed distinctly.
//
// ── Graceful degradation (pieces #1/#2/#3 land on separate branches) ─
// task.source_payment_id (+ nullable assignee) ship in THIS piece's
// migration (migrations/donation-auto-task-1); task.type ships in
// piece #2's. We probe the live `task` columns once (cached) and:
//   - REQUIRE source_payment_id — without it there's no durable dedupe
//     key, so we skip creation entirely (feature inert until the
//     migration runs; payment unaffected). This keeps idempotency
//     unconditional.
//   - include `type` only when the column exists (so a missing type
//     column never blocks creation — per the piece-#3 brief).
//   - leave the task UNASSIGNED only when task.assignee is nullable;
//     otherwise skip (don't violate a NOT NULL constraint).

import "server-only";

import { createItem, readItems, readFieldsByCollection } from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";
import { notify } from "./di-notifications";
import { notifyAdminOfPendingSubmission } from "./di-notify";

export interface FulfillmentTaskInput {
  sponsorshipId: string;
  /** The sponsored child's id, or null for a campaign/general donation. */
  childId: string | null;
  /**
   * The PAYMENT ROW id (createPaymentIfMissing's returned id). This is
   * the durable per-payment dedupe key stored in task.source_payment_id.
   */
  paymentId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Cached column-support probe ──────────────────────────────────────
// One GET of the `task` field metadata per process. Server processes
// restart on deploy (when the migration runs), so a cached "absent"
// result self-heals on the next deploy. Mirrors the getDIRoleId cache
// pattern in admin-tasks.ts.

interface TaskColumnSupport {
  hasSourcePaymentId: boolean;
  hasType: boolean;
  assigneeNullable: boolean;
}

let TASK_COLUMN_SUPPORT: TaskColumnSupport | null = null;

async function getTaskColumnSupport(): Promise<TaskColumnSupport> {
  if (TASK_COLUMN_SUPPORT) return TASK_COLUMN_SUPPORT;
  try {
    const fields = (await directusServer().request(
      readFieldsByCollection("task" as never),
    )) as unknown as Array<{
      field: string;
      schema?: { is_nullable?: boolean } | null;
    }>;
    const byName = new Map(fields.map((f) => [f.field, f]));
    TASK_COLUMN_SUPPORT = {
      hasSourcePaymentId: byName.has("source_payment_id"),
      hasType: byName.has("type"),
      // M2O assignee: is_nullable true only after the piece-#3
      // migration relaxes it. Default false (legacy NOT NULL).
      assigneeNullable: byName.get("assignee")?.schema?.is_nullable === true,
    };
  } catch (err) {
    console.warn(
      "[donation-task] task field probe failed — assuming legacy schema (no auto-task)",
      err instanceof Error ? err.message : err,
    );
    TASK_COLUMN_SUPPORT = {
      hasSourcePaymentId: false,
      hasType: false,
      assigneeNullable: false,
    };
  }
  return TASK_COLUMN_SUPPORT;
}

/** Test-only: reset the cached probe (not used in production paths). */
export function __resetTaskColumnSupportCache(): void {
  TASK_COLUMN_SUPPORT = null;
}

// ── Assignment: the DI responsible for the child ─────────────────────
// child.assigned_di is the per-child responsible Data Inputter, set by
// admins (see di-notifications.ts). It's the cleanest "DI responsible
// for that child" link. When it's unset (or there's no child), we
// return null → the task is left UNASSIGNED for an admin to pick up.
// We deliberately do NOT fall back to an arbitrary division-covering
// DI: the brief says never assign to a random/default DI.

async function resolveResponsibleDi(childId: string): Promise<string | null> {
  if (!UUID_RE.test(childId)) return null;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["assigned_di"],
        limit: 1,
      } as never),
    )) as unknown as Array<{
      assigned_di: string | { id?: string } | null;
    }>;
    const di = rows?.[0]?.assigned_di ?? null;
    const id = typeof di === "string" ? di : di?.id ?? null;
    return id && UUID_RE.test(id) ? id : null;
  } catch (err) {
    console.warn(
      "[donation-task] resolveResponsibleDi failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// Tier-1 first name ONLY for the task title. NEVER the surname /
// display_name (internal record name) / any Tier-3 field.
async function fetchChildFirstName(childId: string): Promise<string | null> {
  if (!UUID_RE.test(childId)) return null;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["first_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ first_name: string | null }>;
    const name = rows?.[0]?.first_name?.trim();
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Best-effort: create the fulfilment task for a freshly recorded
 * payment. NEVER throws — the caller (Stripe webhook) must not be
 * affected by any failure here.
 *
 * Call ONLY after a payment was recorded with created === true.
 */
export async function createFulfillmentTaskForPayment(
  input: FulfillmentTaskInput,
): Promise<void> {
  try {
    if (!input.paymentId || !UUID_RE.test(input.paymentId)) {
      console.warn(
        "[donation-task] missing/invalid paymentId — skipping auto-task",
      );
      return;
    }

    // created_by is NOT NULL; the system user is the only valid actor
    // here (same user that attributes webhook audit rows). Without it
    // we can neither set created_by nor write the audit row.
    const systemUserId = process.env.SYSTEM_USER_ID;
    if (!systemUserId) {
      console.warn(
        "[donation-task] SYSTEM_USER_ID not set — skipping auto-task " +
          "(run migrations/phase-0/002-seed-system-user.mjs + set the env).",
      );
      return;
    }

    const support = await getTaskColumnSupport();

    // Idempotency is mandatory: no durable dedupe key column → no task.
    if (!support.hasSourcePaymentId) {
      console.warn(
        "[donation-task] task.source_payment_id column missing — auto-task " +
          "inert until migrations/donation-auto-task-1 runs (payment unaffected).",
      );
      return;
    }

    // Layer 2 de-dup: a task already exists for this payment row.
    try {
      const existing = (await directusServer().request(
        readItems("task" as never, {
          filter: { source_payment_id: { _eq: input.paymentId } },
          fields: ["id"],
          limit: 1,
        } as never),
      )) as unknown as Array<{ id: string }>;
      if (Array.isArray(existing) && existing.length > 0) {
        // Already created (replay / concurrent sibling already won).
        return;
      }
    } catch (err) {
      // A read failure is non-fatal — the UNIQUE constraint on
      // source_payment_id is still the backstop on insert.
      console.warn(
        "[donation-task] dedupe read failed; relying on UNIQUE constraint",
        err instanceof Error ? err.message : err,
      );
    }

    // Resolve the responsible DI (or null = unassigned).
    const assignee = input.childId
      ? await resolveResponsibleDi(input.childId)
      : null;

    // Respect the NOT NULL constraint when the nullable-assignee
    // migration hasn't run: we can't create an unassigned task yet.
    if (assignee === null && !support.assigneeNullable) {
      console.warn(
        `[donation-task] no responsible DI for sponsorship ${input.sponsorshipId} ` +
          "and task.assignee is NOT NULL (nullable-assignee migration pending) — " +
          "skipping auto-task; an admin can create one manually.",
      );
      return;
    }

    const firstName = input.childId
      ? await fetchChildFirstName(input.childId)
      : null;
    const title = firstName
      ? `Deliver to ${firstName} and confirm with a photo`
      : "Deliver this donation and confirm with a photo";
    const description =
      "Auto-created when the donation was paid. Complete the delivery, " +
      "then upload a photo to confirm — admin will verify it.";

    const payload: Record<string, unknown> = {
      title,
      description,
      child: input.childId,
      sponsorship: input.sponsorshipId,
      assignee, // may be null once the nullable-assignee migration ran
      created_by: systemUserId,
      date_created: new Date().toISOString(),
      priority: "normal",
      source_payment_id: input.paymentId,
    };
    // Include the piece-#2 type only when the column exists, so a
    // missing `type` column never blocks creation.
    if (support.hasType) payload.type = "delivery_photos";

    let created: { id?: string } | null = null;
    try {
      created = (await directusServer().request(
        createItem("task" as never, payload as never),
      )) as unknown as { id?: string } | null;
    } catch (err) {
      // Most likely a UNIQUE violation from a concurrent sibling that
      // inserted the same source_payment_id first — exactly the race
      // the constraint exists to catch. Swallow: no duplicate, payment
      // unaffected.
      console.warn(
        `[donation-task] task insert failed for payment ${input.paymentId} ` +
          "(likely duplicate race or pending migration) — no task created",
        err instanceof Error ? err.message : err,
      );
      return;
    }
    const taskId = created?.id ?? null;
    if (!taskId) return;

    // Audit (best-effort; recordAuditEvent never throws). IDs + enums
    // only — no child name or any Tier-3 field.
    await recordAuditEvent({
      actorUserId: systemUserId,
      actorRole: "system",
      action: "system_created_task",
      collection: "task",
      recordId: taskId,
      metadata: {
        sponsorshipId: input.sponsorshipId,
        childId: input.childId,
        paymentId: input.paymentId,
        type: "delivery_photos",
        assigned: assignee !== null,
      },
    });

    // ── Tell the responsible role (fix/task-fulfillment-loop) ──────────
    // The audit above is actor_role='system', which is filtered out of
    // the DI activity feed — so audit alone never notifies anyone. Wire
    // the actual notification here. Both paths are best-effort: notify()
    // + notifyAdminOfPendingSubmission() swallow their own errors and
    // never throw, and this whole block is inside the outer try/catch —
    // a notification hiccup can never affect the payment or the task.
    if (assignee !== null) {
      // FIX B — a DI is responsible: in-app notify them a paid task
      // landed in their queue. admin_assigned_task already renders in
      // the DI bell + notifications list (TYPE_ICON exhaustive maps).
      await notify({
        recipientUserId: assignee,
        type: "admin_assigned_task",
        title: "New delivery task",
        body: firstName
          ? `A sponsored donation for ${firstName} is ready to deliver. Complete the delivery, then upload a photo to confirm.`
          : "A sponsored donation is ready to deliver. Complete the delivery, then upload a photo to confirm.",
        relatedCollection: "task",
        relatedId: taskId,
      });
    } else {
      // FIX D — nobody is responsible (no child.assigned_di). The task
      // would otherwise sit unassigned and unseen. Alert the admins by
      // email (reusing the existing ADMIN_NOTIFY_EMAILS path) so someone
      // assigns it. Collection 'task' + a "needs assigning" summary.
      await notifyAdminOfPendingSubmission({
        collection: "task",
        recordId: taskId,
        submittedByUserId: systemUserId,
        childId: input.childId ?? undefined,
        summary:
          "A paid sponsorship created a delivery task, but no Data Inputter " +
          "is responsible for this child — please assign it.",
      });
    }
  } catch (err) {
    // Final catch-all — the payment flow must never be affected.
    console.error(
      "[donation-task] best-effort auto-task creation failed (payment unaffected)",
      err instanceof Error ? err.message : err,
    );
  }
}
