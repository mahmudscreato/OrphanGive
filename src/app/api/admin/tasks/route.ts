// Spine 1.1 — POST /api/admin/tasks
//
// Creates a field task linked to a sponsorship (Phase 0
// task.sponsorship FK) and assigned to a Data Inputter. Backs the
// "Create field task" modal on /admin/sponsorships/[id] and the
// standalone /admin/tasks new-task form.
//
// Body:
//   {
//     sponsorshipId:    string (uuid, required)
//     childId:          string | null (required; null = campaign donation)
//     assigneeUserId:   string | null   (uuid OR null + autoAssign:true)
//     autoAssign:       boolean         (default false)
//     title:            string (1-200 chars, required)
//     description?:     string | null   (max 2000 chars)
//     dueDate?:         string | null   (YYYY-MM-DD)
//     priority?:        'low' | 'normal' | 'high' | 'urgent'
//   }
//
// Auth: requireAdminUser. No super-admin restriction — task
// creation is core admin scope per the spine design (Phase 0 RBAC
// reserved super-admin for org-level settings).
//
// Audit: admin_created_task via recordAuditEvent. Metadata is
// IDs-only — no Tier-3 child fields.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  autoAssignDI,
  createTask,
  InvalidTaskInputError,
  NoDIForDivisionError,
} from "@/lib/admin-tasks";
import { recordAuditEvent } from "@/lib/di-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sponsorshipId: z.string().uuid(),
    childId: z.string().uuid().nullable(),
    assigneeUserId: z.string().uuid().nullable(),
    autoAssign: z.boolean().default(false),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  })
  .strict()
  .refine(
    (b) => (b.autoAssign ? true : b.assigneeUserId !== null),
    {
      message:
        "Either assigneeUserId must be set OR autoAssign must be true",
      path: ["assigneeUserId"],
    },
  );

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "bad_request",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // ── Resolve assignee (auto vs manual) ──────────────────────────
  let assigneeUserId = body.assigneeUserId;
  let assignedVia: "manual" | "auto" = "manual";

  if (body.autoAssign) {
    // Need the child's division code for auto-assign. Fetch from
    // the sponsorship → child relation via the createTask child
    // lookup, but we need it BEFORE create. Inline-fetch here so
    // the API surfaces a clean 422 if no DI covers the division.
    let childDivisionCode: string | null = null;
    if (body.childId) {
      try {
        const { directusServer } = await import("@/lib/directus");
        const { readItem } = await import("@directus/sdk");
        const child = (await directusServer().request(
          readItem("child" as never, body.childId as never, {
            fields: ["bd_division.code"],
          } as never),
        )) as unknown as {
          bd_division?: { code?: string | null } | null;
        } | null;
        childDivisionCode = child?.bd_division?.code ?? null;
      } catch {
        /* fall through — auto-assign with null division will throw */
      }
    }
    try {
      const di = await autoAssignDI(childDivisionCode);
      assigneeUserId = di.id;
      assignedVia = "auto";
    } catch (err) {
      if (err instanceof NoDIForDivisionError) {
        return NextResponse.json(
          {
            error: "no_di_for_division",
            divisionCode: err.divisionCode,
            message:
              body.childId === null
                ? "Auto-assign isn't available for campaign tasks (no child / no division). Pick a Data Inputter manually."
                : `No Data Inputter covers division "${err.divisionCode}". Pick one manually.`,
          },
          { status: 422 },
        );
      }
      throw err;
    }
  }

  if (!assigneeUserId) {
    // Defensive — the zod refine should have caught this.
    return NextResponse.json(
      { error: "bad_request", message: "assigneeUserId is required" },
      { status: 400 },
    );
  }

  // ── Create the task ─────────────────────────────────────────────
  let result;
  try {
    result = await createTask({
      adminUserId: admin.userId,
      sponsorshipId: body.sponsorshipId,
      childId: body.childId,
      assigneeUserId,
      title: body.title,
      description: body.description ?? null,
      dueDate: body.dueDate ?? null,
      priority: body.priority,
    });
  } catch (err) {
    if (err instanceof InvalidTaskInputError) {
      return NextResponse.json(
        {
          error: "invalid_input",
          field: err.field,
          message: err.message,
        },
        { status: 400 },
      );
    }
    console.error(
      "[/api/admin/tasks POST] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // ── Audit (best-effort; recordAuditEvent never throws) ─────────
  // Metadata is IDs only — no Tier-3 child fields, no donor PII.
  await recordAuditEvent({
    actorUserId: admin.userId,
    actorRole: "admin",
    action: "admin_created_task",
    collection: "task",
    recordId: result.taskId,
    metadata: {
      sponsorshipId: body.sponsorshipId,
      childId: body.childId,
      assigneeUserId,
      assignedVia,
      childDivisionCode: result.childDivisionCode,
      priority: body.priority ?? "normal",
      hasDueDate: body.dueDate !== null && body.dueDate !== undefined,
    },
    request: req,
  });

  return NextResponse.json({
    taskId: result.taskId,
    assigneeUserId,
    assignedVia,
  });
}
