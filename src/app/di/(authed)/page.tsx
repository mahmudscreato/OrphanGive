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

  // The "subhead" lines under the greeting — Session 42-FIX3 splits
  // this into two visual elements:
  //   Line 1 (lead): "You manage N children." — same lead-text styling
  //   Line 2 (note): either the divisions list (normal weight) OR the
  //                  "no divisions assigned" admin note (italic, soft)
  // Keeps the screen calm for a brand-new DI with nothing assigned yet
  // while making it obvious that the divisions line is system-info,
  // not greeting copy.
  const childCountForSubhead = childCount ?? 0;
  const childWord = childCountForSubhead === 1 ? "child" : "children";
  const hasDivisions =
    session.assignedDivisions && session.assignedDivisions.length > 0;

  return (
    // Session 42-FIX3 — content area constrained to max-w-5xl (1024px)
    // for a focused reading width on wide desktops. The cream gutter on
    // the right is intentional; full-bleed content reads as utilitarian
    // rather than crafted.
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
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
          {childWord}.
        </p>
        {hasDivisions ? (
          <p className="mt-1 text-[13px] md:text-[14px] text-ink-soft leading-relaxed">
            Assigned divisions:{" "}
            <span className="text-ink">
              {session.assignedDivisions!.join(", ")}
            </span>
            .
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] md:text-[13px] italic text-slate-soft leading-relaxed">
            No divisions assigned yet — admin will set this on your profile.
          </p>
        )}
      </header>

      {/* Stat tiles — 2x2 mobile, 4-across desktop. Bottom margin
          increased to ~64px (mb-16) so "Quick actions" reads as a
          new section, not a continuation of the at-a-glance tiles. */}
      <section className="mb-12 md:mb-16">
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

      {/* Quick actions — heading-to-cards bumped to mb-6 (24px),
          section-bottom bumped to mb-12 (~48px) so the placeholder
          row below has clear visual separation. */}
      <section className="mb-10 md:mb-12">
        <h2 className="font-display text-[20px] md:text-[22px] text-ink mb-6">
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
