// Session 42 — DI Dashboard home / overview screen.
//
// Server component. Pulls the DI session (already validated by
// (authed)/layout.tsx) and four count aggregates from Directus
// using the existing `directusServer()` admin client.
//
// Counts queried (per spec v3 §6.2):
//   1. Children I manage          — child rows where uploaded_by_di =
//                                   self OR assigned_di = self,
//                                   excluding withdrawn.
//   2. Open tasks                  — task rows where assignee = self
//                                   AND di_status != completed_pending_verification
//   3. My pending submissions      — child_proposal rows where
//                                   created_by = self AND status = pending
//   4. Reports this month          — child_update rows where
//                                   created_by = self AND date_created
//                                   ≥ first day of this month
//
// Each count is best-effort: if the query throws (e.g. a fresh
// Directus instance hasn't picked up the v3 collections yet), we
// render `—` and continue. The dashboard remains usable even when
// individual counts fail.

import {
  Home as HomeIcon,
  Users,
  ListTodo,
  Inbox,
  FileBarChart,
  Plus,
  Camera,
  FileText,
  Truck,
} from "lucide-react";
import { aggregate } from "@directus/sdk";
import { directusServer } from "@/lib/directus";
import { requireDiUser } from "@/lib/di-auth";
import { StatTile } from "@/components/di/StatTile";
import { QuickAction } from "@/components/di/QuickAction";

export const dynamic = "force-dynamic";

async function safeCount(
  collection: string,
  filter: Record<string, unknown>,
): Promise<number | null> {
  try {
    const result = (await directusServer().request(
      aggregate(collection as never, {
        aggregate: { count: "*" },
        filter,
      } as never),
    )) as unknown as Array<{ count: number | string | null }> | undefined;
    const row = Array.isArray(result) ? result[0] : null;
    if (!row || row.count === null || row.count === undefined) return 0;
    const n = typeof row.count === "string" ? Number(row.count) : row.count;
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.warn(
      `[di/home] count failed for ${collection}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

function formatCount(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

function startOfThisMonthIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return start.toISOString();
}

export default async function DiHomePage() {
  const session = await requireDiUser();
  const userId = session.userId;
  const greeting =
    session.firstName && session.firstName.trim().length > 0
      ? `Salaam, ${session.firstName.trim()}.`
      : "Salaam.";

  // Run all four count queries in parallel.
  const [childCount, taskCount, pendingProposalCount, reportsThisMonthCount] =
    await Promise.all([
      safeCount("child", {
        _and: [
          {
            _or: [
              { uploaded_by_di: { _eq: userId } },
              { assigned_di: { _eq: userId } },
            ],
          },
          { status: { _neq: "withdrawn" } },
        ],
      }),
      safeCount("task", {
        _and: [
          { assignee: { _eq: userId } },
          { di_status: { _neq: "completed_pending_verification" } },
        ],
      }),
      safeCount("child_proposal", {
        _and: [
          { created_by: { _eq: userId } },
          { status: { _eq: "pending" } },
        ],
      }),
      safeCount("child_update", {
        _and: [
          { created_by: { _eq: userId } },
          { date_created: { _gte: startOfThisMonthIso() } },
        ],
      }),
    ]);

  // The "subhead" line under the greeting — only renders the divisions
  // bit when assigned_divisions has values. Keeps the screen calm for a
  // brand-new DI with nothing assigned yet.
  const childCountForSubhead = childCount ?? 0;
  const childWord = childCountForSubhead === 1 ? "child" : "children";
  const divisionsLine =
    session.assignedDivisions && session.assignedDivisions.length > 0
      ? `Assigned divisions: ${session.assignedDivisions.join(", ")}.`
      : null;

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-[1100px] mx-auto">
      {/* Greeting block */}
      <header className="mb-8 md:mb-10">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          {greeting}
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          You manage{" "}
          <span className="text-ink font-medium">
            {formatCount(childCount)}
          </span>{" "}
          {childWord}.{" "}
          {divisionsLine ? (
            <span>{divisionsLine}</span>
          ) : (
            <span className="text-slate-soft">
              No divisions assigned yet — admin will set this on your profile.
            </span>
          )}
        </p>
      </header>

      {/* Stat tiles — 2x2 mobile, 4-across desktop */}
      <section className="mb-10">
        <h2 className="sr-only">At a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Children I manage"
            value={formatCount(childCount)}
            href="/di/children"
            icon={Users}
          />
          <StatTile
            label="Open tasks"
            value={formatCount(taskCount)}
            href="/di/tasks"
            icon={ListTodo}
          />
          <StatTile
            label="Pending submissions"
            value={formatCount(pendingProposalCount)}
            href="/di/submissions"
            icon={Inbox}
          />
          <StatTile
            label="Reports this month"
            value={formatCount(reportsThisMonthCount)}
            href="/di/reports"
            icon={FileBarChart}
            hint="updates submitted"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-10">
        <h2 className="font-display text-[20px] md:text-[22px] text-ink mb-4">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <QuickAction
            label="Add new child"
            href="/di/children/new"
            icon={Plus}
          />
          <QuickAction
            label="Upload moment"
            href="/di/moments/new"
            icon={Camera}
          />
          <QuickAction
            label="Submit report"
            href="/di/reports/new"
            icon={FileText}
          />
          <QuickAction
            label="Mark delivery"
            href="/di/deliveries/new"
            icon={Truck}
          />
        </div>
      </section>

      {/* Placeholders — Session 46 wires real data */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-ink/[0.06] bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListTodo
              className="w-4 h-4 text-tangerine-deeper stroke-[1.75]"
              aria-hidden="true"
            />
            <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
              Urgent tasks
            </h3>
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            Coming soon. Session 46 will surface tasks marked priority
            high or urgent here.
          </p>
        </div>
        <div className="rounded-2xl border border-ink/[0.06] bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <HomeIcon
              className="w-4 h-4 text-tangerine-deeper stroke-[1.75]"
              aria-hidden="true"
            />
            <h3 className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft font-medium">
              Recent activity
            </h3>
          </div>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            Coming soon. Session 46 will show the last few submissions
            and admin reviews here.
          </p>
        </div>
      </section>
    </div>
  );
}
