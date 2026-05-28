// Donation Lifecycle sub-phase 3 — admin donations queue data layer.
//
// Reads sponsorships + resolves each to a fulfillment phase via the
// pure resolver in src/lib/fulfillment-status.ts. The queue's primary
// concern is the FULFILLMENT axis (not the payment axis the existing
// /admin/sponsorships queue surfaces) — admin uses this to scan
// "what gifts are stuck / on hold / disputed" at a glance.
//
// Implementation: bulk-fetches sponsorships + their latest task +
// latest report in 3 queries (using `_in` on `sponsorship`), then
// runs the resolver per row. At expected scale (<1k sponsorships)
// this is fine; if it grows, the natural next step is a Postgres
// materialized view.

import "server-only";

import { readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  resolveFulfillment,
  type FulfillmentPhase,
  type LatestReportInput,
  type LatestTaskInput,
  type SponsorshipFulfillmentInput,
} from "./fulfillment-status";

const SPONSORSHIP_FIELDS = [
  "id",
  "donor",
  "status",
  "payment_mode",
  "amount_usd",
  "currency",
  "donor_currency_code",
  "donor_currency_amount",
  "date_created",
  "started_at",
  "cancelled_at",
  "fulfillment_exception",
  "fulfillment_exception_at",
  "fulfillment_reason",
  "fulfillment_donor_visible_reason",
  "child.id",
  "child.display_name",
] as const;

type SponsorshipRow = {
  id: string;
  donor: string | null;
  status: string | null;
  payment_mode: string | null;
  amount_usd: number | string | null;
  currency: string | null;
  donor_currency_code: string | null;
  donor_currency_amount: number | string | null;
  date_created: string | null;
  started_at: string | null;
  cancelled_at: string | null;
  fulfillment_exception: string | null;
  fulfillment_exception_at: string | null;
  fulfillment_reason: string | null;
  fulfillment_donor_visible_reason: string | null;
  child: { id?: string; display_name?: string | null } | string | null;
};

export interface AdminDonationRow {
  id: string;
  donorLabel: string;
  donorEmail: string | null;
  childLabel: string;
  childId: string | null;
  paymentStatus: string;
  paymentMode: string;
  amountUsd: number;
  currency: string;
  phase: FulfillmentPhase;
  phaseLabel: string;
  phaseSince: string | null;
  hasExceptionReason: boolean;
  // The DERIVED phase source — diagnostic for admin (e.g. exception
  // vs spine vs payment-paused). Admin-only.
  source: string | null;
  startedAt: string | null;
  dateCreated: string | null;
}

