// Donation Lifecycle — sub-phase 1 — pure read-time fulfillment
// resolver.
//
// Per docs/admin-os/04-donation-lifecycle-design.md the fulfillment
// status is a COMPOSED VIEW over three independent signals:
//
//   (1) sponsorship.fulfillment_exception   — stored exception (this sub-phase)
//   (2) sponsorship.status                  — payment lifecycle (Stripe-owned;
//                                              we read, never write)
//   (3) latest task + latest child_update    — spine (1.1 + 1.2; spine 1.2
//                                              statuses degrade gracefully
//                                              on legacy main)
//
// This module exports ONE function: resolveFulfillment(input). It is
// PURE — no I/O, no writes, no side effects, no fetches. Callers
// pre-load the sponsorship row + the latest task + the latest report
// and pass them in. (The fetching layer lives separately and will be
// added in sub-phase 2 alongside the donor + admin surfaces.)
//
// The function returns a DUAL output:
//   - `internal`: full detail incl. PRIVATE fulfillment_reason. For
//     admin / super-admin surfaces only.
//   - `donor`: scrubbed view. Surfaces ONLY fulfillment_donor_visible_reason
//     (curated copy). NEVER fulfillment_reason. NEVER Tier-3.
//
// PRECEDENCE (encoded in resolve order — first match wins):
//
//   1. sponsorship.status ∈ {cancelled, failed}
//      AND fulfillment_exception NOT IN {refunded, refund_requested}
//      → CANCELLED  (or terminal composite — see Q5)
//      Q5 lock: if a child_update.status='published' exists for this
//      sponsorship, the donor view shows "Delivered • Sponsorship
//      ended [date]" and the phase remains delivered with an attached
//      sponsorshipEndedAt.
//
//   2. fulfillment_exception='refunded'        → REFUNDED (terminal)
//   3. fulfillment_exception='refund_requested' → REFUND_REQUESTED
//   4. fulfillment_exception='disputed'        → DISPUTED
//   5. fulfillment_exception='on_hold'         → ON_HOLD
//      ALSO: sponsorship.status='paused' renders as ON_HOLD
//      (Q1 lock: DISPLAYED not WRITTEN — no exception column write
//      needed; resuming payment auto-resumes fulfillment)
//
//   6. sponsorship.status='pending_payment'    → null (donation not "in" yet)
//
//   7. Derived spine phase:
//      - child_update.status='published'        → DELIVERED
//      - child_update.status ∈ {submitted_by_di,
//        under_admin_review, approved,
//        correction_requested}                  → IN_DELIVERY   (spine 1.2)
//      - child_update.status='pending'          → IN_DELIVERY   (legacy main DI submission)
//      - task.di_status='completed_pending_verification' → IN_DELIVERY
//      - task.di_status ∈ {open, in_progress}   → PROCESSING
//      - else                                   → PENDING

import "server-only";

// ─── Input shapes ───────────────────────────────────────────────────
//
// All three inputs are minimal — only the fields the resolver actually
// reads. Callers can pass `null` for `latestTask` / `latestReport`
// when none exists for the sponsorship.

export interface SponsorshipFulfillmentInput {
  /** Stripe-driven payment axis. We READ but never WRITE this. */
  status:
    | "pending_payment"
    | "active"
    | "paused"
    | "cancelled"
    | "completed"
    | "failed"
    | string; // tolerate any future Stripe status; resolver falls through to derived
  /** Set by Stripe webhook when payment is cancelled. Surfaced on
   *  the terminal "Delivered • Sponsorship ended [date]" composite. */
  cancelled_at: string | null;
  /** Fulfillment exception axis (this sub-phase). Null = no exception. */
  fulfillment_exception:
    | "on_hold"
    | "disputed"
    | "refund_requested"
    | "refunded"
    | null;
  fulfillment_exception_at: string | null;
  /** PRIVATE — admin's full reason. Only emitted on the internal view. */
  fulfillment_reason: string | null;
  /** Curated donor-facing copy. Only emitted on the donor view. */
  fulfillment_donor_visible_reason: string | null;
}

/** Latest task on this sponsorship (`task.sponsorship = sponsorshipId`),
 *  by `date_created` desc. Null when no task exists yet. */
export interface LatestTaskInput {
  id: string;
  di_status: string; // 'open' | 'in_progress' | 'completed_pending_verification' | future
  admin_status: string;
  date_created: string | null;
}

/** Latest child_update on this sponsorship (`child_update.sponsorship =
 *  sponsorshipId`). On main, status is one of the legacy 4. On Spine
 *  1.2, includes the extended Spine statuses. Resolver accepts both. */
