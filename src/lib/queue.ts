// Sponsor queue (Session 14.7).
//
// The queue extends 14.6's child-lock: when a child has an active
// monthly sponsor, additional donors can pay upfront NOW to claim a
// future slot. When the active sub ends (natural or early cancel),
// the next queued donor's sub activates automatically.
//
// Schema model:
//   sponsorship.queue_position
//     0 (or null) = currently supporting the child (the "active sponsor")
//     1, 2, 3     = waiting in line (queued)
//   sponsorship.queue_status
//     'queued' iff queue_position > 0; null otherwise
//   sponsorship.queued_starts_at, queued_ends_at
//     populated for queued rows; null for active or terminal rows
//
// Rows in BOTH the active and queued buckets carry status='active' —
// the donor's commitment is real (Stripe sub or paid PI exists). The
// position/queue_status pair discriminates which one is currently
// supporting the child. Every read site that wants "currently
// supporting" rows must filter `(queue_position IS NULL OR queue_position = 0)`.
//
// This file is a leaf module. It depends on directus + sponsorship-data
// only; nothing UI-facing. Both the sponsor flow and the Stripe
// webhook handler call into here.

import type Stripe from "stripe";
import { readItem, readItems, readUsers, updateItem } from "@directus/sdk";
import { directusServer } from "./directus";
import {
  type Sponsorship,
  updateSponsorship,
} from "./sponsorship-data";
import { sendEmail, siteUrl } from "./email";
import {
  fetchChildById,
  fetchDonorById,
  formatTo,
} from "./email-data";
import { labelForCause } from "./cause";
import { labelForVisibility } from "./visibility";
import { SponsorshipActivatedEmail } from "@/emails/SponsorshipActivatedEmail";
import { SponsorshipQueueShiftEmail } from "@/emails/SponsorshipQueueShiftEmail";

// ─── Constants ──────────────────────────────────────────────────────────────

// Maximum number of queued donors per child. After this many slots
// are filled, the sponsor flow refuses further queue joins (the
// monthly tile is rendered fully locked, "Queue is full"). One-time
// gifts remain unaffected. The number is a product judgement call,
// not a technical constraint — bump in this constant if the rule
// changes.
export const QUEUE_DEPTH_LIMIT = 3;

// Seconds added to "now" when we collapse a queued sub's trial_end to
// trigger immediate first charge. Stripe rejects trial_end values
// in the past; a small forward-buffer (10s) gives us headroom.
const TRIAL_END_FIRE_BUFFER_SEC = 10;

// ─── Types ──────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// All queue-relevant fields. Used by getQueueForChild's read; the
// helper hands back full Sponsorship rows so callers can drill into
// payment_schedule / amount / etc. without a second round-trip.
const QUEUE_READ_FIELDS = [
  "id",
  "donor",
  "child",
  "payment_mode",
  "amount_usd",
  "currency",
  "status",
  "stripe_subscription_id",
  "stripe_payment_intent_id",
  "stripe_customer_id",
  "started_at",
  "ended_at",
  "cancelled_at",
  "next_billing_date",
  "total_paid_usd",
  "payment_count",
  "date_created",
  "checkout_fingerprint",
  "cancellation_reason",
  "paused_at",
  "modified_at",
  "modification_history",
  "duration_months",
  "payment_schedule",
  "prepaid_months_total",
  "prepaid_months_remaining",
  "scheduled_end_date",
  "cancellation_scheduled_at",
  "cause",
  "visibility",
  "queue_position",
  "queued_starts_at",
  "queued_ends_at",
  "queue_status",
  "child.id",
  "child.display_name",
  "child.Photo",
  "child.date_of_birth",
  "child.bd_district.name",
] as const;

export type ChildQueue = {
  // Currently-supporting row (queue_position 0 OR null) — at most one.
  active: Sponsorship | null;
  // Queued rows, sorted by queue_position ASC (1, 2, 3). May be empty.
  queued: Sponsorship[];
};

// ─── Read helpers ───────────────────────────────────────────────────────────

