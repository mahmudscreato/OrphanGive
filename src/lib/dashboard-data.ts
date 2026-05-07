// Aggregation helpers for the dashboard. Pure read-side: no mutations,
// no Stripe calls. The shape is tuned for the ImpactHero stats and
// the RecentUpdatesSection.

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  getDonorSponsorships,
  type Sponsorship,
} from "./sponsorship-data";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Donor impact ───────────────────────────────────────────────────────────
export type DonorImpact = {
  uniqueChildCount: number;
  durationLabel: string;
  totalContributedUsd: number;
  paymentCount: number;
  // Sum of amount_usd for currently-active monthly sponsorships that
  // bill recurringly (i.e. NOT prepaid — those are already paid).
  monthlyCommitmentUsd: number;
  totalActiveSponsorships: number;
  // Sum of prepaid_months_remaining across all sponsorships.
  prepaidMonthsRemaining: number;
  hasAnyActive: boolean;
  hasOnlyCompletedOrCancelled: boolean;
  // Pulled out for the hero subline ("$child and N-1 others are…").
  primaryActiveChildName: string | null;
  // First name for the greeting; nullable so callers can fall back.
  earliestStartedAt: string | null;
};

export async function calculateDonorImpact(
  donorId: string,
): Promise<DonorImpact> {
  const empty: DonorImpact = {
    uniqueChildCount: 0,
    durationLabel: "",
    totalContributedUsd: 0,
    paymentCount: 0,
    monthlyCommitmentUsd: 0,
    totalActiveSponsorships: 0,
    prepaidMonthsRemaining: 0,
    hasAnyActive: false,
    hasOnlyCompletedOrCancelled: false,
    primaryActiveChildName: null,
    earliestStartedAt: null,
  };
  if (!UUID_RE.test(donorId)) return empty;

  const sponsorships = await getDonorSponsorships(donorId, { limit: 200 });

  const childIdsSupported = new Set<string>();
  let totalContributed = 0;
  let payments = 0;
  let monthlyCommitment = 0;
  let activeCount = 0;
  let prepaidRemaining = 0;
  let earliestStartedAt: string | null = null;
  let primaryActiveChildName: string | null = null;
  let anyActive = false;
  let anyCompletedOrCancelled = false;

  for (const s of sponsorships) {
    totalContributed += Number(s.total_paid_usd ?? 0);
    payments += Number(s.payment_count ?? 0);

    // "uniqueChildCount" counts active + completed only — pending and
    // cancelled don't represent ongoing support.
    if (s.status === "active" || s.status === "completed") {
      const cid = childIdOf(s);
      if (cid) childIdsSupported.add(cid);
    }

    if (s.status === "active") {
      anyActive = true;
      activeCount++;
      // Recurring monthly counts toward "ongoing monthly commitment".
      // Prepaid is excluded — that money's already paid. Indefinite +
      // fixed-term recurring both count.
      if (
        s.payment_mode === "monthly" &&
        s.payment_schedule === "monthly"
      ) {
        monthlyCommitment += Number(s.amount_usd ?? 0);
      }
      prepaidRemaining += Number(s.prepaid_months_remaining ?? 0);
      if (!primaryActiveChildName) {
        const c = s.child;
        const name =
          typeof c === "string" ? null : c?.display_name?.trim() || null;
        if (name) primaryActiveChildName = name;
      }
    } else if (s.status === "completed" || s.status === "cancelled") {
      anyCompletedOrCancelled = true;
    }

    if (s.started_at) {
      if (!earliestStartedAt || s.started_at < earliestStartedAt) {
        earliestStartedAt = s.started_at;
      }
    }
  }

  return {
    uniqueChildCount: childIdsSupported.size,
    durationLabel: formatDurationSince(earliestStartedAt),
    totalContributedUsd: totalContributed,
    paymentCount: payments,
    monthlyCommitmentUsd: monthlyCommitment,
    totalActiveSponsorships: activeCount,
    prepaidMonthsRemaining: prepaidRemaining,
    hasAnyActive: anyActive,
    hasOnlyCompletedOrCancelled: !anyActive && anyCompletedOrCancelled,
    primaryActiveChildName,
    earliestStartedAt,
  };
}