export interface LatestReportInput {
  id: string;
  status: string; // accepts legacy ('draft'|'pending'|'published'|'rejected') OR spine 1.2 statuses
  published_at: string | null;
}

// ─── Output shape ───────────────────────────────────────────────────

export type FulfillmentPhase =
  | "pending"
  | "processing"
  | "in_delivery"
  | "delivered"
  | "on_hold"
  | "disputed"
  | "refund_requested"
  | "refunded"
  | "cancelled";

/** "Why does the resolver think we're in this phase?" — used in the
 *  internal view to explain the inputs, and to drive admin debug
 *  surfaces. Never reaches donor. */
export type FulfillmentSource =
  | "payment_pending" // donation not yet "in"
  | "payment_cancelled" // sponsorship.status ∈ {cancelled, failed}
  | "payment_paused" // sponsorship.status='paused' → displayed as on_hold (Q1)
  | "exception" // fulfillment_exception column set
  | "spine_report_published" // latest child_update.status='published'
  | "spine_report_in_review" // latest child_update.status ∈ {submitted_by_di, ...}
  | "spine_task_completed" // task.di_status='completed_pending_verification'
  | "spine_task_active" // task.di_status ∈ {open, in_progress}
  | "spine_none"; // no task, no report

/** Full internal view. Admin / Super Admin surfaces ONLY.
 *  MUST NOT be passed to donor-facing renders verbatim. */
export interface FulfillmentInternalView {
  phase: FulfillmentPhase;
  source: FulfillmentSource;
  /** Headline. Internal-only — phrasing geared to admin context. */
  label: string;
  /** Sub-label. Internal-only. */
  detail: string | null;
  /** PRIVATE — admin's full reason for an exception. Null when no exception. */
  privateReason: string | null;
  /** Curated copy admin wrote (mirror of donor view's reason for cross-check). */
  donorVisibleReason: string | null;
  /** Q5: when the payment lifecycle ended AFTER a delivered cycle,
   *  this carries the cancellation timestamp so the donor + admin UI
   *  can render "Delivered • Sponsorship ended [date]". Null when
   *  not applicable. */
  sponsorshipEndedAt: string | null;
  /** When the current phase started, best-effort:
   *  - exception: fulfillment_exception_at
   *  - delivered: child_update.published_at
   *  - in_delivery / processing: task.date_created
   *  - cancelled: sponsorship.cancelled_at
   *  - pending: null (no signal yet) */
  since: string | null;
}

/** Donor-safe view. Renders on /dashboard/sponsorship/[id] etc.
 *  CONTAINS ONLY donor-safe strings. NEVER privateReason, NEVER Tier-3. */
export interface FulfillmentDonorView {
  phase: FulfillmentPhase;
  /** Donor-friendly headline (one source of truth — see FULFILLMENT_DONOR_COPY below). */
  headline: string;
  /** Donor-friendly subcopy. When admin set a donor_visible_reason,
   *  it appears HERE. When no curated reason was provided, the
   *  generic copy from the table renders. The private reason is
   *  never included. */
  subcopy: string;
  /** Q5 composite — when the sponsorship ended after a delivered
   *  cycle, donor sees both pieces. Null otherwise. */
  sponsorshipEndedAt: string | null;
  /** When the current phase started (for "Since X" / timeline render). */
  since: string | null;
}

export interface FulfillmentResolved {
  /** Returns null when the donation hasn't entered fulfillment yet
   *  (status='pending_payment'). Caller can show "Awaiting payment"
   *  or hide the fulfillment panel entirely. */
  internal: FulfillmentInternalView | null;
  donor: FulfillmentDonorView | null;
}

// ─── Donor copy table ───────────────────────────────────────────────
//
// Single source of truth for what donors read. When admin sets
// fulfillment_donor_visible_reason, the subcopy is REPLACED by that
// string (NOT appended) — admin can control the entire message.
//
// Keep these short, warm, and free of operational detail.

export const FULFILLMENT_DONOR_COPY: Record<
  FulfillmentPhase,
  { headline: string; subcopy: string }