// Fetch the full queue (active + queued) for one child. Single round-trip.
// status='active' AND payment_mode='monthly' — one-time gifts and any
// terminal rows are excluded.
export async function getQueueForChild(childId: string): Promise<ChildQueue> {
  if (!UUID_RE.test(childId)) return { active: null, queued: [] };
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "active" } },
            { payment_mode: { _eq: "monthly" } },
          ],
        },
        fields: [...QUEUE_READ_FIELDS],
        // Position-then-creation order: position=0 first (active), then
        // 1, 2, 3 ascending. date_created is the secondary sort so
        // concurrent inserts at the same position resolve to first-wins.
        sort: ["queue_position", "date_created"],
        limit: -1,
      } as never),
    )) as unknown as Sponsorship[];
    if (!Array.isArray(rows)) return { active: null, queued: [] };
    let active: Sponsorship | null = null;
    const queued: Sponsorship[] = [];
    for (const r of rows) {
      const pos = r.queue_position ?? 0;
      if (pos === 0) {
        if (!active) active = r;
        else {
          // Two active rows for the same child — data integrity
          // issue. The 14.6 race-guard at /api/checkout/init
          // prevents new ones, but log loudly if we ever see one.
          console.warn(
            `[queue] getQueueForChild: ${childId} has multiple position=0 rows; using earliest (${active.id})`,
          );
        }
      } else {
        queued.push(r);
      }
    }
    return { active, queued };
  } catch (err) {
    console.warn(
      "[queue] getQueueForChild failed",
      err instanceof Error ? err.message : err,
    );
    return { active: null, queued: [] };
  }
}

// Compute what queue_position a NEW join would receive and the
// estimated start date. Position is `active_count + queued_count`
// (so first join when there's just an active sponsor → position 1).
// startsAt is built from the active sub's scheduled_end_date plus the
// sum of earlier-queued subs' duration_months (in calendar months,
// 30.44 days per month — same convention as the rest of the codebase).
//
// Returns position > QUEUE_DEPTH_LIMIT when the queue is full — the
// caller (sponsor page / checkout-init) MUST check and reject. We
// don't throw here so the sponsor page can render a "queue is full"
// state gracefully without an error boundary.
export type NextQueueSlot = {
  position: number;
  startsAt: Date | null;
  // The active sponsor's scheduled end date, or null if there is no
  // active monthly sponsor (in which case the donor isn't joining a
  // queue at all — they're taking position=0).
  activeEndDate: Date | null;
};

export async function computeNextQueueSlot(
  childId: string,
): Promise<NextQueueSlot> {
  const { active, queued } = await getQueueForChild(childId);
  if (!active) {
    // No active monthly sponsor → this donor would BECOME the active
    // sponsor (position 0). The sponsor flow handles this branch via
    // its existing non-queue path; this function still answers
    // honestly so the caller can detect "no queue here".
    return { position: 0, startsAt: null, activeEndDate: null };
  }
  const activeEnd = active.scheduled_end_date
    ? new Date(active.scheduled_end_date)
    : null;
  // For an indefinite active sub (scheduled_end_date is null), we
  // can't predict an end date. Use null and let the UI show "begins
  // when current sub ends" copy. Queued joins on indefinite subs
  // are still allowed — the active donor may cancel any time.
  let cursor: Date | null =
    activeEnd && !Number.isNaN(activeEnd.getTime()) ? activeEnd : null;
  for (const q of queued) {
    if (!cursor) break;
    const months = q.duration_months ?? 0;
    if (months > 0) {
      cursor = addMonths(cursor, months);
    }
  }
  return {
    position: queued.length + 1,
    startsAt: cursor,
    activeEndDate: activeEnd,
  };
}

// ─── Promotion (the core write path) ────────────────────────────────────────

