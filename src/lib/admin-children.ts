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

import "server-only";

import { readItems } from "@directus/sdk";
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