> = {
  pending: {
    headline: "Your gift is queued for fieldwork",
    subcopy: "Our team will start work shortly.",
  },
  processing: {
    headline: "Our field officer is on it",
    subcopy: "Preparing your gift's delivery.",
  },
  in_delivery: {
    headline: "Almost there",
    subcopy:
      "Field evidence received — our team is reviewing before we share it with you.",
  },
  delivered: {
    headline: "Delivered",
    subcopy: "Read the update from the field.",
  },
  on_hold: {
    headline: "Briefly on hold",
    subcopy: "We've paused this temporarily. We'll resume as soon as we can.",
  },
  disputed: {
    headline: "We're looking into this",
    subcopy:
      "Our team is reviewing this delivery. You'll hear from us shortly.",
  },
  refund_requested: {
    headline: "Refund being processed",
    subcopy:
      "We've received your request. Once complete you'll see this update.",
  },
  refunded: {
    headline: "Refunded",
    subcopy: "This gift has been refunded in full.",
  },
  cancelled: {
    headline: "Cancelled",
    subcopy:
      "This gift's fulfillment has been cancelled. Contact support for details.",
  },
};

// ─── Internal copy ──────────────────────────────────────────────────
//
// Admin-facing — slightly more clinical. Includes the WHY (resolver
// source) in the detail string to help admins debug.

function internalLabelFor(phase: FulfillmentPhase): string {
  switch (phase) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "in_delivery":
      return "In delivery";
    case "delivered":
      return "Delivered";
    case "on_hold":
      return "On hold";
    case "disputed":
      return "Disputed";
    case "refund_requested":
      return "Refund requested";
    case "refunded":
      return "Refunded";
    case "cancelled":
      return "Cancelled";
  }
}

function internalDetailFor(
  source: FulfillmentSource,
  sponsorshipEndedAt: string | null,
): string | null {
  switch (source) {
    case "payment_pending":
      return "Payment not yet confirmed (sponsorship.status=pending_payment).";
    case "payment_cancelled":
      return sponsorshipEndedAt
        ? `Payment ended at ${sponsorshipEndedAt}.`
        : "Payment cancelled (sponsorship.status=cancelled or failed).";
    case "payment_paused":
      return "Displayed as on hold because payment is paused (Q1 lock — no exception column written).";
    case "exception":
      return "Fulfillment exception explicitly set by admin.";
    case "spine_report_published":
      return "Latest report has been sent to donor (child_update.status=published).";
    case "spine_report_in_review":
      return "Report is in the admin review pipeline.";
    case "spine_task_completed":
      return "DI marked the task complete (task.di_status=completed_pending_verification).";
    case "spine_task_active":
      return "DI is working on the task (task.di_status ∈ {open, in_progress}).";
    case "spine_none":
      return "No task and no report exist for this sponsorship yet.";
  }
}

// ─── The resolver ───────────────────────────────────────────────────

