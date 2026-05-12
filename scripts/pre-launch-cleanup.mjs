// Mahmud — DO NOT RUN until pre-launch.
// This is destructive. Run order:
//   node scripts/pre-launch-cleanup.mjs --dry-run
//   (review output carefully)
//   node scripts/pre-launch-cleanup.mjs --confirm
// After running, verify Directus admin shows expected state.
//
// Session 31 — pre-launch test-data cleanup. The Session 31
// audit (PRE_LAUNCH_DATA_AUDIT.md) categorised every visible
// production record. This script enacts the CLEANUP_TEST and
// CLEANUP_STALE actions.
//
// CRITICAL CAVEATS before --confirm:
//
//   1. STRIPE side-effects. Most of the test sponsorships have
//      a `stripe_subscription_id` set. Deleting the row in
//      Directus does NOT cancel the subscription in Stripe.
//      Active subscriptions will continue to charge. Before
//      --confirm: review the Stripe dashboard's Subscriptions
//      tab, cancel every sub_* referenced by a CLEANUP_TEST
//      row, then run this script.
//
//   2. STRIPE refunds. Any successful payment captured against
//      a test subscription should be REFUNDED in Stripe before
//      the Directus row is removed. Otherwise the Stripe
//      side carries a permanent record of a charge that no
//      OrphanGive-side record corresponds to.
//
//   3. DONOR records. This script does NOT delete donor rows.
//      The `donor` collection is access-gated by Directus's
//      policy system; the service token used by these scripts
//      can't read or write it. Donor cleanup must be done
//      manually in Directus admin (see PRE_LAUNCH_DATA_AUDIT.md
//      §Donors).
//
//   4. CHILD records are NEVER touched. The 10 active children
//      in the `child` collection are the verified, production-
//      ready listings (per Session 17 + 18 + 31). The script
//      explicitly skips the `child` collection.

import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  updateItem,
  deleteItem,
} from "@directus/sdk";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error("Missing NEXT_PUBLIC_DIRECTUS_URL or DIRECTUS_SERVER_TOKEN");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const confirm = args.has("--confirm");
const hardDelete = args.has("--hard-delete");

if (dryRun === confirm) {
  console.error(
    "Pass exactly one of --dry-run (preview) or --confirm (execute writes).",
  );
  process.exit(1);
}

if (confirm && !hardDelete) {
  console.error("");
  console.error("==========================================================");
  console.error("  --confirm without --hard-delete: SOFT cleanup mode.     ");
  console.error("  Rows will be marked status='archived' (not deleted).    ");
  console.error("  Re-run with --confirm --hard-delete for actual delete.  ");
  console.error("==========================================================");
  console.error("");
}

const directus = createDirectus(url).with(staticToken(token)).with(rest());
const logPath = `/tmp/orphangive-cleanup-${Date.now()}.log`;
const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(`${new Date().toISOString()} ${msg}`);
}

// --- TARGETS ------------------------------------------------------
//
// Per Session 31 audit, every sponsorship row currently in
// production was created during the May 6-11 2026 internal test
// window. ALL are flagged CLEANUP_TEST.
//
// Defensive query: pull ALL sponsorships, then filter by
// date_created prefix client-side. Hard-coding ids would risk
// drift if Mahmud adds more test rows before running this.
//
// PRODUCTION_CUTOFF_DATE: any sponsorship row dated AFTER this
// cutoff will be treated as production and SKIPPED. Set this to
// the moment the launch goes live — anything created before is
// test/internal.
//
// Mahmud — update this date to the moment of public launch
// before running --confirm. If the launch hasn't happened yet,
// EVERY sponsorship row counts as test.
const PRODUCTION_CUTOFF_DATE = "2099-01-01T00:00:00Z";

log(`\n========================================`);
log(`Pre-launch cleanup`);
log(`Mode: ${dryRun ? "DRY RUN (no writes)" : hardDelete ? "CONFIRM + HARD DELETE" : "CONFIRM (soft archive only)"}`);
log(`Production cutoff: ${PRODUCTION_CUTOFF_DATE}`);
log(`========================================\n`);

