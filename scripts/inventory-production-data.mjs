// Session 31 — READ-ONLY production data inventory.
//
// Pulls every record from the operationally-significant Directus
// collections (child, donor, sponsorship, sponsorship_payment,
// child_moment, child_update, reveal_request, otp_code) and dumps
// a categorisation-ready view to stdout + a JSON snapshot file.
//
// **READ-ONLY.** This script does not write a single byte to
// Directus. It's the front-half of the pre-launch cleanup work;
// the destructive script (`pre-launch-cleanup.mjs`) is the
// back-half, gated on `--confirm`.
//
// Privacy: donor emails are masked in stdout output (first 2 chars
// + `***` + domain). The full JSON snapshot writes unmasked data
// to /tmp/orphangive-inventory-<timestamp>.json so the operator
// can grep specific records; the snapshot is intentionally NOT
// committed to the repo.
//
// Run:
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node scripts/inventory-production-data.mjs

import { createDirectus, rest, staticToken, readItems } from "@directus/sdk";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error("Missing NEXT_PUBLIC_DIRECTUS_URL or DIRECTUS_SERVER_TOKEN");
  process.exit(1);
}

const directus = createDirectus(url).with(staticToken(token)).with(rest());

function maskEmail(e) {
  if (!e || typeof e !== "string" || !e.includes("@")) return "—";
  const [local, domain] = e.split("@");
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function short(s, n = 18) {
  if (!s) return "—";
  return String(s).slice(0, n) + (String(s).length > n ? "…" : "");
}

async function safeFetch(collection, opts = {}) {
  try {
    return await directus.request(readItems(collection, { limit: -1, ...opts }));
  } catch (err) {
    console.warn(`  ✗ ${collection} fetch failed:`, err?.errors?.[0]?.message ?? err?.message ?? err);
    return [];
  }
}

console.log("\n========================================");
console.log("OrphanGive production data inventory");
console.log(`Snapshot time: ${new Date().toISOString()}`);
console.log("========================================\n");

// --- CHILD --------------------------------------------------------
// Note: `date_created` isn't readable with the configured token on
// the `child` collection; using `approved_at` for chronology.
console.log("== child collection ==");
const children = await safeFetch("child", {
  fields: [
    "id",
    "display_name",
    "status",
    "bd_division.name",
    "approved_at",
    "Photo",
  ],
  sort: ["approved_at", "display_name"],
});
console.log(`count: ${children.length}\n`);
console.log("| # | id | display_name | status | division | approved_at | photo? |");
console.log("|---|---|---|---|---|---|---|");
children.forEach((c, i) => {
  console.log(
    `| ${i + 1} | ${short(c.id, 12)} | ${c.display_name ?? "—"} | ${c.status ?? "—"} | ${c.bd_division?.name ?? "—"} | ${c.approved_at?.slice(0, 10) ?? "—"} | ${c.Photo ? "✓" : "—"} |`,
  );
});

// --- DONOR --------------------------------------------------------
console.log("\n== donor collection ==");
const donors = await safeFetch("donor", {
  fields: [
    "id",
    "first_name",
    "last_name",
    "email",
    "status",
    "og_admin_approval_status",
    "date_created",
    "og_country",
  ],
  sort: ["date_created"],
});
console.log(`count: ${donors.length}\n`);
console.log("| # | id | name | email (masked) | status | approval | country | created |");
console.log("|---|---|---|---|---|---|---|---|");
donors.forEach((d, i) => {
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || "—";
  console.log(
    `| ${i + 1} | ${short(d.id, 12)} | ${name} | ${maskEmail(d.email)} | ${d.status ?? "—"} | ${d.og_admin_approval_status ?? "—"} | ${d.og_country ?? "—"} | ${d.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- SPONSORSHIP --------------------------------------------------
console.log("\n== sponsorship collection ==");
const sponsorships = await safeFetch("sponsorship", {
  fields: [
    "id",
    "child.display_name",
    "donor.first_name",
    "donor.last_name",
    "donor.email",
    "status",
    "queue_status",
    "payment_schedule",
    "started_at",
    "ended_at",
    "stripe_subscription_id",
    "amount_usd",
    "date_created",
  ],
  sort: ["date_created"],
});
console.log(`count: ${sponsorships.length}\n`);
console.log("| # | id | child | donor | status | queue | schedule | amount | sub_id | started | created |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
sponsorships.forEach((s, i) => {
  const donorName = [s.donor?.first_name, s.donor?.last_name].filter(Boolean).join(" ") || maskEmail(s.donor?.email);
  console.log(
    `| ${i + 1} | ${short(s.id, 8)} | ${s.child?.display_name ?? "—"} | ${donorName} | ${s.status ?? "—"} | ${s.queue_status ?? "—"} | ${s.payment_schedule ?? "—"} | ${s.amount_usd ?? "—"} | ${short(s.stripe_subscription_id, 18)} | ${s.started_at?.slice(0, 10) ?? "—"} | ${s.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- SPONSORSHIP_PAYMENT ------------------------------------------
console.log("\n== sponsorship_payment collection ==");
const payments = await safeFetch("sponsorship_payment", {
  fields: ["id", "sponsorship", "amount_usd", "status", "stripe_payment_intent_id", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${payments.length} (most recent first; showing up to 20)\n`);
console.log("| # | id | sponsorship | amount | status | pi_id | created |");
console.log("|---|---|---|---|---|---|---|");
payments.slice(0, 20).forEach((p, i) => {
  const sId = typeof p.sponsorship === "string" ? p.sponsorship : p.sponsorship?.id ?? "—";
  console.log(
    `| ${i + 1} | ${short(p.id, 8)} | ${short(sId, 8)} | ${p.amount_usd ?? "—"} | ${p.status ?? "—"} | ${short(p.stripe_payment_intent_id, 18)} | ${p.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- CHILD_MOMENT (moments / updates) -----------------------------
console.log("\n== child_moment collection ==");
const moments = await safeFetch("child_moment", {
  fields: ["id", "child.display_name", "title", "status", "taken_at", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${moments.length} (showing up to 20)\n`);
console.log("| # | id | child | title | status | taken_at | created |");
console.log("|---|---|---|---|---|---|---|");
moments.slice(0, 20).forEach((m, i) => {
  console.log(
    `| ${i + 1} | ${short(m.id, 8)} | ${m.child?.display_name ?? "—"} | ${short(m.title ?? "—", 40)} | ${m.status ?? "—"} | ${m.taken_at?.slice(0, 10) ?? "—"} | ${m.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- CHILD_UPDATE -------------------------------------------------
console.log("\n== child_update collection ==");
const updates = await safeFetch("child_update", {
  fields: ["id", "child.display_name", "title", "status", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${updates.length} (showing up to 20)\n`);
console.log("| # | id | child | title | status | created |");
console.log("|---|---|---|---|---|---|");
updates.slice(0, 20).forEach((u, i) => {
  console.log(
    `| ${i + 1} | ${short(u.id, 8)} | ${u.child?.display_name ?? "—"} | ${short(u.title ?? "—", 40)} | ${u.status ?? "—"} | ${u.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- REVEAL_REQUEST -----------------------------------------------
console.log("\n== reveal_request collection ==");
const reveals = await safeFetch("reveal_request", {
  fields: ["id", "donor.email", "child.display_name", "field_name", "status", "decided_at", "expires_at", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${reveals.length}\n`);
console.log("| # | id | donor | child | field | status | decided | expires | created |");
console.log("|---|---|---|---|---|---|---|---|---|");
reveals.forEach((r, i) => {
  console.log(
    `| ${i + 1} | ${short(r.id, 8)} | ${maskEmail(r.donor?.email)} | ${r.child?.display_name ?? "—"} | ${r.field_name ?? "—"} | ${r.status ?? "—"} | ${r.decided_at?.slice(0, 10) ?? "—"} | ${r.expires_at?.slice(0, 10) ?? "—"} | ${r.date_created?.slice(0, 10) ?? "—"} |`,
  );
});

// --- OTP_CODE -----------------------------------------------------
console.log("\n== otp_code collection ==");
const otps = await safeFetch("otp_code", {
  fields: ["id", "email", "code", "expires_at", "consumed_at", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${otps.length} (showing up to 10)\n`);
console.log("| # | id | email | expires | consumed | created |");
console.log("|---|---|---|---|---|---|");
otps.slice(0, 10).forEach((o, i) => {
  console.log(
    `| ${i + 1} | ${short(o.id, 8)} | ${maskEmail(o.email)} | ${o.expires_at?.slice(0, 16) ?? "—"} | ${o.consumed_at?.slice(0, 16) ?? "—"} | ${o.date_created?.slice(0, 16) ?? "—"} |`,
  );
});

// --- STRIPE_EVENT -------------------------------------------------
console.log("\n== stripe_event collection ==");
const stripeEvents = await safeFetch("stripe_event", {
  fields: ["id", "event_type", "processed_at", "date_created"],
  sort: ["-date_created"],
});
console.log(`count: ${stripeEvents.length} (showing 5)\n`);
console.log("| # | id | event_type | processed | created |");
console.log("|---|---|---|---|---|");
stripeEvents.slice(0, 5).forEach((e, i) => {
  console.log(
    `| ${i + 1} | ${short(e.id, 20)} | ${e.event_type ?? "—"} | ${e.processed_at?.slice(0, 16) ?? "—"} | ${e.date_created?.slice(0, 16) ?? "—"} |`,
  );
});

// --- SNAPSHOT to /tmp ---------------------------------------------
const snapshot = {
  generated_at: new Date().toISOString(),
  counts: {
    child: children.length,
    donor: donors.length,
    sponsorship: sponsorships.length,
    sponsorship_payment: payments.length,
    child_moment: moments.length,
    child_update: updates.length,
    reveal_request: reveals.length,
    otp_code: otps.length,
    stripe_event: stripeEvents.length,
  },
  children,
  donors,
  sponsorships,
  payments,
  moments,
  updates,
  reveals,
  otps,
  stripe_events_recent: stripeEvents.slice(0, 50),
};
const snapshotPath = `/tmp/orphangive-inventory-${Date.now()}.json`;
writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
console.log(`\nFull snapshot written to ${snapshotPath}`);
console.log(`(Not committed to repo. Delete after the audit ships.)\n`);