// Called when the active sponsor's sub ends — either via Stripe
// webhook (customer.subscription.deleted, invoice.paid for a final
// fixed-term cycle) or via the daily safety-net cron. Idempotent:
// re-running with no-eligible-promotion is a no-op.
//
// Behaviour:
// 1. Read the queue for the child.
// 2. The position=0 row: confirm it has actually ended
//    (status != 'active' OR scheduled_end_date < now). If still
//    active+future, no-op — the webhook fired ahead of schedule or
//    we're racing a still-running sub.
// 3. Promote position=1 to position=0:
//    - For prepaid: started_at=now, scheduled_end_date=now+duration_months
//    - For recurring (trial_end sub): stripe.subscriptions.update to
//      set trial_end=now+10s — this fires the first charge
//      immediately. Sponsorship row's started_at flips to that
//      timestamp. scheduled_end_date computed from duration_months
//      if fixed-term; null if indefinite.
//    - queue_position → 0, queue_status → null,
//      queued_starts_at + queued_ends_at → null.
// 4. Cascade: position 2 → 1, position 3 → 2. Recompute
//    queued_starts_at + queued_ends_at based on the new ordering and
//    the newly-promoted active end date.
//
// Email notifications (sponsorship-activated to the new active donor;
// queue-shift to subsequent donors whose dates moved materially) are
// Phase 2 — see SCOPE NOTE in the session spec.
export async function promoteQueue(
  childId: string,
  opts: { stripe?: Stripe } = {},
): Promise<{ promoted: boolean; newActiveSponsorshipId: string | null }> {
  if (!UUID_RE.test(childId)) {
    return { promoted: false, newActiveSponsorshipId: null };
  }

  const { active, queued } = await getQueueForChild(childId);

  // Defensive: only promote when the previous active row is gone.
  // The webhook flow already marked it 'completed' / 'cancelled'
  // before calling us, so getQueueForChild won't return it (it's
  // filtered to status='active'). If somehow it's still active +
  // not past its scheduled end, no-op.
  if (active) {
    const stillActive = sponsorshipIsLive(active);
    if (stillActive) {
      // Webhook fired prematurely or we're racing a not-yet-ended
      // sub. Don't promote.
      return { promoted: false, newActiveSponsorshipId: null };
    }
  }

  if (queued.length === 0) {
    // Empty queue — the child is now sponsorless. Nothing to promote.
    return { promoted: false, newActiveSponsorshipId: null };
  }

  // Sort by position ASC (getQueueForChild already does), pick the
  // head as the promotee.
  const head = queued[0]!;
  const rest = queued.slice(1);

  const now = new Date();
  const headDuration = head.duration_months ?? null;

  // Fire the head's payment surface NOW.
  if (head.payment_schedule === "monthly_prepaid") {
    // Prepaid case: the donor's PI already succeeded at queue-join
    // time; the funds are ours. Just mark started_at + recompute
    // scheduled_end_date from now + duration_months.
    const newEnd = headDuration ? addMonths(now, headDuration) : null;
    try {
      await updateSponsorship(head.id, {
        queue_position: 0,
        queue_status: null,
        queued_starts_at: null,
        queued_ends_at: null,
        started_at: now.toISOString(),
        scheduled_end_date: newEnd ? newEnd.toISOString() : null,
        next_billing_date: null,
      });
    } catch (err) {
      console.error(
        `[queue] promote prepaid ${head.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      return { promoted: false, newActiveSponsorshipId: null };
    }
  } else if (head.payment_schedule === "monthly") {
    // Recurring case: a Stripe subscription exists with trial_end set
    // to the active sub's previous end date. Collapse trial_end to
    // now+10s so Stripe fires the first invoice immediately.
    const stripe = opts.stripe;
    if (!stripe) {
      console.error(
        `[queue] promote recurring ${head.id} — Stripe client not provided; cannot collapse trial_end`,
      );
      return { promoted: false, newActiveSponsorshipId: null };
    }
    if (!head.stripe_subscription_id) {
      console.error(
        `[queue] promote recurring ${head.id} — row has no stripe_subscription_id`,
      );
      return { promoted: false, newActiveSponsorshipId: null };
    }
    const newTrialEnd =
      Math.floor(now.getTime() / 1000) + TRIAL_END_FIRE_BUFFER_SEC;
    try {
      await stripe.subscriptions.update(head.stripe_subscription_id, {
        trial_end: newTrialEnd,
      });
    } catch (err) {
      console.error(
        `[queue] promote recurring ${head.id} — Stripe trial_end update failed:`,
        err instanceof Error ? err.message : err,
      );
      return { promoted: false, newActiveSponsorshipId: null };
    }
    // Compute the row patch. scheduled_end_date is determined by
    // fixed-term duration; indefinite subs leave it null.
    const startedAt = new Date((newTrialEnd + 1) * 1000);
    const newEnd = headDuration ? addMonths(startedAt, headDuration) : null;
    try {
      await updateSponsorship(head.id, {
        queue_position: 0,
        queue_status: null,
        queued_starts_at: null,
        queued_ends_at: null,
        started_at: startedAt.toISOString(),
        scheduled_end_date: newEnd ? newEnd.toISOString() : null,
      });
    } catch (err) {
      console.error(
        `[queue] promote recurring ${head.id} — Directus update failed:`,
        err instanceof Error ? err.message : err,
      );
      return { promoted: false, newActiveSponsorshipId: null };
    }
  } else {
    console.error(
      `[queue] promote ${head.id} — unsupported payment_schedule ${head.payment_schedule}`,
    );
    return { promoted: false, newActiveSponsorshipId: null };
  }

  // Cascade: shift remaining queued rows up one position. Recompute
  // their start/end dates based on the head's new scheduled end.
  let cursor = headDuration ? addMonths(now, headDuration) : null;
  for (let i = 0; i < rest.length; i++) {
    const q = rest[i]!;
    const newPosition = i + 1;
    const startsAt = cursor;
    const endsAt =
      cursor && q.duration_months
        ? addMonths(cursor, q.duration_months)
        : null;
    try {
      await updateSponsorship(q.id, {
        queue_position: newPosition,
        queue_status: "queued",
        queued_starts_at: startsAt ? startsAt.toISOString() : null,
        queued_ends_at: endsAt ? endsAt.toISOString() : null,
      });
    } catch (err) {
      console.warn(
        `[queue] cascade ${q.id} → position ${newPosition} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
    cursor = endsAt;
  }

  // Send the activation email — best-effort, swallow on error so a
  // mail-server hiccup doesn't unwind the row promotion. The
  // post-promotion getQueueForChild + sendActivationEmail look up
  // donor + child fresh; the head row's status/dates we already
  // updated above are reflected in the message body via this fetch.
  try {
    await sendActivationEmail(head.id);
  } catch (err) {
    console.warn(
      `[queue] activation email for ${head.id} failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }

  return { promoted: true, newActiveSponsorshipId: head.id };
}

// Looks up donor + child + the just-updated sponsorship row, renders
// SponsorshipActivatedEmail, and sends. Used by promoteQueue's success
// path. Failures are logged but not thrown — the row update is the
// source of truth, the email is an over-the-wire courtesy.
async function sendActivationEmail(sponsorshipId: string): Promise<void> {
  const ds = directusServer();
  const row = (await ds.request(
    readItem("sponsorship" as never, sponsorshipId as never, {
      fields: [
        "id",
        "donor",
        "child",
        "amount_usd",
        "duration_months",
        "scheduled_end_date",
        "payment_schedule",
        "cause",
        "visibility",
      ],
    } as never),
  )) as unknown as {
    id: string;
    donor: string;
    child: string;
    amount_usd: number;
    duration_months: number | null;
    scheduled_end_date: string | null;
    payment_schedule: "monthly" | "monthly_prepaid" | null;
    cause: string | null;
    visibility: string | null;
  };
  if (!row) return;
  const donor = await fetchDonorById(String(row.donor));
  const child = await fetchChildById(String(row.child));
  if (!donor || !donor.email) return;
  const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
  const childName = child?.display_name ?? "your sponsored child";
  await sendEmail({
    to: formatTo(donor.email, firstName),
    subject: `Your sponsorship of ${childName} has begun`,
    template: SponsorshipActivatedEmail({
      firstName,
      childName,
      childDistrict: child?.district ?? null,
      childAge: child?.age ?? null,
      amountUsd: Number(row.amount_usd ?? 0),
      durationMonths: row.duration_months ?? null,
      scheduledEndDate: row.scheduled_end_date ?? null,
      paymentScheduleLabel:
        row.payment_schedule === "monthly_prepaid" ? "monthly_prepaid" : "monthly",
      causeLabel: labelForCause(row.cause),
      visibilityLabel: labelForVisibility(row.visibility),
      sponsorshipUrl: siteUrl(`/dashboard/sponsorship/${row.id}`),
    }),
  });
}

// ─── Shift queue dates ──────────────────────────────────────────────────────
//
// Called by /api/sponsorship/[id]/extend after the active sponsor's
// scheduled_end_date moves forward, and by /api/sponsorship/[id]/cancel-queued
// after a queued donor cancels (their slot empties; later positions
// move up). Recomputes queued_starts_at + queued_ends_at for every
// queued row on the child, propagates the new dates to Stripe (for
// recurring trial_end subs), and flags shift_decision_required so the
// donor's dashboard surfaces the 3-option decision card.
//
// Edge case: if newActiveEndDate has already passed (active sub
// cancelled retroactively, or extension shortens into the past),
// we delegate to promoteQueue — at-most-one slot can be promoted
// per call, but the cron will catch up subsequent ones.
//
// Returns the rows whose dates ACTUALLY moved so the caller can
// fan out shift emails. Idempotent: a no-op shift returns an empty
// array.

const TRIVIAL_SHIFT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day

export type ShiftedSponsorship = {
  sponsorship: Sponsorship;
  oldStartsAt: string | null;
  newStartsAt: string | null;
};

export async function shiftQueueDates(
  childId: string,
  newActiveEndDate: Date,
  opts: { stripe: Stripe },
): Promise<{ shifted: ShiftedSponsorship[] }> {
  if (!UUID_RE.test(childId)) return { shifted: [] };

  // If the new end date is already in the past, the active sub has
  // effectively ended — promote the queue head instead of just
  // shifting dates.
  if (newActiveEndDate.getTime() <= Date.now()) {
    await promoteQueue(childId, { stripe: opts.stripe });
    return { shifted: [] };
  }

  const { queued } = await getQueueForChild(childId);
  if (queued.length === 0) return { shifted: [] };

  // Cascade: pos=1 starts at newActiveEndDate; subsequent positions
  // start where their predecessor ends.
  const shifted: ShiftedSponsorship[] = [];
  let cursor: Date = newActiveEndDate;

  for (const q of queued) {
    const newStarts = cursor;
    const months = q.duration_months ?? 0;
    const newEnds = months > 0 ? addMonths(newStarts, months) : null;

    const oldStartsIso = q.queued_starts_at ?? null;
    const oldStartMs = oldStartsIso
      ? new Date(oldStartsIso).getTime()
      : null;
    const trivial =
      oldStartMs !== null &&
      Math.abs(newStarts.getTime() - oldStartMs) < TRIVIAL_SHIFT_THRESHOLD_MS;

    // Advance cursor for next iteration regardless of skip.
    cursor = newEnds ?? newStarts;

    if (trivial) continue;

    // Update Stripe sub if recurring trial_end. Prepaid rows have no
    // Stripe-side date concept beyond the original PI; the row's
    // queued_* fields carry the future window.
    if (
      q.payment_schedule === "monthly" &&
      q.stripe_subscription_id
    ) {
      const trialEndSec = Math.floor(newStarts.getTime() / 1000);
      const cancelAtSec = newEnds
        ? Math.floor(newEnds.getTime() / 1000)
        : undefined;
      try {
        await opts.stripe.subscriptions.update(q.stripe_subscription_id, {
          trial_end: trialEndSec,
          ...(cancelAtSec ? { cancel_at: cancelAtSec } : {}),
        });
      } catch (err) {
        console.warn(
          `[queue] shiftQueueDates: Stripe trial_end update for ${q.stripe_subscription_id} failed:`,
          err instanceof Error ? err.message : err,
        );
        // Non-fatal: record the row update anyway so the dashboard
        // is consistent. The cron's cleanup branch can reconcile if
        // Stripe state drifts.
      }
    }

    // Update the Directus row with the new dates AND raise the
    // shift_decision_required flag so the dashboard surfaces the
    // 3-option card. shift_decision and shift_decision_at are NOT
    // cleared here — if the donor previously made a decision on a
    // PRIOR shift, this raises a fresh round of decision-required
    // tracking with the new timestamp.
    const nowIso = new Date().toISOString();
    try {
      await updateSponsorship(q.id, {
        queued_starts_at: newStarts.toISOString(),
        queued_ends_at: newEnds ? newEnds.toISOString() : null,
        shift_decision_required: true,
        shift_decision_required_at: nowIso,
        shift_decision: null,
        shift_decision_at: null,
      });
    } catch (err) {
      console.warn(
        `[queue] shiftQueueDates: Directus update for ${q.id} failed:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    shifted.push({
      sponsorship: q,
      oldStartsAt: oldStartsIso,
      newStartsAt: newStarts.toISOString(),
    });
  }

  return { shifted };
}

// Renders + sends SponsorshipQueueShiftEmail for one shifted row.
// Best-effort — failures logged, not thrown. Caller (extend route,
// cancel-queued route) iterates the `shifted` array from
// shiftQueueDates and calls this once per affected donor.
export async function sendQueueShiftEmail(
  shifted: ShiftedSponsorship,
  opts: { activeSponsorFirstName: string | null },
): Promise<void> {
  const s = shifted.sponsorship;
  try {
    const childIdRef = typeof s.child === "string" ? s.child : s.child?.id;
    const donor = await fetchDonorById(
      typeof s.donor === "string" ? s.donor : "",
    );
    const child = childIdRef ? await fetchChildById(childIdRef) : null;
    if (!donor || !donor.email) return;
    const firstName = donor.first_name?.trim() || donor.email.split("@")[0]!;
    const childName = child?.display_name ?? "your sponsored child";
    await sendEmail({
      to: formatTo(donor.email, firstName),
      subject: `Your sponsorship of ${childName} has a new start date`,
      template: SponsorshipQueueShiftEmail({
        firstName,
        childName,
        activeSponsorFirstName: opts.activeSponsorFirstName,
        oldStartDate: shifted.oldStartsAt,
        newStartDate: shifted.newStartsAt,
        decisionUrl: siteUrl(
          `/dashboard/sponsorship/${s.id}/queue-shift-decision`,
        ),
      }),
    });
  } catch (err) {
    console.warn(
      `[queue] sendQueueShiftEmail for ${s.id} failed (non-fatal):`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ─── Date math (calendar-month convention) ──────────────────────────────────
//
// addMonths uses 30.44-day months — same convention as
// calculateScheduledEndDate in src/lib/pricing.ts and the cancel_at
// math in /api/checkout/init. Keeping a single convention across the
// codebase avoids subtle drift between "expected end date shown to
// donor" vs "what Stripe actually does on cancel_at".
const DAYS_PER_MONTH = 30.44;

function addMonths(base: Date, months: number): Date {
  const ms = months * DAYS_PER_MONTH * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ms);
}

// "Live" means the row is still actively supporting the child today:
// status='active', not past its scheduled end (if fixed-term), and
// not already cancellation-scheduled. promoteQueue uses this as a
// guard before promoting — if the previous active sponsor is somehow
// still live, we don't promote.
function sponsorshipIsLive(s: Sponsorship): boolean {
  if (s.status !== "active") return false;
  if (s.scheduled_end_date) {
    const end = new Date(s.scheduled_end_date).getTime();
    if (Number.isFinite(end) && end <= Date.now()) return false;
  }
  return true;
}

// Re-export the in-place update helper so consumers don't have to
// import sponsorship-data separately when they only want the queue
// surface. Kept as `_updateItem` to keep the public surface tight —
// callers shouldn't reach into Directus directly via this module.
export const _internal = { updateItem };

// ─── Display helper for the public child banner ─────────────────────────────
//
// getQueueForChild returns full sponsorship rows but without donor
// expansion. The public banner needs (a) which slot is active, (b)
// the queued slots in order, and (c) each donor's first name (only
// when their visibility='named' — anonymous donors render as "an
// anonymous donor"). This helper does the donor-fanout in one extra
// round-trip and shapes the result to what ChildSponsorBanner needs.

export type QueueDisplaySlot = {
  // 'active' = the current supporting sponsor (queue_position 0/null);
  // 'queued' = a future slot.
  kind: "active" | "queued";
  // null when visibility is anonymous (or null/legacy). Always null
  // for legacy rows even if we have first_name in DB — the read
  // honours the donor's chosen visibility.
  donorFirstName: string | null;
  // For active: scheduled_end_date (when the current slot ends).
  // For queued: queued_ends_at (when this donor's slot will end).
  endDate: string | null;
  visibility: string | null;
};

export type QueueDisplay = {
  active: QueueDisplaySlot | null;
  queued: QueueDisplaySlot[];
  // True when queued.length >= QUEUE_DEPTH_LIMIT. UI uses this to
  // surface "queue is full" copy rather than "you can sponsor from X".
  isFull: boolean;
};

export async function getQueueDisplayForChild(
  childId: string,
): Promise<QueueDisplay> {
  const { active, queued } = await getQueueForChild(childId);
  // Collect donor ids whose visibility is 'named' — those are the
  // only ones we'll surface a name for. Anonymous donors don't get
  // their name fetched (privacy-preserving by default).
  const donorIdsToFetch = new Set<string>();
  const consider = (s: Sponsorship) => {
    if (typeof s.donor !== "string") return; // already expanded — skip
    if ((s.visibility ?? "anonymous") === "named") {
      donorIdsToFetch.add(s.donor);
    }
  };
  if (active) consider(active);
  for (const q of queued) consider(q);

  const firstNameById = new Map<string, string | null>();
  if (donorIdsToFetch.size > 0) {
    try {
      const ids = Array.from(donorIdsToFetch);
      // Directus SDK v17+ rejects `readItems("directus_users", …)`
      // with "Cannot use readItems for core collections". Use the
      // dedicated `readUsers` helper instead.
      const rows = (await directusServer().request(
        readUsers({
          filter: { id: { _in: ids } },
          fields: ["id", "first_name"],
          limit: -1,
        }),
      )) as unknown as Array<{ id: string; first_name?: string | null }>;
      if (Array.isArray(rows)) {
        for (const r of rows) {
          firstNameById.set(String(r.id), r.first_name?.trim() ?? null);
        }
      }
    } catch (err) {
      console.warn(
        "[queue] getQueueDisplayForChild: donor fanout failed",
        err instanceof Error ? err.message : err,
      );
      // Non-fatal — banner will fall back to "anonymous donor" copy.
    }
  }

  const slotForRow = (s: Sponsorship, kind: "active" | "queued"): QueueDisplaySlot => {
    const visibility = s.visibility ?? "anonymous";
    let donorFirstName: string | null = null;
    if (visibility === "named") {
      const donorId = typeof s.donor === "string" ? s.donor : null;
      if (donorId) donorFirstName = firstNameById.get(donorId) ?? null;
    }
    return {
      kind,
      donorFirstName,
      endDate:
        kind === "active" ? s.scheduled_end_date : s.queued_ends_at ?? null,
      visibility,
    };
  };

  return {
    active: active ? slotForRow(active, "active") : null,
    queued: queued.map((q) => slotForRow(q, "queued")),
    isFull: queued.length >= QUEUE_DEPTH_LIMIT,
  };
}

