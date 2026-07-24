// feat/quick-donation — guest_donation collection.
//
// Pooled CAUSE donations made by GUESTS (no account). Fully ISOLATED from
// the sponsorship payment model: nothing here touches sponsorship, payment,
// or the legacy donation/donation_bucket collections. A row is created
// 'pending' by /api/donate/guest-init, marked 'succeeded' by the Stripe
// webhook's guest branch (checkout.session.completed, kind='guest_cause'),
// and 'refunded'/'disputed' by the guest refund/dispute branches.
//
// NO child link by design (founder decision: pooled cause fund). NO donor
// FK — the guest has no account; we store only the email Stripe captured.
//
// FAIL-CLOSED PERMISSIONS: like safeguarding_report / task_comment, this
// migration grants NO Directus policy access. A fresh collection has zero
// permissions, so only the app's full-access DIRECTUS_SERVER_TOKEN can
// read/write. App-side, the admin list is behind requireAdminUser and the
// init/webhook routes use the server token.
//
// SCHEMA
//   guest_donation
//     id                         uuid PK
//     status                     'pending' | 'succeeded' | 'failed'
//                                | 'refunded' | 'disputed'   (def pending)
//     donation_package           uuid M2O → donation_package (the cause;
//                                SET NULL if the package is ever deleted —
//                                the snapshots below keep the row readable)
//     cause_tag                  string   snapshot of package.cause_tag
//     package_title              string   snapshot of the package name
//     unit_amount_bdt            integer  snapshot of package.amount_bdt
//                                (null for custom-amount donations)
//     child_count                integer  1..100 (null for custom amount)
//     amount_bdt                 integer  canonical charged total in BDT
//     donor_currency_code        string   what Stripe charged (e.g. USD)
//     donor_currency_amount      integer  whole units in that currency
//     guest_email                string   captured by Stripe Checkout;
//                                filled at completion
//     stripe_checkout_session_id string
//     stripe_payment_intent_id   string
//     paid_at                    timestamp
//     created_at                 timestamp (date-created, server-set)
//
// PK NOTE: the uuid PK is passed in createCollection's fields[] — the
// proven task-detail-comments v2 pattern. Omitting fields[] makes Directus
// scaffold an AUTO-INCREMENT INTEGER id (the v1 bug that broke the
// task_comment FK).
//
// Idempotent. Re-runnable. Existing collection/fields are skipped.
//
// ⚠ DEPLOY ORDERING — run BEFORE the app build deploys (this batch also
// carries migrations/donor-deactivation-marker; run both first).
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/guest-donation/001-create-guest-donation.mjs

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
  console.log(`  ${label.padEnd(60)} ${status}`);
}

async function collectionExists(coll) {
  const r = await api("GET", `/collections/${coll}`);
  return r.status === 200;
}
async function fieldExists(coll, field) {
  const r = await api("GET", `/fields/${coll}/${field}`);
  return r.status === 200;
}

const PK = {
  field: "id",
  type: "uuid",
  meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
  schema: { is_primary_key: true, has_auto_increment: false },
};

async function createCollection(name, meta) {
  if (await collectionExists(name)) {
    note(`collection ${name}`, "exists (skip)");
    return;
  }
  const r = await api("POST", `/collections`, {
    collection: name,
    meta: {
      note: "Guest (no-account) pooled cause donations. Fail-closed: no user policy granted — app server-token only.",
      ...meta,
    },
    schema: { name },
    // uuid PK at create time — see PK NOTE in the header.
    fields: [PK],
  });
  if (r.ok) note(`collection ${name}`, "created (uuid PK)");
  else note(`collection ${name}`, `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}

async function createField(coll, field) {
  if (await fieldExists(coll, field.field)) {
    note(`field ${coll}.${field.field}`, "exists (skip)");
    return;
  }
  const r = await api("POST", `/fields/${coll}`, field);
  if (r.ok) note(`field ${coll}.${field.field}`, "created");
  else
    note(`field ${coll}.${field.field}`, `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}

async function createRelation(collection, field, related_collection, on_delete) {
  if (!(await fieldExists(collection, field))) {
    note(`relation ${collection}.${field}`, "field missing (skip)");
    return;
  }
  const r = await api("POST", `/relations`, {
    collection,
    field,
    related_collection,
    schema: { on_delete },
  });
  if (r.ok || r.status === 400) {
    note(
      `relation ${collection}.${field} → ${related_collection}`,
      r.ok ? "created" : "exists (skip)",
    );
  } else {
    note(
      `relation ${collection}.${field} → ${related_collection}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
  }
}

const FIELDS = [
  PK,
  {
    field: "status",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 2,
      required: true,
      options: {
        choices: [
          { text: "Pending", value: "pending" },
          { text: "Succeeded", value: "succeeded" },
          { text: "Failed", value: "failed" },
          { text: "Refunded", value: "refunded" },
          { text: "Disputed", value: "disputed" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "pending", max_length: 16 },
  },
  {
    field: "donation_package",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], sort: 3 },
    schema: { is_nullable: true },
  },
  {
    field: "cause_tag",
    type: "string",
    meta: { interface: "input", sort: 4 },
    schema: { is_nullable: true, max_length: 64 },
  },
  {
    field: "package_title",
    type: "string",
    meta: { interface: "input", sort: 5 },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "unit_amount_bdt",
    type: "integer",
    meta: { interface: "input", sort: 6 },
    schema: { is_nullable: true },
  },
  {
    field: "child_count",
    type: "integer",
    meta: { interface: "input", sort: 7 },
    schema: { is_nullable: true },
  },
  {
    field: "amount_bdt",
    type: "integer",
    meta: { interface: "input", sort: 8, required: true },
    schema: { is_nullable: false },
  },
  {
    field: "donor_currency_code",
    type: "string",
    meta: { interface: "input", sort: 9 },
    schema: { is_nullable: true, max_length: 8 },
  },
  {
    field: "donor_currency_amount",
    type: "integer",
    meta: { interface: "input", sort: 10 },
    schema: { is_nullable: true },
  },
  {
    field: "guest_email",
    type: "string",
    meta: { interface: "input", sort: 11 },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "stripe_checkout_session_id",
    type: "string",
    meta: { interface: "input", readonly: true, sort: 12 },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "stripe_payment_intent_id",
    type: "string",
    meta: { interface: "input", readonly: true, sort: 13 },
    schema: { is_nullable: true, max_length: 255 },
  },
  {
    field: "paid_at",
    type: "timestamp",
    meta: { interface: "datetime", sort: 14 },
    schema: { is_nullable: true },
  },
  {
    field: "created_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      sort: 15,
      special: ["date-created"],
    },
    schema: { is_nullable: true },
  },
];

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== Create guest_donation collection ===");
  await createCollection("guest_donation", {
    icon: "volunteer_activism",
    display_template: "{{package_title}} — {{status}}",
    sort_field: "created_at",
  });

  console.log("\n=== guest_donation: add fields ===");
  for (const f of FIELDS) await createField("guest_donation", f);

  console.log("\n=== Relations ===");
  // Cause package link — SET NULL so deleting a package never strands the
  // donation record (the snapshots keep it readable).
  await createRelation(
    "guest_donation",
    "donation_package",
    "donation_package",
    "SET NULL",
  );

  console.log(
    "\n=== Permissions: NONE granted (fail-closed; server-token + app gate only) ===",
  );

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
