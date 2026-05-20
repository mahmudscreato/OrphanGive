// Session 58.3 — restore-and-wire migration.
//
// Adds `package_subtype` to donation_package so the one-time flow on
// /sponsor/[childId] can distinguish two zones:
//   - Quick-amount tiles (no fixed cause) — open presets like ৳2,000
//   - Specific gifts (fixed price + cause) — "Buy a Cycle ৳8,000" etc.
// Monthly packages get subtype 'monthly_tier' so the data layer can
// filter symmetrically.
//
// Cleanup: removes the "12 months upfront — Education Support" prepaid
// seed row added by migration 002. In Session 58.3 duration is its own
// step (3 + 4) of the sponsor flow, not a package property — that row
// is no longer correct.
//
// Reseed: 4 one_time_quick + 8 one_time_gift packages so the data path
// is exercised end-to-end. Admin can edit / add / archive freely after.
//
// Idempotent — re-runnable. Skips field if it exists, backfills only
// rows where subtype is null, and only inserts seed rows when none of
// the same name_en already exist (so admin edits aren't clobbered).
//
// Run:
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/session-58/003-add-package-subtype.mjs

const URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!URL || !TOKEN) {
  console.error("Missing env. Set NEXT_PUBLIC_DIRECTUS_URL + DIRECTUS_SERVER_TOKEN.");
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
  console.log(`  ${label.padEnd(54)} ${status}`);
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
  else note(`field ${coll}.${field.field}`, `FAIL ${r.status} ${r.text.slice(0, 150)}`);
}

// ── field def ──────────────────────────────────────────────────────

const SUBTYPE_FIELD = {
  field: "package_subtype",
  type: "string",
  meta: {
    interface: "select-dropdown",
    required: false,
    options: {
      choices: [
        { text: "Monthly tier", value: "monthly_tier" },
        { text: "One-time quick amount", value: "one_time_quick" },
        { text: "One-time specific gift", value: "one_time_gift" },
      ],
    },
    note: "Refines package_type for the /sponsor flow. Monthly → monthly_tier. One-time → quick (open amount, no cause) or gift (fixed amount + cause).",
  },
  schema: { is_nullable: true, max_length: 32 },
};

// ── backfill existing rows ─────────────────────────────────────────

async function backfillSubtypes() {
  const r = await api(
    "GET",
    "/items/donation_package?fields=id,package_type,cause_tag,package_subtype&limit=200",
  );
  if (!r.ok) {
    note("backfill subtypes", `FAIL probe ${r.status}`);
    return;
  }
  const rows = r.json?.data ?? [];
  let updated = 0;
  for (const row of rows) {
    if (row.package_subtype) continue; // already set
    let subtype;
    if (row.package_type === "monthly") {
      subtype = "monthly_tier";
    } else {
      // one_time: if cause_tag is set, it's a specific gift; otherwise
      // treat as quick amount.
      subtype = row.cause_tag ? "one_time_gift" : "one_time_quick";
    }
    const u = await api("PATCH", `/items/donation_package/${row.id}`, {
      package_subtype: subtype,
    });
    if (u.ok) updated += 1;
  }
  note("backfill subtypes", `${updated} row(s) updated`);
}

// ── delete the wrong prepaid seed from 002 ─────────────────────────

async function dropWrongPrepaidSeed() {
  // 002 inserted a single row with name_en = "12 months upfront —
  // Education Support" and duration_months = 12. The new flow puts
  // duration in its own step, so this package shouldn't exist as a
  // top-level preset anymore. Look up by name_en + duration_months
  // so we only nuke that exact seed and never a Mahmud-authored
  // duration-bearing row.
  const r = await api(
    "GET",
    "/items/donation_package?filter%5Bname_en%5D%5B_eq%5D=12%20months%20upfront%20%E2%80%94%20Education%20Support&filter%5Bduration_months%5D%5B_eq%5D=12&fields=id&limit=2",
  );
  if (!r.ok) {
    note("drop prepaid seed", `FAIL probe ${r.status}`);
    return;
  }
  const rows = r.json?.data ?? [];
  if (rows.length === 0) {
    note("drop prepaid seed", "absent (skip)");
    return;
  }
  let dropped = 0;
  for (const row of rows) {
    const d = await api("DELETE", `/items/donation_package/${row.id}`);
    if (d.ok || d.status === 204) dropped += 1;
  }
  note("drop prepaid seed", `${dropped} row(s) deleted`);
}

// ── seed new one-time rows ─────────────────────────────────────────

const QUICK_AMOUNTS = [
  { amount_bdt: 2000 },
  { amount_bdt: 5000 },
  { amount_bdt: 10000 },
  { amount_bdt: 15000 },
];

