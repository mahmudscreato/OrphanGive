// Mahmud — run order:
//   node scripts/cleanup-legacy-null-schedule.mjs --dry-run
//   (review output)
//   node scripts/cleanup-legacy-null-schedule.mjs --confirm
// Only run --confirm after reviewing the dry-run output.
//
// Session 22 Item 1 — one-time cleanup of pre-fix legacy
// sponsorship rows whose `payment_schedule` is NULL but which
// have a `stripe_subscription_id` set. From the Session 16 metric
// audit: 30 such rows exist, all created May 6-7 before the
// line-848 commit fix landed, and all in cancelled / paused
// status. They aren't currently affecting any metric (the strict
// homepage / dashboard queries filter on status), but they're
// data-hygiene debt that obscures what `payment_schedule = NULL`
// is supposed to mean going forward.
//
// Action per row: set `payment_schedule = "monthly"`. These were
// all monthly Stripe subscriptions pre-fix; the missing schedule
// is a write-path bug, not a true unknown.
//
// Run env: same as the other diagnostic scripts in this folder.
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)

import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  updateItem,
} from "@directus/sdk";

const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const token = process.env.DIRECTUS_SERVER_TOKEN;
if (!url || !token) {
  console.error(
    "Missing env. Run with NEXT_PUBLIC_DIRECTUS_URL + DIRECTUS_SERVER_TOKEN set.",
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const confirm = args.has("--confirm");

if (dryRun === confirm) {
  console.error(
    "Pass exactly one of --dry-run (preview) or --confirm (execute writes).",
  );
  process.exit(1);
}

const directus = createDirectus(url).with(staticToken(token)).with(rest());

// Pull every row matching the cleanup criteria. We surface the
// status + created_at so the dry-run output makes it obvious that
// the rows we're touching are exactly the ones from the metric
// audit (May 6-7, cancelled/paused).
const rows = await directus.request(
  readItems("sponsorship", {
    filter: {
      _and: [
        { stripe_subscription_id: { _nnull: true } },
        { payment_schedule: { _null: true } },
      ],
    },
    fields: [
      "id",
      "status",
      "payment_schedule",
      "stripe_subscription_id",
      "child",
      "donor",
      "date_created",
    ],
    sort: ["date_created"],
    limit: -1,
  }),
);

console.log(`\nFound ${rows.length} rows to update.\n`);

if (rows.length === 0) {
  console.log("Nothing to do — exiting.");
  process.exit(0);
}

console.log(
  `Mode: ${dryRun ? "DRY RUN (no writes)" : "CONFIRM (writes will execute)"}\n`,
);

console.log(
  "| # | id | status | created | sub_id | child | before → after |",
);
console.log("|---|---|---|---|---|---|---|");

let updated = 0;
let failed = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const childId =
    typeof r.child === "string" || typeof r.child === "number"
      ? String(r.child)
      : r.child && typeof r.child === "object" && r.child.id != null
        ? String(r.child.id)
        : "—";
  const subShort = r.stripe_subscription_id
    ? `${String(r.stripe_subscription_id).slice(0, 18)}…`
    : "—";
  const created = r.date_created
    ? String(r.date_created).slice(0, 10)
    : "—";
  const beforeAfter = `${r.payment_schedule ?? "null"} → monthly`;

  console.log(
    `| ${i + 1} | ${r.id} | ${r.status ?? "—"} | ${created} | ${subShort} | ${childId} | ${beforeAfter} |`,
  );

  if (confirm) {
    try {
      await directus.request(
        updateItem("sponsorship", r.id, { payment_schedule: "monthly" }),
      );
      updated++;
    } catch (err) {
      failed++;
      console.error(
        `  ✗ row ${r.id} failed:`,
        err?.errors?.[0]?.message ?? err?.message ?? err,
      );
    }
  }
}

console.log("\n--- Summary ---");
if (dryRun) {
  console.log(`Would update ${rows.length} row(s).`);
  console.log("Re-run with --confirm to execute.");
} else {
  console.log(`Updated: ${updated}`);
  if (failed > 0) console.log(`Failed:  ${failed}`);
  console.log(`Total candidates: ${rows.length}`);
  if (failed === 0 && updated === rows.length) {
    console.log("\n✓ All rows updated cleanly.");
  } else if (failed > 0) {
    console.log(
      "\n⚠ Some rows failed. Inspect the errors above and re-run on the failures.",
    );
    process.exit(1);
  }
}
