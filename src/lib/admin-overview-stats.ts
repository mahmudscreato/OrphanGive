// feat/admin-dashboard-stats — nonprofit overview counts for /admin home.
//
// READ-ONLY companion to getAdminDashboardData. Computes the founder-locked
// stat list in ONE parallelized batch, then derives the rest in memory. No
// writes, no schema. Every count degrades to null on its own read failure so
// one bad query can't blank the whole dashboard.
//
// EFFICIENCY: a single sponsorship scan feeds SIX stats (paused, active
// donors, one-time gifts, new-this-month, ending-this-month, and the
// sponsored-child set for coverage) — cheaper than six filtered scans. The
// active-child list and the donor-user list are each read once and reused
// for two stats apiece. At large scale, swap the full scans for Directus
// aggregate endpoints; for a nonprofit's row counts a bounded scan is fine.
//
// DEFINITION NOTES (see the branch report for the full rationale):
//  - "Children ending this month": distinct children whose active/paused
//    sponsorship has scheduled_end_date in this calendar month.
//    scheduled_end_date IS the paid-term end (finite "pay monthly" + prepaid;
//    null for open-ended subs & one-time → correctly excluded).
//  - "Sponsored vs Awaiting": the model is BINARY (no partial-coverage /
//    funding-goal concept), so we report sponsored vs awaiting, not
//    full-vs-partial.
//  - "New donors this month": directus_users.date_created is 403 on this
//    install, so we use og_agreed_to_terms_at (stamped at signup) as the
//    registration-date proxy.
//  - "One-time gifts": one_time sponsorship rows that actually happened
//    (status active or completed; excludes pending_payment/failed).

import "server-only";

import { readItems, readUsers } from "@directus/sdk";
import { directusServer } from "./directus";
import { DONOR_ROLE_FILTER } from "./directus-roles";
import { countPendingRevealRequests } from "./reveal-data";

export interface AdminOverviewStats {
  // Needs attention
  pendingRevealCount: number | null;
  childrenEndingThisMonth: number | null;
  // Overview — children
  childrenListed: number | null;
  childrenWaiting: number | null;
  childrenSponsored: number | null;
  // Overview — donors
  donorsRegistered: number | null;
  donorsActive: number | null;
  newDonorsThisMonth: number | null;
  // Overview — sponsorships
  pausedSponsorships: number | null;
  oneTimeGifts: number | null;
  newSponsorshipsThisMonth: number | null;
}

type ChildIdRow = { id: string };
type DonorUserRow = { id: string; og_agreed_to_terms_at: string | null };
type SponsorshipRow = {
  donor: string | null;
  child: string | null;
  status: string | null;
  payment_mode: string | null;
  started_at: string | null;
  scheduled_end_date: string | null;
  queue_position: number | null;
};

// A sponsorship "currently supporting a child" — matches
// countActiveSponsorships (status=active AND queue slot 0/empty).
function isCurrentlyActive(s: SponsorshipRow): boolean {
  return (
    s.status === "active" &&
    (s.queue_position === null || s.queue_position === 0)
  );
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const inMonth = (iso: string | null): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t >= monthStart && t < monthEnd;
  };

  // ── One batch: reveal count + active children + donor users + all
  //    sponsorships. Each read fails to null/[] independently. ──
  const [pendingRevealCount, activeChildIds, donorUsers, sponsorships] =
    await Promise.all([
      countPendingRevealRequests().catch(() => null as number | null),
      // Active (listed/sponsorable) children — ids only.
      directusServer()
        .request(
          readItems("child" as never, {
            filter: { status: { _eq: "active" } },
            fields: ["id"],
            limit: -1,
          } as never),
        )
        .then((r) => (Array.isArray(r) ? (r as ChildIdRow[]) : null))
        .catch(() => null),
      // All donor accounts — id + signup-time proxy. One read → registered
      // count AND new-this-month.
      directusServer()
        .request(
          readUsers({
            filter: DONOR_ROLE_FILTER,
            fields: ["id", "og_agreed_to_terms_at"],
            limit: -1,
          } as never),
        )
        .then((r) => (Array.isArray(r) ? (r as DonorUserRow[]) : null))
        .catch(() => null),
      // One sponsorship scan → six stats + the sponsored-child set.
      directusServer()
        .request(
          readItems("sponsorship" as never, {
            fields: [
              "donor",
              "child",
              "status",
              "payment_mode",
              "started_at",
              "scheduled_end_date",
              "queue_position",
            ],
            limit: -1,
          } as never),
        )
        .then((r) => (Array.isArray(r) ? (r as SponsorshipRow[]) : null))
        .catch(() => null),
    ]);

  // ── Children (listed / waiting / sponsored) ──
  let childrenListed: number | null = null;
  let childrenWaiting: number | null = null;
  let childrenSponsored: number | null = null;
  if (activeChildIds) {
    childrenListed = activeChildIds.length;
    if (sponsorships) {
      const sponsoredChildSet = new Set<string>();
      for (const s of sponsorships) {
        if (s.child && isCurrentlyActive(s)) sponsoredChildSet.add(s.child);
      }
      childrenSponsored = activeChildIds.filter((c) =>
        sponsoredChildSet.has(c.id),
      ).length;
      childrenWaiting = childrenListed - childrenSponsored;
    }
  }

  // ── Donors (registered / new this month) ──
  const donorsRegistered = donorUsers ? donorUsers.length : null;
  const newDonorsThisMonth = donorUsers
    ? donorUsers.filter((u) => inMonth(u.og_agreed_to_terms_at)).length
    : null;

  // ── Sponsorship-derived stats (from the single scan) ──
  let childrenEndingThisMonth: number | null = null;
  let donorsActive: number | null = null;
  let pausedSponsorships: number | null = null;
  let oneTimeGifts: number | null = null;
  let newSponsorshipsThisMonth: number | null = null;
  if (sponsorships) {
    const endingChildSet = new Set<string>();
    const activeDonorSet = new Set<string>();
    let paused = 0;
    let oneTime = 0;
    let newSubs = 0;
    for (const s of sponsorships) {
      const active = isCurrentlyActive(s);
      const isPaused = s.status === "paused";
      if (isPaused) paused += 1;
      if ((active || isPaused) && s.donor) activeDonorSet.add(s.donor);
      if (
        s.payment_mode === "one_time" &&
        (s.status === "active" || s.status === "completed")
      ) {
        oneTime += 1;
      }
      if (inMonth(s.started_at)) newSubs += 1;
      // Children ending: distinct child whose still-running term ends this
      // month (matches the "Children ending" label; dedupes by child).
      if ((active || isPaused) && s.child && inMonth(s.scheduled_end_date)) {
        endingChildSet.add(s.child);
      }
    }
    childrenEndingThisMonth = endingChildSet.size;
    donorsActive = activeDonorSet.size;
    pausedSponsorships = paused;
    oneTimeGifts = oneTime;
    newSponsorshipsThisMonth = newSubs;
  }

  return {
    pendingRevealCount,
    childrenEndingThisMonth,
    childrenListed,
    childrenWaiting,
    childrenSponsored,
    donorsRegistered,
    donorsActive,
    newDonorsThisMonth,
    pausedSponsorships,
    oneTimeGifts,
    newSponsorshipsThisMonth,
  };
}
