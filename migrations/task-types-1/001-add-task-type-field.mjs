// Task system — piece #2 — add a `type` column to `task`.
//
// Tasks were freeform (no type). This adds ONE new column so tasks
// can be categorised + quick-created from templates:
//
//   task.type   varchar(32) NULL  default 'general'
//               enum: 'need_report' | 'delivery_photos' | 'need_moments'
//                   | 'health_check' | 'general' | 'custom'
//
// The structured value is what the app stores; the quick-create
// templates (src/lib/task-templates.ts) only supply pre-fill copy.
//
// EXISTING ROWS STAY VALID — do not break anything:
//   - The column is NULLABLE with a default of 'general'. Postgres
//     backfills existing rows to 'general' when a non-null default is
//     given on ADD COLUMN (fast metadata-only op on PG11+). Even if a
//     given stack leaves them NULL, the app coerces null/unknown →
//     'general' at read time (admin-tasks.ts rowToAdminTaskRow,
//     mirroring how it already coerces di_status/admin_status). So a
//     pre-existing typeless task reads as "General" either way.
//   - No other task column is touched. di_status / admin_status /
//     priority / verify fields are all left exactly as-is.
//
// Idempotent — re-runnable. The field POST is guarded by a
// GET /fields/task/type probe; an existing field is skipped.
//
// Mirrors the repo's existing add-field migration pattern verbatim
// (see migrations/donation-lifecycle-1/001-add-fulfillment-exception-fields.mjs).
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/task-types-1/001-add-task-type-field.mjs
//
// Run inside a container (prod host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/app/migrations/task-types-1":/m \
//     node:22-alpine \
//     node /m/001-add-task-type-field.mjs

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

async function fieldExists(coll, field) {
  // 200 = field exists. 403/404 = missing (Directus REST quirk —
  // both responses indicate "not there" under the admin token).
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

// ─── Field definition ───────────────────────────────────────────────

const FIELDS = [
  {
    field: "type",
    type: "string",
    meta: {
      interface: "select-dropdown",
      special: null,
      required: false,
      options: {
        choices: [
          { text: "Need report", value: "need_report" },
          { text: "Delivery photos", value: "delivery_photos" },
          { text: "Need moments", value: "need_moments" },
          { text: "Health check", value: "health_check" },
          { text: "General", value: "general" },
          { text: "Custom", value: "custom" },
        ],
      },
      note:
        "Task type — drives the quick-create templates. Default 'general'. Tasks created before this column read as 'general'.",
    },
    schema: {
      is_nullable: true,
      default_value: "general",
    },
  },
];

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log(
    "=== Pre-check: task collection exists + existing axes untouched ===",
  );
  if (!(await fieldExists("task", "title"))) {
    console.error(
      "  task.title is missing. This shouldn't be possible on a v3 stack.",
    );
    process.exit(1);
  }
  note("field task.title", "exists");
  note("fields task.di_status / task.admin_status", "untouched (not modified)");

  console.log("\n=== task: add type field ===");
  for (const f of FIELDS) {
    await createField("task", f);
  }

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
