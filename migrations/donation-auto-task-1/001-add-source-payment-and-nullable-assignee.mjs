// Task system — piece #3 — schema for donation auto-tasks.
//
// Two changes to the `task` collection, both required by the
// donation → auto-task trigger (src/lib/donation-task.ts):
//
//   1. ADD  task.source_payment_id  varchar(64) NULL  UNIQUE
//      The idempotency dedupe key. Stores the PAYMENT ROW id the task
//      was auto-created from. UNIQUE is the DB-level guarantee that a
//      webhook retry / concurrent double-fire can NEVER create a
//      second task for the same payment (the second insert violates
//      the constraint and is swallowed best-effort). NULL for
//      admin-created tasks (multiple NULLs are allowed under a UNIQUE
//      constraint in Postgres, so existing rows are unaffected).
//
//   2. RELAX task.assignee → nullable
//      Auto-created tasks are UNASSIGNED when no responsible DI is
//      found (no child.assigned_di, or a campaign/no-child donation).
//      task.assignee was registered NOT NULL (bootstrap
//      v3-register-collections.ts), so unassigned system tasks need
//      the column relaxed. Admin-created tasks still always set an
//      assignee (the create API requires it) — this only enables the
//      system fallback. The FK to directus_users is preserved.
//
// Idempotent — re-runnable. The field add is guarded by a
// GET /fields/task/source_payment_id probe; the assignee relax is
// guarded by reading its current is_nullable first.
//
// NO BACKFILL. Existing task rows keep source_payment_id = NULL and
// their existing assignee — nothing breaks.
//
// Mirrors the repo's add/patch-field migration pattern (see
// migrations/donation-lifecycle-1/001-add-fulfillment-exception-fields.mjs).
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/donation-auto-task-1/001-add-source-payment-and-nullable-assignee.mjs
//
// Run inside a container (prod host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/app/migrations/donation-auto-task-1":/m \
//     node:22-alpine \
//     node /m/001-add-source-payment-and-nullable-assignee.mjs

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

async function getField(coll, field) {
  const r = await api("GET", `/fields/${coll}/${field}`);
  return r.status === 200 ? r.json?.data ?? null : null;
}

async function createField(coll, field) {
  if (await getField(coll, field.field)) {
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

async function relaxToNullable(coll, field) {
  const existing = await getField(coll, field);
  if (!existing) {
    note(`field ${coll}.${field}`, `MISSING — cannot relax (abort check)`);
    return;
  }
  if (existing.schema?.is_nullable === true) {
    note(`field ${coll}.${field}`, "already nullable (skip)");
    return;
  }
  const r = await api("PATCH", `/fields/${coll}/${field}`, {
    schema: { is_nullable: true },
    meta: { required: false },
  });
  if (r.ok) note(`field ${coll}.${field}`, "relaxed → nullable");
  else
    note(`field ${coll}.${field}`, `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}

// ─── Field definition ───────────────────────────────────────────────

const SOURCE_PAYMENT_FIELD = {
  field: "source_payment_id",
  type: "string",
  meta: {
    interface: "input",
    special: null,
    required: false,
    readonly: true,
    note:
      "Donation auto-task idempotency key — the payment ROW id this task was auto-created from. UNIQUE: a webhook retry/race can never create a second task for the same payment. NULL for admin-created tasks.",
  },
  schema: {
    is_nullable: true,
    is_unique: true,
    default_value: null,
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

  console.log("=== Pre-check: task collection exists ===");
  if (!(await getField("task", "title"))) {
    console.error(
      "  task.title is missing. This shouldn't be possible on a v3 stack.",
    );
    process.exit(1);
  }
  note("field task.title", "exists");

  console.log("\n=== task: add source_payment_id (UNIQUE idempotency key) ===");
  await createField("task", SOURCE_PAYMENT_FIELD);

  console.log("\n=== task: relax assignee → nullable (system unassigned tasks) ===");
  await relaxToNullable("task", "assignee");

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
