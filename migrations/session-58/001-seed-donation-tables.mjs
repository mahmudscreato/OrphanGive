// Session 58 — create donation_package + currency_rate collections.
//
// Idempotent: re-runnable. Skips collections that already exist,
// skips fields that already exist, and only seeds rows when the
// collection is empty (so admin edits don't get clobbered on a
// re-run).
//
// Run:
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/session-58/001-seed-donation-tables.mjs
//
// What it does, in order:
//   1. Health-check Directus.
//   2. Create donation_package collection + 13 fields.
//   3. Create currency_rate collection + 7 fields.
//   4. Grant `public` role read access on both.
//   5. Seed 8 donation_package rows + 8 currency_rate rows
//      (only when each table is empty).
//   6. POST /utils/cache/clear.
//
// Why fetch and not @directus/sdk: schema-creation requests in the
// SDK route through the same REST endpoints anyway, and fetch keeps
// the script dependency-free + easy to read.

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

// ---------- helpers ----------

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
    /* non-JSON response — keep text */
  }
  return { status: res.status, ok: res.ok, json, text };
}

function note(label, status) {
  const pad = label.padEnd(48);
  console.log(`  ${pad} ${status}`);
}

async function collectionExists(name) {
  const r = await api("GET", `/collections/${name}`);
  return r.status === 200;
}

async function fieldExists(collection, field) {
  const r = await api("GET", `/fields/${collection}/${field}`);
  return r.status === 200;
}

async function createCollection(name, opts = {}) {
  if (await collectionExists(name)) {
    note(`collection ${name}`, "exists (skip)");
    return;
  }
  const body = {
    collection: name,
    schema: { name },
    meta: {
      icon: opts.icon || "list_alt",
      note: opts.note || null,
      display_template: opts.displayTemplate || null,
      sort_field: opts.sortField || null,
      archive_field: null,
      archive_value: null,
      unarchive_value: null,
      singleton: false,
      hidden: false,
    },
    fields: [
      // The PK has to be in the create-collection payload; subsequent
      // /fields POSTs cannot redefine it. uuid + auto-generated.
      {
        field: "id",
        type: "uuid",
        meta: {
          hidden: true,
          readonly: true,
          interface: "input",
          special: ["uuid"],
        },
        schema: { is_primary_key: true, length: 36, has_auto_increment: false },
      },
    ],
  };
  const r = await api("POST", "/collections", body);
  if (r.ok) note(`collection ${name}`, "created");
  else note(`collection ${name}`, `FAIL ${r.status} ${r.text.slice(0, 150)}`);
}

async function createField(collection, field) {
  if (await fieldExists(collection, field.field)) {
    note(`  field ${collection}.${field.field}`, "exists (skip)");
    return;
  }
  const r = await api("POST", `/fields/${collection}`, field);
  if (r.ok) note(`  field ${collection}.${field.field}`, "created");
  else
    note(
      `  field ${collection}.${field.field}`,
      `FAIL ${r.status} ${r.text.slice(0, 150)}`,
    );
}

async function isCollectionEmpty(collection) {
  const r = await api("GET", `/items/${collection}?limit=1&fields=id`);
  if (!r.ok || !r.json) return false;
  return (r.json.data || []).length === 0;
}