const PHASE_LABEL_MAP: Record<FulfillmentPhase, string> = {
  pending: "Pending",
  processing: "Processing",
  in_delivery: "In delivery",
  delivered: "Delivered",
  on_hold: "On hold",
  disputed: "Under review",
  refund_requested: "Refund requested",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

function unwrapChild(c: SponsorshipRow["child"]):
  | { id: string | null; display_name: string | null }
  | null {
  if (!c) return null;
  if (typeof c === "string") return { id: c, display_name: null };
  return { id: c.id ?? null, display_name: c.display_name?.trim() ?? null };
}

function toInput(row: SponsorshipRow): SponsorshipFulfillmentInput {
  return {
    status: (row.status ?? "pending_payment") as SponsorshipFulfillmentInput["status"],
    cancelled_at: row.cancelled_at,
    fulfillment_exception:
      row.fulfillment_exception === "on_hold" ||
      row.fulfillment_exception === "disputed" ||
      row.fulfillment_exception === "refund_requested" ||
      row.fulfillment_exception === "refunded"
        ? row.fulfillment_exception
        : null,
    fulfillment_exception_at: row.fulfillment_exception_at,
    fulfillment_reason: row.fulfillment_reason,
    fulfillment_donor_visible_reason: row.fulfillment_donor_visible_reason,
  };
}

async function bulkLatestTasks(
  sponsorshipIds: string[],
): Promise<Map<string, LatestTaskInput>> {
  if (sponsorshipIds.length === 0) return new Map();
  try {
    // Pull every task for every sponsorship; we sort + dedupe in JS.
    // For scale > 5k tasks this becomes inefficient — V2 swap to per-
    // sponsorship-latest via SQL or a materialized view.
    const rows = (await directusServer().request(
      readItems("task" as never, {
        filter: { sponsorship: { _in: sponsorshipIds } },
        fields: ["id", "sponsorship", "di_status", "admin_status", "date_created"],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as
      | Array<{
          id: string;
          sponsorship: string | null;
          di_status: string | null;
          admin_status: string | null;
          date_created: string | null;
        }>
      | undefined;
    const map = new Map<string, LatestTaskInput>();
    if (!Array.isArray(rows)) return map;
    for (const r of rows) {
      if (!r.sponsorship) continue;
      if (map.has(r.sponsorship)) continue; // already have latest
      map.set(r.sponsorship, {
        id: r.id,
        di_status: r.di_status ?? "",
        admin_status: r.admin_status ?? "",
        date_created: r.date_created,
      });
    }
    return map;
  } catch (err) {
    console.warn(
      "[admin-donations] bulkLatestTasks failed",
      err instanceof Error ? err.message : err,
    );
    return new Map();
  }
}

async function bulkLatestReports(
  sponsorshipIds: string[],
): Promise<Map<string, LatestReportInput>> {
  if (sponsorshipIds.length === 0) return new Map();
  try {
    const rows = (await directusServer().request(
      readItems("child_update" as never, {
        filter: { sponsorship: { _in: sponsorshipIds } },
        fields: ["id", "sponsorship", "status", "published_at"],
        sort: ["-id"],
        limit: -1,
      } as never),
    )) as unknown as
      | Array<{
          id: string;
          sponsorship: string | null;
          status: string | null;
          published_at: string | null;
        }>
      | undefined;
    const map = new Map<string, LatestReportInput>();
    if (!Array.isArray(rows)) return map;
    for (const r of rows) {
      if (!r.sponsorship) continue;
      if (map.has(r.sponsorship)) continue;
      map.set(r.sponsorship, {
        id: r.id,
        status: r.status ?? "",
        published_at: r.published_at,
      });
    }
    return map;
  } catch (err) {
    console.warn(
      "[admin-donations] bulkLatestReports failed",
      err instanceof Error ? err.message : err,
    );
    return new Map();
  }
}

async function resolveDonors(
  donorIds: string[],
): Promise<Map<string, { name: string; email: string | null }>> {
  if (donorIds.length === 0) return new Map();
  try {
    const users = (await directusServer().request(
      readUsers({
        filter: { id: { _in: donorIds } },
        fields: ["id", "first_name", "last_name", "email"],
        limit: -1,
      } as never),
    )) as unknown as
      | Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }>
      | undefined;
    const map = new Map<string, { name: string; email: string | null }>();
    if (!Array.isArray(users)) return map;
    for (const u of users) {
      const name =
        [u.first_name?.trim(), u.last_name?.trim()].filter(Boolean).join(" ") ||
        "Anonymous";
      map.set(u.id, { name, email: u.email });
    }
    return map;
  } catch {
    return new Map();
  }
}

export type DonationsPhaseFilter =
  | "all"
  | "pending"
  | "processing"
  | "in_delivery"
  | "delivered"
  | "on_hold"
  | "disputed"
  | "refund_requested"
  | "refunded"
  | "cancelled";

export interface ListAdminDonationsOpts {
  phaseFilter?: DonationsPhaseFilter;
  limit?: number;
}

export async function listAdminDonations(
  opts: ListAdminDonationsOpts = {},
): Promise<AdminDonationRow[]> {
  // Pull all sponsorships (sub-1k expected). Already-cancelled-pre-
  // payment (status='pending_payment') rows are skipped by the
  // resolver returning null — we filter them out at the row level
  // since the queue is about "donations in flight" or recently
  // terminal, not abandoned checkouts.
  let rows: SponsorshipRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("sponsorship" as never, {
        fields: [...SPONSORSHIP_FIELDS],
        sort: ["-date_created"],
        limit: opts.limit ?? -1,
      } as never),
    )) as unknown as SponsorshipRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[admin-donations] listAdminDonations failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  const ids = rows.map((r) => r.id);
  const [taskMap, reportMap, donorMap] = await Promise.all([
    bulkLatestTasks(ids),
    bulkLatestReports(ids),
    resolveDonors(
      Array.from(new Set(rows.map((r) => r.donor).filter((x): x is string => !!x))),
    ),
  ]);

  const out: AdminDonationRow[] = [];
  for (const r of rows) {
    const child = unwrapChild(r.child);
    const donor = r.donor ? donorMap.get(r.donor) : undefined;
    const resolved = resolveFulfillment({
      sponsorship: toInput(r),
      latestTask: taskMap.get(r.id) ?? null,
      latestReport: reportMap.get(r.id) ?? null,
    });
    if (!resolved.internal) {
      // pending_payment — donation not "in" yet. Skip from queue;
      // /admin/sponsorships covers the awaiting-payment slice.
      continue;
    }
    const phase = resolved.internal.phase;
    if (opts.phaseFilter && opts.phaseFilter !== "all" && opts.phaseFilter !== phase) {
      continue;
    }
    out.push({
      id: r.id,
      donorLabel: donor?.name ?? "Anonymous",
      donorEmail: donor?.email ?? null,
      childLabel: child?.display_name ?? "—",
      childId: child?.id ?? null,
      paymentStatus: r.status ?? "—",
      paymentMode: r.payment_mode ?? "—",
      amountUsd:
        typeof r.amount_usd === "number"
          ? r.amount_usd
          : Number(r.amount_usd ?? 0) || 0,
      currency: r.currency ?? "USD",
      phase,
      phaseLabel: PHASE_LABEL_MAP[phase],
      phaseSince: resolved.internal.since,
      hasExceptionReason: r.fulfillment_donor_visible_reason !== null,
      source: resolved.internal.source,
      startedAt: r.started_at,
      dateCreated: r.date_created,
    });
  }

  return out;
}

export function listDonationPhases(): ReadonlyArray<{
  value: DonationsPhaseFilter;
  label: string;
}> {
  return [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "in_delivery", label: "In delivery" },
    { value: "delivered", label: "Delivered" },
    { value: "on_hold", label: "On hold" },
    { value: "disputed", label: "Under review" },
    { value: "refund_requested", label: "Refund requested" },
    { value: "refunded", label: "Refunded" },
    { value: "cancelled", label: "Cancelled" },
  ];
}
