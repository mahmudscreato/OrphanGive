// Phase 0 — accountability spine FKs.
//
// Adds two NEW NULLABLE columns so a sponsorship can be traced to the
// field work it funded:
//
//   task.sponsorship          → M2O sponsorship  (nullable)
//   child_update.sponsorship  → M2O sponsorship  (nullable)
//
// aid_delivery.sponsorship ALREADY EXISTS (added in Session 41-v3, see
// bootstrap/src/v3-register-collections.ts:186-210) and is NOT touched
// here.
//
// Schema shape mirrors aid_delivery.sponsorship exactly — confirmed via
// `GET /fields/aid_delivery/sponsorship` against local Directus:
//   type:   "uuid"
//   meta:   { interface: "select-dropdown-m2o", special: ["m2o"], required: false }
//   schema: { is_nullable: true,
//             foreign_key_table: "sponsorship",
//             foreign_key_column: "id" }
//
// Idempotent — re-runnable. Skips fields that already exist. NO
// backfill: existing task / child_update rows stay NULL on the new
// column (that's correct; tightening to NOT NULL is a future
// deferral).
//
// Run (with .env.local sourced in the current shell):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/phase-0/001-add-sponsorship-fks.mjs
//
// Run inside a container (production host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/phase-0":/m \
//     node:22-alpine \
//     node /m/001-add-sponsorship-fks.mjs

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
  // 200 = field exists. 403 / 404 = missing (Directus returns 403
  // "you don't have permission to access field … or it does not
  // exist" for missing fields under the admin token, despite the
  // admin token having full access — that's the Directus REST quirk
  // session-58's helper relied on too).
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
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
}

async function relationExists(coll, field) {
  // 200 = relation exists, otherwise missing. Same Directus quirk as
  // fieldExists.
  const r = await api("GET", `/relations/${coll}/${field}`);
  return r.status === 200;
}

async function createRelationFK(coll, field, relatedCollection, onDelete) {
  // The column-level `schema.foreign_key_table` set during POST /fields
  // is not enough — Directus REST creates the column but does NOT add
  // a Postgres FK constraint. The actual FK + ON DELETE behaviour
  // comes from a separate POST /relations call. This mirrors the
  // bootstrap two-phase pattern (v3-register-collections.ts: Phase 2
  // registers fields, Phase 4 registers relations).
  if (await relationExists(coll, field)) {
    note(`relation ${coll}.${field}`, "exists (skip)");
    return;
  }
  const body = {
    collection: coll,
    field,
    related_collection: relatedCollection,
    meta: {
      junction_field: null,
      many_collection: coll,
      many_field: field,
      one_collection: relatedCollection,
      sort_field: null,
    },
    schema: { on_delete: onDelete },
  };
  const r = await api("POST", "/relations", body);
  if (r.ok)
    note(
      `relation ${coll}.${field}`,
      `created → ${relatedCollection} (on_delete=${onDelete})`,
    );
  else
    note(
      `relation ${coll}.${field}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
}

// ─── Field definitions ──────────────────────────────────────────────
//
// One shared shape for both new columns — they're the same FK to
// sponsorship, just attached to different collections.

const SPONSORSHIP_FK_FIELD = {
  field: "sponsorship",
  type: "uuid",
  meta: {
    interface: "select-dropdown-m2o",
    special: ["m2o"],
    required: false,
    note: "Optional link to the funding sponsorship. Phase 0 accountability spine.",
  },
  schema: {
    is_nullable: true,
    foreign_key_table: "sponsorship",
    foreign_key_column: "id",
  },
};

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== Pre-check: aid_delivery.sponsorship must exist + stay untouched ===");
  if (!(await fieldExists("aid_delivery", "sponsorship"))) {
    console.error(
      "  aid_delivery.sponsorship is missing. This Phase 0 script assumes the Session 41-v3 bootstrap has been applied.",
    );
    console.error("  Run that first; then re-run this script.");
    process.exit(1);
  }
  note("field aid_delivery.sponsorship", "exists (untouched)");

  console.log("\n=== task: new field ===");
  await createField("task", SPONSORSHIP_FK_FIELD);

  console.log("\n=== child_update: new field ===");
  await createField("child_update", SPONSORSHIP_FK_FIELD);

  console.log("\n=== task: relation (Postgres FK) ===");
  await createRelationFK("task", "sponsorship", "sponsorship", "SET NULL");

  console.log("\n=== child_update: relation (Postgres FK) ===");
  await createRelationFK("child_update", "sponsorship", "sponsorship", "SET NULL");

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
