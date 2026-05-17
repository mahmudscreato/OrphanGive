// Session 46 — DI tasks list endpoint.
//
// GET /api/di/tasks?status=&priority=
//
// Returns the DI's own tasks (filter assignee = self.userId), sorted
// per the multi-axis rule in di-tasks.ts (rejected-redo first, then
// urgent, then overdue, then by due date).

import { NextResponse, type NextRequest } from "next/server";
import { getDirectusSession } from "@/lib/di-auth";
import {
  listTasksForUser,
  type TaskDiStatus,
  type TaskPriority,
} from "@/lib/di-tasks";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlyArray<TaskDiStatus | "all"> = [
  "all",
  "open",
  "in_progress",
  "completed_pending_verification",
];

const VALID_PRIORITIES: ReadonlyArray<TaskPriority> = [
  "low",
  "normal",
  "high",
  "urgent",
];

function parseStatus(s: string | null): TaskDiStatus | "all" | undefined {
  if (!s) return undefined;
  return (VALID_STATUSES as readonly string[]).includes(s)
    ? (s as TaskDiStatus | "all")
    : undefined;
}

function parsePriority(s: string | null): TaskPriority | undefined {
  if (!s) return undefined;
  return (VALID_PRIORITIES as readonly string[]).includes(s)
    ? (s as TaskPriority)
    : undefined;
}

export async function GET(req: NextRequest) {
  const session = await getDirectusSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = parseStatus(req.nextUrl.searchParams.get("status"));
  const priority = parsePriority(req.nextUrl.searchParams.get("priority"));
  try {
    const tasks = await listTasksForUser(session.userId, {
      diStatus: status,
      priority,
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error(
      "[/api/di/tasks GET] server_error",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