export function resolveFulfillment(input: {
  sponsorship: SponsorshipFulfillmentInput;
  latestTask: LatestTaskInput | null;
  latestReport: LatestReportInput | null;
}): FulfillmentResolved {
  const { sponsorship, latestTask, latestReport } = input;

  // Helper: build the dual-view return wrapping a phase + source +
  // since-timestamp. Donor view's subcopy uses the curated
  // fulfillment_donor_visible_reason if provided (only meaningful for
  // exception/cancelled phases — for happy-path phases it stays at
  // the generic copy since admin won't have written a reason).
  function emit(
    phase: FulfillmentPhase,
    source: FulfillmentSource,
    since: string | null,
    sponsorshipEndedAt: string | null = null,
  ): FulfillmentResolved {
    const internal: FulfillmentInternalView = {
      phase,
      source,
      label: internalLabelFor(phase),
      detail: internalDetailFor(source, sponsorshipEndedAt),
      privateReason: sponsorship.fulfillment_reason,
      donorVisibleReason: sponsorship.fulfillment_donor_visible_reason,
      sponsorshipEndedAt,
      since,
    };
    const baseCopy = FULFILLMENT_DONOR_COPY[phase];
    const donor: FulfillmentDonorView = {
      phase,
      headline: baseCopy.headline,
      // Subcopy precedence: curated donor_visible_reason wins ONLY when
      // the phase is exception-ish (on_hold / disputed / refund_requested /
      // refunded / cancelled) — those are the cases where admin would
      // have written a reason. For happy-path phases the generic copy
      // is always right.
      subcopy:
        (phase === "on_hold" ||
          phase === "disputed" ||
          phase === "refund_requested" ||
          phase === "refunded" ||
          phase === "cancelled") &&
        sponsorship.fulfillment_donor_visible_reason &&
        sponsorship.fulfillment_donor_visible_reason.trim().length > 0
          ? sponsorship.fulfillment_donor_visible_reason.trim()
          : baseCopy.subcopy,
      sponsorshipEndedAt,
      since,
    };
    return { internal, donor };
  }

  // ─── 1. Payment cancelled / failed — possibly with terminal composite (Q5) ───
  //
  // We branch INSIDE this case because the order is:
  //   - if a 'refunded' exception is set, that's a more specific signal
  //     than payment-cancelled (refund is fulfillment-side; cancel is
  //     payment-side; both can co-occur and refund wins)
  //   - if a refund is in progress (refund_requested), same — let case 3 handle
  //   - otherwise: if a published report exists, render Q5 terminal composite

  const isPaymentTerminal =
    sponsorship.status === "cancelled" || sponsorship.status === "failed";
  const refundedOrRequesting =
    sponsorship.fulfillment_exception === "refunded" ||
    sponsorship.fulfillment_exception === "refund_requested";

  if (isPaymentTerminal && !refundedOrRequesting) {
    if (latestReport && latestReport.status === "published") {
      // Q5: terminal composite. The phase stays "delivered" because that
      // was the last meaningful event the donor saw; sponsorshipEndedAt
      // carries the cancellation context for the UI to render
      // "Delivered • Sponsorship ended [date]".
      return emit(
        "delivered",
        "spine_report_published",
        latestReport.published_at,
        sponsorship.cancelled_at,
      );
    }
    return emit("cancelled", "payment_cancelled", sponsorship.cancelled_at);
  }

  // ─── 2-5. Exception column precedence ───

  if (sponsorship.fulfillment_exception === "refunded") {
    return emit("refunded", "exception", sponsorship.fulfillment_exception_at);
  }
  if (sponsorship.fulfillment_exception === "refund_requested") {
    return emit(
      "refund_requested",
      "exception",
      sponsorship.fulfillment_exception_at,
    );
  }
  if (sponsorship.fulfillment_exception === "disputed") {
    return emit("disputed", "exception", sponsorship.fulfillment_exception_at);
  }
  if (sponsorship.fulfillment_exception === "on_hold") {
    return emit("on_hold", "exception", sponsorship.fulfillment_exception_at);
  }

  // Q1 (locked): sponsorship.status='paused' displays as on_hold WITHOUT
  // writing the exception column. Resuming payment auto-resumes
  // fulfillment because there's no stored override to clear.
  if (sponsorship.status === "paused") {
    return emit("on_hold", "payment_paused", null);
  }

  // ─── 6. Pending payment — donation not "in" yet ───

  if (sponsorship.status === "pending_payment") {
    // Caller can choose to render nothing or "Awaiting payment". The
    // donation hasn't entered fulfillment.
    return { internal: null, donor: null };
  }

  // ─── 7. Derived spine phase ───

  // Latest report — the most-recent-cycle signal. For monthly
  // sponsors, "delivered" means the latest cycle delivered; the next
  // cycle's task creation flips it back to processing automatically.
  if (latestReport) {
    if (latestReport.status === "published") {
      return emit(
        "delivered",
        "spine_report_published",
        latestReport.published_at,
      );
    }
    if (
      latestReport.status === "submitted_by_di" ||
      latestReport.status === "under_admin_review" ||
      latestReport.status === "approved" ||
      latestReport.status === "correction_requested" ||
      latestReport.status === "pending" // legacy main DI submission
    ) {
      // In the report-review pipeline. Use the report's stored
      // creation timestamp if available — most readers fetch
      // child_update.date_created. We don't have it on the input
      // shape; fall back to published_at (will be null pre-publish)
      // or the task date.
      return emit(
        "in_delivery",
        "spine_report_in_review",
        latestReport.published_at ??
          latestTask?.date_created ??
          null,
      );
    }
    if (latestReport.status === "rejected") {
      // Admin rejected the report. The task is still alive (or
      // re-opened); fall through to the task derivation below.
    }
    if (latestReport.status === "draft") {
      // DI is still drafting; not yet evidence in the admin pipeline.
      // Fall through to task derivation.
    }
  }

  if (latestTask) {
    if (latestTask.di_status === "completed_pending_verification") {
      return emit(
        "in_delivery",
        "spine_task_completed",
        latestTask.date_created,
      );
    }
    if (
      latestTask.di_status === "open" ||
      latestTask.di_status === "in_progress"
    ) {
      return emit("processing", "spine_task_active", latestTask.date_created);
    }
  }

  // Fallback: no task, no report (or only terminal/abandoned ones).
  // sponsorship.status='active' or 'completed' with no spine activity
  // → Pending.
  return emit("pending", "spine_none", null);
}
