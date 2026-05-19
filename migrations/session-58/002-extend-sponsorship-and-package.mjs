// Session 58.2 — schema extensions to unblock the full donations build.
//
// Two collections touched:
//
//   sponsorship
//     - child: was required + NOT NULL. Now nullable so campaign-style
//       one-time donations (feed-a-child, winter-clothing, etc.) can be
//       represented without inventing a placeholder child id.
//     - + cause_tag           (string, nullable) — denormalized from
//                              donation_package.cause_tag at checkout
//                              time so "show me all feed-a-child gifts"
//                              is a single-table filter.
//     - + donation_package    (M2O FK → donation_package.id, nullable)
//                              records which preset was selected. Null
//                              for custom amounts.
//     - + donor_currency_code (string, nullable) — the currency the
//                              donor actually saw and was charged in
//                              (e.g. "GBP"). Null on legacy rows.
//     - + donor_currency_amount (decimal(10,2), nullable) — the donor-
//                              currency amount (e.g. 14.00 for £14).
//     - + bdt_per_unit_at_checkout (decimal(10,2), nullable) — the FX
//                              rate snapshot. If Mahmud changes rates
//                              in the admin after a charge, the historic
//                              row keeps its original rate so finance
//                              reconciliation is deterministic.
//
//   donation_package
//     - + duration_months (integer, nullable) — null = open-ended monthly
//                          subscription; positive integer = prepaid
//                          bundle of that many months as a single
//                          upfront charge. Only meaningful on
//                          package_type=monthly.
//
// Plus one seed row demonstrating a 12-month prepaid bundle so the data
// path is exercised end-to-end. CRITICAL: no discount / savings copy.
// The value is convenience (one charge, no recurring card) and
// commitment, not price.
//
// Idempotent — re-runnable; skips fields that already exist; only seeds
// the prepaid example if no prepaid row exists yet.
//
// Run:
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/session-58/002-extend-sponsorship-and-package.mjs

const URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!URL || !TOKEN) {
  console.error(
    "Missing env. Run with NEXT_PUBLIC_DIRECTUS_URL + DIRECTUS_SERVER_TOKEN set.",
  );
  console.error(
    'Try: export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)',
  );
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

async function api(method, path, body) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { ...auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, ok: res.ok, json, text };
}

function note(label, status) {
  console.log(`  ${label.padEnd(50)} ${status}`);
}

async function fieldExists(coll, field) {
  const r = await api("GET", `/fields/${coll}/${field}`);
  return r.status === 200;
}

async function createField(coll, field) {
  if (await fieldExists(coll, field.field)) {
    note(`field ${coll}.${field.field}`, "exists (skip)");
    return;
  }
  const r = await api("POST", `/fields/${coll}`, field);
  if (r.ok) note(`field ${coll}.${field.field}`, "created");
  else
    note(
      `field ${coll}.${field.field}`,
      `FAIL ${r.status} ${r.text.slice(0, 150)}`,
    );
}

async function relaxRequired(coll, field) {
  // Drop both Directus's metadata-level required: true and the Postgres
  // NOT NULL. Both layers enforce; we have to clear both.
  const r = await api("PATCH", `/fields/${coll}/${field}`, {
    meta: { required: false },
    schema: { is_nullable: true },
  });
  if (r.ok) note(`relax ${coll}.${field}`, "nullable");
  else
    note(
      `relax ${coll}.${field}`,
      `FAIL ${r.status} ${r.text.slice(0, 150)}`,
    );
}

// ---------- sponsorship field definitions ----------

const SPONSORSHIP_NEW_FIELDS = [
  {
    field: "cause_tag",
    type: "string",
    meta: {
      interface: "input",
      required: false,
      note: "Denormalized from donation_package.cause_tag at checkout. Used to filter campaign donations.",
    },
    schema: { is_nullable: true, max_length: 64 },
  },
  {
    field: "donation_package",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      required: false,
      options: { template: "{{name_en}}" },
      special: ["m2o"],
      note: "M2O to donation_package. Null for custom-amount donations.",
    },
    schema: {
      is_nullable: true,
      foreign_key_table: "donation_package",
      foreign_key_column: "id",
    },
  },
  {
    field: "donor_currency_code",
    type: "string",
    meta: {
      interface: "input",
      required: false,
      note: "The currency the donor actually paid in (ISO 4217). Null on legacy rows.",
    },
    schema: { is_nullable: true, max_length: 3 },
  },
  {
    field: "donor_currency_amount",
    type: "decimal",
    meta: {
      interface: "input",
      required: false,
      note: "Amount the donor saw and was charged, in donor_currency_code.",
    },
    schema: {
      is_nullable: true,
      numeric_precision: 10,
      numeric_scale: 2,
    },
  },
  {
    field: "bdt_per_unit_at_checkout",
    type: "decimal",
    meta: {
      interface: "input",
      required: false,
      note: "FX rate snapshot at checkout time. Preserved even if admin changes rates later.",
    },
    schema: {
      is_nullable: true,
      numeric_precision: 10,
      numeric_scale: 2,
    },
  },
];

// ---------- donation_package field definitions ----------

const PACKAGE_NEW_FIELDS = [
  {
    field: "duration_months",
    type: "integer",
    meta: {
      interface: "input",
      required: false,
      note: "Null = open-ended monthly subscription. Positive integer = prepaid bundle of N months as a single upfront charge. Only meaningful when package_type = monthly.",
    },
    schema: { is_nullable: true },
  },
];

// ---------- seed ----------

const PREPAID_BUNDLE_SEED = {
  package_type: "monthly",
  display_order: 5,
  is_active: true,
  name_en: "12 months upfront — Education Support",
  description_en:
    "One year of education support, paid in full upfront. Single charge to your card.",
  amount_bdt: 24000, // exactly 12 × 2000 — no discount math anywhere
  support_types: ["education"],
  cause_tag: null,
  icon: "Calendar",
  duration_months: 12,
};

async function seedPrepaidExampleIfMissing() {
  // Check whether any prepaid (duration_months > 0) row exists. Filter
  // by duration_months _nnull to side-step the "is there at least one
  // row matching" question.
  const r = await api(
    "GET",
    "/items/donation_package?filter[duration_months][_nnull]=true&limit=1&fields=id",
  );
  if (!r.ok) {
    note("seed prepaid example", `FAIL probing ${r.status}`);
    return;
  }
  if ((r.json?.data || []).length > 0) {
    note("seed prepaid example", "exists (skip)");
    return;
  }
  const create = await api("POST", "/items/donation_package", PREPAID_BUNDLE_SEED);
  if (create.ok) note("seed prepaid example", "inserted");
  else
    note(
      "seed prepaid example",
      `FAIL ${create.status} ${create.text.slice(0, 200)}`,
    );
}

// ---------- main ----------

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== sponsorship: relax child to nullable ===");
  await relaxRequired("sponsorship", "child");

  console.log("\n=== sponsorship: new fields ===");
  for (const f of SPONSORSHIP_NEW_FIELDS) await createField("sponsorship", f);

  console.log("\n=== donation_package: new fields ===");
  for (const f of PACKAGE_NEW_FIELDS) await createField("donation_package", f);

  console.log("\n=== donation_package: prepaid example seed ===");
  await seedPrepaidExampleIfMissing();

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