function childIdOf(s: Sponsorship): string | null {
  if (!s.child) return null;
  return typeof s.child === "string" ? s.child : s.child.id;
}

// "1 month", "8 months", "1 year", "2 years 3 months". Empty string if
// no anchor date or it's in the future.
function formatDurationSince(iso: string | null): string {
  if (!iso) return "";
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";
  const now = new Date();
  const ms = now.getTime() - start.getTime();
  if (ms <= 0) return "";
  const totalDays = ms / (24 * 60 * 60 * 1000);
  const totalMonths = Math.floor(totalDays / 30.44);
  if (totalMonths < 1) return "this month";
  if (totalMonths < 12) {
    return `${totalMonths} ${totalMonths === 1 ? "month" : "months"}`;
  }
  const years = Math.floor(totalMonths / 12);
  const remMonths = totalMonths % 12;
  if (remMonths === 0) return `${years} ${years === 1 ? "year" : "years"}`;
  return `${years} ${years === 1 ? "year" : "years"} ${remMonths} ${remMonths === 1 ? "month" : "months"}`;
}

// ─── Recent moments timeline ────────────────────────────────────────────────
// We surface child_moment rows for any child the donor *actively*
// sponsors (status='active'). Status 'published' is the visible-to-donors
// state per the moments collection convention.
export type ChildMoment = {
  id: string;
  child_id: string;
  child_name: string | null;
  child_photo: string | null;
  caption: string | null;
  photo: string | null;
  taken_at: string | null;
  date_created: string | null;
};

export async function getRecentMomentsForDonor(
  donorId: string,
  limit = 10,
): Promise<ChildMoment[]> {
  if (!UUID_RE.test(donorId)) return [];

  // Active sponsorships → unique child ids.
  const sponsorships = await getDonorSponsorships(donorId, { limit: 200 });
  const childIds = Array.from(
    new Set(
      sponsorships
        .filter((s) => s.status === "active")
        .map((s) => childIdOf(s))
        .filter((v): v is string => Boolean(v)),
    ),
  );
  if (childIds.length === 0) return [];

  // Build a quick child-id → display-name map from the same sponsorship
  // payloads so we don't refetch.
  const childMap = new Map<
    string,
    { name: string | null; photo: string | null }
  >();
  for (const s of sponsorships) {
    if (typeof s.child === "string") {
      if (!childMap.has(s.child)) {
        childMap.set(s.child, { name: null, photo: null });
      }
    } else if (s.child) {
      childMap.set(s.child.id, {
        name: s.child.display_name ?? null,
        photo: s.child.Photo ?? null,
      });
    }
  }

  try {
    const rows = (await directusServer().request(
      readItems("child_moment" as never, {
        filter: {
          _and: [
            { child: { _in: childIds } },
            { status: { _eq: "published" } },
          ],
        },
        fields: [
          "id",
          "child",
          "caption",
          "photo",
          "taken_at",
          "date_created",
        ],
        // Newest-first by the actual moment date; fall back to row
        // creation date if `taken_at` is null.
        sort: ["-taken_at", "-date_created"],
        limit,
      } as never),
    )) as unknown as Array<{
      id: string;
      child: string;
      caption: string | null;
      photo: string | null;
      taken_at: string | null;
      date_created: string | null;
    }>;
    return (rows ?? []).map((r) => {
      const cm = childMap.get(r.child);
      return {
        id: r.id,
        child_id: r.child,
        child_name: cm?.name ?? null,
        child_photo: cm?.photo ?? null,
        caption: r.caption ?? null,
        photo: r.photo ?? null,
        taken_at: r.taken_at ?? null,
        date_created: r.date_created ?? null,
      };
    });
  } catch (err) {
    console.warn(
      "[dashboard-data] getRecentMomentsForDonor failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Time-ago ───────────────────────────────────────────────────────────────
// Used by RecentUpdatesSection. Small format-distance helper, no
// date-fns dependency.
export function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }
  if (days < 365) {
    const months = Math.round(days / 30.44);
    return months === 1 ? "last month" : `${months} months ago`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "last year" : `${years} years ago`;
}