async function insertRows(collection, rows) {
  if (rows.length === 0) return;
  if (!(await isCollectionEmpty(collection))) {
    note(`seed ${collection}`, `skipped (not empty)`);
    return;
  }
  const r = await api("POST", `/items/${collection}`, rows);
  if (r.ok) note(`seed ${collection}`, `inserted ${rows.length} rows`);
  else
    note(
      `seed ${collection}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
}

async function grantPublicRead(collection) {
  // Look up the public role id (Directus seeds it; id is stable per
  // instance but we resolve by name to be safe).
  const roles = await api("GET", "/roles?filter[name][_eq]=Public");
  const publicId =
    (roles.json?.data || []).find((r) => r.name === "Public")?.id || null;

  // Directus 11+ permissions are policy-based; the public policy is
  // the one with `name = "Public"` on the policies endpoint. We try
  // both old-style (role-based) and new-style (policy-based) so the
  // script works across versions.
  const policies = await api("GET", "/policies?filter[name][_eq]=Public");
  const publicPolicyId =
    (policies.json?.data || []).find((p) => p.name === "Public")?.id || null;

  const body = {
    collection,
    action: "read",
    fields: ["*"],
    permissions: {},
    validation: {},
  };
  if (publicPolicyId) body.policy = publicPolicyId;
  if (publicId && !publicPolicyId) body.role = publicId;

  if (!body.policy && !body.role) {
    note(`public read on ${collection}`, "skipped (no Public role/policy)");
    return;
  }

  // Check whether the permission already exists so re-runs don't
  // create duplicates.
  const filterField = body.policy ? "policy" : "role";
  const filterValue = body.policy || body.role;
  const existing = await api(
    "GET",
    `/permissions?filter[collection][_eq]=${collection}&filter[action][_eq]=read&filter[${filterField}][_eq]=${filterValue}`,
  );
  if (existing.json?.data?.length) {
    note(`public read on ${collection}`, "exists (skip)");
    return;
  }

  const r = await api("POST", "/permissions", body);
  if (r.ok) note(`public read on ${collection}`, "granted");
  else
    note(
      `public read on ${collection}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
}

// ---------- field definitions ----------

const DONATION_PACKAGE_FIELDS = [
  {
    field: "package_type",
    type: "string",
    meta: {
      interface: "select-dropdown",
      special: null,
      required: true,
      options: {
        choices: [
          { text: "Monthly", value: "monthly" },
          { text: "One-time", value: "one_time" },
        ],
      },
    },
    schema: { is_nullable: false, default_value: "monthly", max_length: 16 },
  },
  {
    field: "display_order",
    type: "integer",
    meta: { interface: "input", required: true, width: "half" },
    schema: { is_nullable: false, default_value: 0 },
  },
  {
    field: "is_active",
    type: "boolean",
    meta: { interface: "boolean", required: true, width: "half" },
    schema: { is_nullable: false, default_value: true },
  },
  {
    field: "name_en",
    type: "string",
    meta: { interface: "input", required: true, translations: null },
    schema: { is_nullable: false, max_length: 120 },
  },
  {
    field: "name_bn",
    type: "string",
    meta: { interface: "input", required: false },
    schema: { is_nullable: true, max_length: 120 },
  },
  {
    field: "description_en",
    type: "text",
    meta: { interface: "input-multiline", required: true },
    schema: { is_nullable: false },
  },
  {
    field: "description_bn",
    type: "text",
    meta: { interface: "input-multiline", required: false },
    schema: { is_nullable: true },
  },
  {
    field: "amount_bdt",
    type: "integer",
    meta: {
      interface: "input",
      required: true,
      note: "Whole BDT (no paisa). Donor-facing amount is computed from the active currency rate.",
    },
    schema: { is_nullable: false },
  },
  {
    field: "support_types",
    type: "json",
    meta: {
      interface: "tags",
      special: ["cast-json"],
      options: {
        presets: [
          "education",
          "food",
          "healthcare",
          "clothing",
          "general_care",
          "other",
        ],
      },
      note: "Subset of child.support_type values. Empty array OK for non-child-scoped one-time gifts.",
    },
    schema: { is_nullable: false, default_value: "[]" },
  },
  {
    field: "cause_tag",
    type: "string",
    meta: {
      interface: "input",
      required: false,
      note: "For one-time campaigns only (e.g. feed-a-child). Null on monthly.",
    },
    schema: { is_nullable: true, max_length: 64 },
  },
  {
    field: "icon",
    type: "string",
    meta: {
      interface: "input",
      required: false,
      note: "Lucide icon name (e.g. BookOpen, Apple, Heart).",
    },
    schema: { is_nullable: true, max_length: 48 },
  },
  {
    field: "date_created",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      hidden: true,
      special: ["date-created"],
      width: "half",
    },
    schema: { is_nullable: true },
  },
  {
    field: "date_updated",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      hidden: true,
      special: ["date-updated"],
      width: "half",
    },
    schema: { is_nullable: true },
  },
];

const CURRENCY_RATE_FIELDS = [
  {
    field: "currency_code",
    type: "string",
    meta: {
      interface: "input",
      required: true,
      note: "ISO 4217. Uppercase. Unique.",
    },
    schema: { is_nullable: false, max_length: 3, is_unique: true },
  },
  {
    field: "display_name",
    type: "string",
    meta: { interface: "input", required: true },
    schema: { is_nullable: false, max_length: 64 },
  },
  {
    field: "symbol",
    type: "string",
    meta: { interface: "input", required: true },
    schema: { is_nullable: false, max_length: 8 },
  },
  {
    field: "bdt_per_unit",
    type: "decimal",
    meta: {
      interface: "input",
      required: true,
      note: "How many BDT = 1 unit of this currency. BDT itself = 1.00. Padded rates protect against FX swings.",
    },
    schema: {
      is_nullable: false,
      numeric_precision: 10,
      numeric_scale: 2,
    },
  },
  {
    field: "is_active",
    type: "boolean",
    meta: { interface: "boolean", required: true },
    schema: { is_nullable: false, default_value: true },
  },
  {
    field: "date_updated",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      hidden: true,
      special: ["date-updated"],
    },
    schema: { is_nullable: true },
  },
];

// ---------- seed data ----------

