// fix/child-support-flow — add a QUERYABLE child reference to guest_donation.
//
// Adds a nullable `child` M2O column so one-time CHILD gifts (from the
// child-support flow on /sponsor/[childId]) record WHICH child they were for,
// replacing the metadata-only tag. The founder wants to report on gifts per
// child, which needs a real column (Stripe metadata isn't queryable in-app).
//
//   guest_donation.child   uuid  M2O → child   (nullable; SET NULL on delete)
//
// ADDITIVE + NULLABLE by design:
//   - Existing guest_donation rows have no child → stay NULL (correct).
//   - POOLED cause donations (/donate/quick, the donate strip) stay NULL.
//   - Only one-time CHILD gifts set it.
// SET NULL on child delete so the donation record survives if a child row is
// ever removed (mirrors the donation_package relation in 001).
//
// Idempotent + re-runnable: existing field/relation are skipped.
//
// ⚠ DEPLOY ORDERING — run this migration AND register the `child` field in
// Directus BEFORE the app build deploys, same as the guest_donation (001) and
// donor-deactivation-marker / og_deactivated_at migrations. The write path
// (guest-init → createPendingGuestDonation) sets guest_donation.child, which
// will error until the column exists.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/guest-donation/002-add-child-column.mjs

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

// The new child reference — nullable M2O, mirrors guest_donation.donation_package.
const CHILD_FIELD = {
  field: "child",
  type: "uuid",
  meta: {
    interface: "select-dropdown-m2o",
    special: ["m2o"],
    // After the snapshots (donor_currency_*) but before the Stripe/paid
    // columns — placement is cosmetic in the Directus admin.
    sort: 16,
    note: "One-time CHILD gift target (nullable). Pooled cause donations stay empty.",
  },
  schema: { is_nullable: true },
};

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  if (!(await collectionExists("guest_donation"))) {
    console.error(
      "guest_donation collection missing — run 001-create-guest-donation.mjs first.",
    );
    process.exit(1);
  }

  console.log("=== guest_donation: add child field ===");
  await createField("guest_donation", CHILD_FIELD);

  console.log("\n=== Relations ===");
  // SET NULL so deleting a child never strands the donation record.
  await createRelation("guest_donation", "child", "child", "SET NULL");

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
