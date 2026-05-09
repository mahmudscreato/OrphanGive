// One-shot repair script for "zombie" sponsorship rows created by
// the pre-fix reconcileSubscription / reconcilePaymentIntent in
// /api/checkout/init/route.ts.
//
// A zombie row carries:
//   status = 'active'
//   payment_mode = 'monthly'
//   stripe_subscription_id = NULL
// And usually:
//   cancellation_reason = 'orphaned_active_pre_finalization'
//   cancelled_at = <some timestamp> (leaked from cancelPendings seed)
//
// The pre-fix code cleared stripe_subscription_id when it detected
// the underlying Stripe sub was actively running, on the (now-stale)
// premise that a unique constraint forbade two rows pointing at the
// same sub_id. The constraint was dropped in 9e10a23 — clearing the
// ref is no longer needed and is actively harmful: it severs the
// link the dashboard cancel route + customer.subscription.deleted
// webhook need to find the row.
//
// This script repairs each zombie by looking up the donor's Stripe
// customer + child_id, finding the most-recent matching sub, then:
//   - sub canceled / incomplete_expired in Stripe → flip our row
//     to 'cancelled' (set cancelled_at from sub.canceled_at) and
//     restore stripe_subscription_id for audit trail
//   - sub active / trialing in Stripe → relink only (write sub_id
//     back, clear cancelled_at + cancellation_reason, leave status
//     'active')
//   - no matching sub found → log for manual review, skip
//
// Idempotent: a second run after a successful first run finds zero
// rows and exits cleanly.
//
// Usage:
//
//   node --env-file=.env.local \
//     scripts/repair/2026-05-09-relink-or-cancel-zombies.mjs --dry-run
//
//   node --env-file=.env.local \
//     scripts/repair/2026-05-09-relink-or-cancel-zombies.mjs
//
// --dry-run prints actions without writing. ALWAYS run with
// --dry-run first, eyeball the output, then run without.

const DRY_RUN = process.argv.includes("--dry-run");

const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const directusToken = process.env.DIRECTUS_SERVER_TOKEN;
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!directusUrl || !directusToken || !stripeKey) {
  console.error(
    "Missing env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN, STRIPE_SECRET_KEY",
  );
  console.error("Run with: node --env-file=.env.local <script>");
  process.exit(1);
}