// --- SPONSORSHIPS -------------------------------------------------
log("== Phase 1: sponsorship cleanup ==");
const allSponsorships = await directus.request(
  readItems("sponsorship", {
    fields: [
      "id",
      "status",
      "stripe_subscription_id",
      "payment_schedule",
      "amount_usd",
      "date_created",
      "child.display_name",
      "donor.email",
      "donor.first_name",
      "donor.last_name",
    ],
    sort: ["date_created"],
    limit: -1,
  }),
);

const testSponsorships = allSponsorships.filter(
  (s) => s.date_created && s.date_created < PRODUCTION_CUTOFF_DATE,
);
log(`Found ${testSponsorships.length} sponsorship rows pre-cutoff to clean (of ${allSponsorships.length} total).\n`);

// Pre-flight warning: count rows with non-cancelled status + sub_id
const liveSubs = testSponsorships.filter(
  (s) => s.stripe_subscription_id && s.status === "active",
);
if (liveSubs.length > 0 && confirm) {
  log(`⚠⚠⚠ ${liveSubs.length} rows have status='active' AND a stripe_subscription_id.`);
  log(`   These point at LIVE Stripe subscriptions. If you have not`);
  log(`   already cancelled them in Stripe, those subs will keep`);
  log(`   charging your test cards. Cancel in Stripe first.`);
  log(`   Affected rows:`);
  liveSubs.forEach((s) => {
    log(`     ${s.id} | sub=${s.stripe_subscription_id} | child=${s.child?.display_name} | donor=${s.donor?.first_name}`);
  });
  log("");
}

log("| # | id | child | donor | status | sub_id | created | action |");
log("|---|---|---|---|---|---|---|---|");
let archived = 0, deleted = 0, failed = 0;
for (let i = 0; i < testSponsorships.length; i++) {
  const s = testSponsorships[i];
  const donorName = [s.donor?.first_name, s.donor?.last_name].filter(Boolean).join(" ") || s.donor?.email || "—";
  const subShort = s.stripe_subscription_id ? `${String(s.stripe_subscription_id).slice(0, 18)}…` : "—";
  const action = dryRun ? "WOULD " : "";
  const actionSuffix = hardDelete ? "DELETE" : "ARCHIVE";
  log(`| ${i + 1} | ${s.id} | ${s.child?.display_name ?? "—"} | ${donorName} | ${s.status} | ${subShort} | ${s.date_created?.slice(0, 10) ?? "—"} | ${action}${actionSuffix} |`);

  if (confirm) {
    try {
      if (hardDelete) {
        await directus.request(deleteItem("sponsorship", s.id));
        deleted++;
      } else {
        await directus.request(
          updateItem("sponsorship", s.id, {
            status: "archived",
          }),
        );
        archived++;
      }
    } catch (err) {
      failed++;
      log(`  ✗ row ${s.id} failed: ${err?.errors?.[0]?.message ?? err?.message ?? err}`);
    }
  }
}

log("");
log("== Phase 1 summary ==");
if (dryRun) {
  log(`Would ${hardDelete ? "delete" : "archive"} ${testSponsorships.length} sponsorship rows.`);
  log(`(Plus ${liveSubs.length} rows pointing at live Stripe subs — cancel in Stripe first.)`);
} else {
  log(`Archived: ${archived}`);
  log(`Deleted:  ${deleted}`);
  if (failed > 0) log(`Failed:   ${failed}`);
}

// --- DONORS -------------------------------------------------------
log("\n== Phase 2: donor cleanup ==");
log("Donor collection is access-gated by Directus policy — this");
log("service token cannot read or write it. Donor cleanup must");
log("be done manually in Directus admin. See PRE_LAUNCH_DATA_AUDIT.md");
log("§Donors for the list of accounts to review.\n");

// --- WRITE LOG ----------------------------------------------------
writeFileSync(logPath, logLines.join("\n") + "\n");
log(`\nFull log written to ${logPath}`);
log(`(Keep this for the post-cleanup audit trail.)\n`);

if (dryRun) {
  log("Next steps:");
  log("  1. Review the table above + flag any row that shouldn't be touched");
  log("  2. Cancel live Stripe subscriptions in the Stripe dashboard");
  log("  3. Refund any captured Stripe payments");
  log("  4. Re-run with --confirm (soft) or --confirm --hard-delete (destructive)");
} else if (failed > 0) {
  log("⚠ Partial failure. Inspect /tmp log and re-run on the failed rows.");
  process.exit(1);
}