const GIFT_PACKAGES = [
  {
    name_en: "Buy a Cycle",
    description_en:
      "A bicycle so a child can get to school safely on their own.",
    amount_bdt: 8000,
    cause_tag: "cycle",
    icon: "Bike",
    display_order: 1,
  },
  {
    name_en: "Buy a Laptop",
    description_en:
      "A laptop opens up online learning, jobs, and a path forward.",
    amount_bdt: 25000,
    cause_tag: "laptop",
    icon: "Laptop",
    display_order: 2,
  },
  {
    name_en: "New Dress",
    description_en:
      "A new set of clothes — small joy that goes a long way.",
    amount_bdt: 2500,
    cause_tag: "clothing",
    icon: "Shirt",
    display_order: 3,
  },
  {
    name_en: "Healthcare Package",
    description_en:
      "A doctor's visit, medicine, and follow-up care for a child in need.",
    amount_bdt: 5000,
    cause_tag: "healthcare",
    icon: "Stethoscope",
    display_order: 4,
  },
  {
    name_en: "Eid Gift",
    description_en:
      "A special Eid for a child who otherwise wouldn't have one.",
    amount_bdt: 3000,
    cause_tag: "eid",
    icon: "Gift",
    display_order: 5,
  },
  {
    name_en: "12 Months Tuition",
    description_en:
      "A full school year of tuition for one child — paid in one gift.",
    amount_bdt: 24000,
    cause_tag: "tuition",
    icon: "GraduationCap",
    display_order: 6,
  },
  {
    name_en: "School Supplies",
    description_en:
      "Books, uniform, and supplies so a child can start the term ready.",
    amount_bdt: 1500,
    cause_tag: "supplies",
    icon: "BookOpen",
    display_order: 7,
  },
  {
    name_en: "Nutritious Meals (1 month)",
    description_en:
      "A month of nourishing meals for a child in care.",
    amount_bdt: 4000,
    cause_tag: "meals",
    icon: "Apple",
    display_order: 8,
  },
];

async function seedQuickIfAbsent() {
  // Only seed when ZERO one_time_quick rows exist. Otherwise admin has
  // already curated them and we don't touch.
  const r = await api(
    "GET",
    "/items/donation_package?filter%5Bpackage_subtype%5D%5B_eq%5D=one_time_quick&limit=1&fields=id",
  );
  if (!r.ok) {
    note("seed quick amounts", `FAIL probe ${r.status}`);
    return;
  }
  if ((r.json?.data ?? []).length > 0) {
    note("seed quick amounts", "already present (skip)");
    return;
  }
  const rows = QUICK_AMOUNTS.map((q, i) => ({
    package_type: "one_time",
    package_subtype: "one_time_quick",
    display_order: i + 1,
    is_active: true,
    name_en: `৳${q.amount_bdt.toLocaleString()} gift`,
    description_en: "Open one-time gift — used where the child needs it most.",
    amount_bdt: q.amount_bdt,
    support_types: [],
    cause_tag: null,
    icon: null,
    duration_months: null,
  }));
  const c = await api("POST", "/items/donation_package", rows);
  if (c.ok) note("seed quick amounts", `inserted ${rows.length} row(s)`);
  else note("seed quick amounts", `FAIL ${c.status} ${c.text.slice(0, 200)}`);
}

async function seedGiftsIfAbsent() {
  // Per-name idempotency: only insert gifts whose name_en isn't
  // already in the table. This lets the brief's 8 gifts coexist with
  // any pre-existing one_time_gift rows (notably the 4 from migration
  // 001 that got backfilled as gifts) without dup-key noise.
  const r = await api(
    "GET",
    "/items/donation_package?fields=name_en&filter%5Bpackage_subtype%5D%5B_eq%5D=one_time_gift&limit=200",
  );
  if (!r.ok) {
    note("seed gifts", `FAIL probe ${r.status}`);
    return;
  }
  const existing = new Set(
    (r.json?.data ?? []).map((row) => row.name_en),
  );
  const missing = GIFT_PACKAGES.filter((g) => !existing.has(g.name_en));
  if (missing.length === 0) {
    note("seed gifts", "all present (skip)");
    return;
  }
  // Bump display_order on these so they sort AFTER any pre-existing
  // gifts that already occupy the lower slots (we don't want to
  // accidentally collide).
  const rows = missing.map((g, i) => ({
    package_type: "one_time",
    package_subtype: "one_time_gift",
    display_order: 100 + i + 1, // 101, 102, …
    is_active: true,
    name_en: g.name_en,
    description_en: g.description_en,
    amount_bdt: g.amount_bdt,
    support_types: [],
    cause_tag: g.cause_tag,
    icon: g.icon,
    duration_months: null,
  }));
  const c = await api("POST", "/items/donation_package", rows);
  if (c.ok) note("seed gifts", `inserted ${rows.length} row(s)`);
  else note("seed gifts", `FAIL ${c.status} ${c.text.slice(0, 200)}`);
}

// ── main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== donation_package.package_subtype ===");
  await createField("donation_package", SUBTYPE_FIELD);

  console.log("\n=== backfill subtype on existing rows ===");
  await backfillSubtypes();

  console.log("\n=== drop wrong prepaid seed from 002 ===");
  await dropWrongPrepaidSeed();

  console.log("\n=== seed one_time_quick ===");
  await seedQuickIfAbsent();

  console.log("\n=== seed one_time_gift ===");
  await seedGiftsIfAbsent();

  console.log("\n=== cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