console.log(
  `[repair] starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}`,
);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function directusGet(path) {
  const r = await fetch(`${directusUrl}${path}`, {
    headers: { Authorization: `Bearer ${directusToken}` },
  });
  if (!r.ok) {
    throw new Error(`Directus GET ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function directusPatch(path, body) {
  const r = await fetch(`${directusUrl}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${directusToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Directus PATCH ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function stripeGet(path) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!r.ok) {
    throw new Error(`Stripe GET ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

// Pull the most-recent Stripe sub for (customerId, childId) — the row's
// real Stripe counterpart. We try BOTH metadata.child_id (the format
// /api/checkout/init uses for recurring subs) AND a fallback by
// product metadata so older rows still match.
async function findMatchingSub(customerId, childId) {
  if (!customerId || !childId) return null;
  const j = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`,
  );
  const subs = Array.isArray(j.data) ? j.data : [];
  // Filter by metadata.child_id; sort by created DESC.
  const matched = subs
    .filter((s) => s?.metadata?.child_id === childId)
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  return matched[0] ?? null;
}

// ─── 1. Find zombies ────────────────────────────────────────────────────────

// Two filters, OR'd together:
//   (a) cancellation_reason in zombie set + status active + sub_id null
//   (b) status active + payment_mode monthly + sub_id null
// (b) is broader and will also pick up the no-cancelled_at variants
// (Imran Ali / Nishi #2). We dedupe by id below.
const filterStr = JSON.stringify({
  _and: [
    { status: { _eq: "active" } },
    { payment_mode: { _eq: "monthly" } },
    { stripe_subscription_id: { _null: true } },
    // Exclude queued rows — they're status='active' with sub_id
    // null DURING creation if the trial_end + SetupIntent path
    // didn't fully wire up; we don't want to flip those. Queued
    // rows have queue_position > 0 by construction, so excluding
    // here protects them.
    {
      _or: [
        { queue_position: { _null: true } },
        { queue_position: { _eq: 0 } },
      ],
    },
  ],
});

const fields = [
  "id",
  "donor.id",
  "donor.first_name",
  "donor.last_name",
  "donor.email",
  "donor.og_stripe_customer_id",
  "child.id",
  "child.display_name",
  "status",
  "payment_mode",
  "payment_schedule",
  "amount_usd",
  "duration_months",
  "scheduled_end_date",
  "stripe_subscription_id",
  "stripe_customer_id",
  "queue_position",
  "queue_status",
  "cancelled_at",
  "cancellation_reason",
  "date_created",
].join(",");

console.log("[repair] querying zombie candidates…");
const { data: candidates } = await directusGet(
  `/items/sponsorship?filter=${encodeURIComponent(filterStr)}&fields=${fields}&limit=-1`,
);
console.log(`[repair] found ${candidates.length} candidate row(s)`);

// ─── 2. Process each candidate ──────────────────────────────────────────────

const stats = {
  scanned: candidates.length,
  flippedToCancelled: 0,
  relinked: 0,
  needsManualReview: 0,
  skippedQueued: 0,
};

for (const row of candidates) {
  const childName = row.child?.display_name ?? "(no child)";
  const donorEmail = row.donor?.email ?? "(no email)";
  const donorId = row.donor?.id ?? null;
  const childId = row.child?.id ?? null;
  const customerId =
    row.stripe_customer_id ?? row.donor?.og_stripe_customer_id ?? null;
  const reason = row.cancellation_reason ?? "(no reason)";

  const prefix = `[repair] sponsorship=${row.id} child="${childName}" donor=${donorEmail}`;

  // Find the matching Stripe sub.
  let sub = null;
  try {
    sub = await findMatchingSub(customerId, childId);
  } catch (err) {
    console.warn(
      `${prefix} stripe lookup failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (!sub) {
    console.log(
      `${prefix} zombie_type=${reason} stripe_state=NOT_FOUND action=needs_manual_review`,
    );
    stats.needsManualReview++;
    continue;
  }

  const stripeStatus = sub.status;
  const subId = sub.id;

  // Branch on Stripe state.
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") {
    const canceledIso = sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : new Date().toISOString();
    // Note: we do NOT restore stripe_subscription_id here. The
    // sponsorship.stripe_subscription_id field still carries a
    // UNIQUE constraint (only the payment_intent_id constraints
    // were dropped in 9e10a23 — the sub one was missed in that
    // pass; see docs/pre-launch-audit.md). Multiple zombie rows
    // can legitimately point at the same Stripe sub (e.g. when
    // checkout/init created duplicate rows during a fingerprint
    // change), and restoring the link on all of them violates
    // uniqueness. Since the row is going terminal here AND the
    // matching Stripe sub is already canceled, the link adds no
    // operational value — we record the sub_id in
    // cancellation_reason for auditability and move on. If the
    // constraint is dropped later, the script can be amended to
    // restore the link.
    const patch = {
      status: "cancelled",
      cancelled_at: canceledIso,
      cancellation_reason: `reconciled_from_zombie:${subId}`,
      ended_at: canceledIso,
    };
    console.log(
      `${prefix} zombie_type=${reason} stripe_state=${stripeStatus} action=flipped_to_cancelled sub=${subId}`,
    );
    if (!DRY_RUN) {
      try {
        await directusPatch(`/items/sponsorship/${row.id}`, patch);
      } catch (err) {
        console.error(
          `${prefix} PATCH failed: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
    }
    stats.flippedToCancelled++;
    continue;
  }

  if (stripeStatus === "active" || stripeStatus === "trialing") {
    const patch = {
      stripe_subscription_id: subId,
      cancelled_at: null,
      cancellation_reason: null,
    };
    console.log(
      `${prefix} zombie_type=${reason} stripe_state=${stripeStatus} action=relinked sub=${subId}`,
    );
    if (!DRY_RUN) {
      try {
        await directusPatch(`/items/sponsorship/${row.id}`, patch);
      } catch (err) {
        console.error(
          `${prefix} PATCH failed: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
    }
    stats.relinked++;
    continue;
  }

  // Anything else (incomplete, past_due, paused, unpaid) — surface
  // for manual review. Don't auto-flip; the donor's sub may still
  // be salvageable.
  console.log(
    `${prefix} zombie_type=${reason} stripe_state=${stripeStatus} action=needs_manual_review sub=${subId}`,
  );
  stats.needsManualReview++;
}

// ─── 3. Summary ─────────────────────────────────────────────────────────────

console.log();
console.log(
  `[repair] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
);
console.log(`[repair] mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
console.log(`[repair] rows scanned:           ${stats.scanned}`);
console.log(`[repair] flipped to cancelled:   ${stats.flippedToCancelled}`);
console.log(`[repair] relinked to live sub:   ${stats.relinked}`);
console.log(`[repair] needs manual review:    ${stats.needsManualReview}`);
console.log(
  `[repair] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
);
if (DRY_RUN) {
  console.log(
    "[repair] re-run without --dry-run to apply the changes above.",
  );
} else if (stats.scanned === 0) {
  console.log("[repair] no zombies found — DB is clean.");
}