const PACKAGE_SEED = [
  // Monthly (4)
  {
    package_type: "monthly",
    display_order: 1,
    is_active: true,
    name_en: "Education Support",
    description_en:
      "Covers tuition, books, school supplies, and uniforms.",
    amount_bdt: 2000,
    support_types: ["education"],
    cause_tag: null,
    icon: "BookOpen",
  },
  {
    package_type: "monthly",
    display_order: 2,
    is_active: true,
    name_en: "Education + Nutrition",
    description_en:
      "Adds nutritious daily meals to the education package.",
    amount_bdt: 3500,
    support_types: ["education", "food"],
    cause_tag: null,
    icon: "Apple",
  },
  {
    package_type: "monthly",
    display_order: 3,
    is_active: true,
    name_en: "Comprehensive Care",
    description_en:
      "Education, nutrition, and health checkups for one child.",
    amount_bdt: 5000,
    support_types: ["education", "food", "healthcare"],
    cause_tag: null,
    icon: "Heart",
  },
  {
    package_type: "monthly",
    display_order: 4,
    is_active: true,
    name_en: "Full Family Support",
    description_en:
      "Comprehensive sponsorship including family-level support.",
    amount_bdt: 8000,
    support_types: ["education", "food", "healthcare", "general_care"],
    cause_tag: null,
    icon: "Users",
  },
  // One-time (4)
  {
    package_type: "one_time",
    display_order: 1,
    is_active: true,
    name_en: "Feed a child for a week",
    description_en:
      "One week of nourishing meals for a child in care.",
    amount_bdt: 1500,
    support_types: [],
    cause_tag: "feed-a-child",
    icon: "Utensils",
  },
  {
    package_type: "one_time",
    display_order: 2,
    is_active: true,
    name_en: "Winter clothing",
    description_en:
      "A warm jacket and winter essentials for the cold season.",
    amount_bdt: 3000,
    support_types: [],
    cause_tag: "winter-clothing",
    icon: "Shirt",
  },
  {
    package_type: "one_time",
    display_order: 3,
    is_active: true,
    name_en: "Emergency medical aid",
    description_en:
      "Doctor's visit, medicine, and follow-up care.",
    amount_bdt: 6000,
    support_types: [],
    cause_tag: "emergency-aid",
    icon: "Stethoscope",
  },
  {
    package_type: "one_time",
    display_order: 4,
    is_active: true,
    name_en: "One month of full support",
    description_en:
      "A single gift that covers a child for a full month.",
    amount_bdt: 12000,
    support_types: [],
    cause_tag: "monthly-one-time",
    icon: "Calendar",
  },
];

const CURRENCY_SEED = [
  { currency_code: "BDT", display_name: "Bangladeshi Taka", symbol: "৳", bdt_per_unit: 1.0, is_active: true },
  { currency_code: "USD", display_name: "US Dollar", symbol: "$", bdt_per_unit: 110.0, is_active: true },
  { currency_code: "GBP", display_name: "British Pound", symbol: "£", bdt_per_unit: 140.0, is_active: true },
  { currency_code: "SGD", display_name: "Singapore Dollar", symbol: "S$", bdt_per_unit: 82.0, is_active: true },
  { currency_code: "EUR", display_name: "Euro", symbol: "€", bdt_per_unit: 120.0, is_active: true },
  { currency_code: "AUD", display_name: "Australian Dollar", symbol: "A$", bdt_per_unit: 72.0, is_active: true },
  { currency_code: "CAD", display_name: "Canadian Dollar", symbol: "C$", bdt_per_unit: 80.0, is_active: true },
  { currency_code: "INR", display_name: "Indian Rupee", symbol: "₹", bdt_per_unit: 1.31, is_active: true },
];

// ---------- main ----------

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    console.error(ping.text.slice(0, 300));
    process.exit(1);
  }
  console.log("Health: ok\n");

  // donation_package
  console.log("=== donation_package ===");
  await createCollection("donation_package", {
    icon: "redeem",
    note: "Editable monthly + one-time donation presets shown on /sponsor and /donate.",
    displayTemplate: "{{name_en}} — {{amount_bdt}} BDT",
    sortField: "display_order",
  });
  for (const f of DONATION_PACKAGE_FIELDS) await createField("donation_package", f);
  await grantPublicRead("donation_package");
  await insertRows("donation_package", PACKAGE_SEED);

  console.log("");

  // currency_rate
  console.log("=== currency_rate ===");
  await createCollection("currency_rate", {
    icon: "currency_exchange",
    note: "Per-currency BDT conversion rate. Padded against FX swings.",
    displayTemplate: "{{currency_code}} ({{symbol}}) — {{bdt_per_unit}} BDT",
    sortField: "currency_code",
  });
  for (const f of CURRENCY_RATE_FIELDS) await createField("currency_rate", f);
  await grantPublicRead("currency_rate");
  await insertRows("currency_rate", CURRENCY_SEED);

  console.log("");
  console.log("=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:");
  console.error(err);
  process.exit(1);
});
