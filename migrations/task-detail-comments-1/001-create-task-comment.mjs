// Task system — task detail comments — task_comment + task_comment_attachment.
//
// v2 — FIXES the v1 integer-PK bug: createCollection now passes the uuid
// PK in fields[] (v1 omitted fields[], so Directus auto-made an integer
// id and the comment→task_comment FK was rejected). Self-heals an
// already-broken+empty DB by dropping & recreating. See README.
//
// Internal admin↔DI comment thread on a task, with image/PDF attachments.
//
// INTERNAL ONLY — never donor-visible. Same fail-closed pattern as
// safeguarding_report: this migration grants NO Directus policy access
// to either collection. A freshly created collection has zero
// permissions, so only the app's FULL-ACCESS DIRECTUS_SERVER_TOKEN can
// read/write. App-side, every read/write is gated:
//   - admin routes behind requireAdminUser()
//   - DI routes behind requireDiUser() + the getTaskForUser scope guard
//     (a DI can only touch a task assigned to them)
// No donor route ever reads these collections.
//
// SCHEMA
//   task_comment
//     id            uuid PK
//     task          uuid M2O → task            (FK CASCADE — comments die with the task)
//     author        uuid M2O → directus_users  (FK SET NULL — keep the comment if the user is removed)
//     author_role   varchar(8)  'admin' | 'di' (set server-side from the authed session, NEVER the client)
//     body          text
//     created_at    timestamptz (date-created, server-set)
//
//   task_comment_attachment  (junction: one comment → many files)
//     id            uuid PK
//     comment       uuid M2O → task_comment    (FK CASCADE)
//     file          uuid M2O → directus_files  (FK CASCADE)
//
// Attachments reuse the EXISTING Directus file store (uploaded via
// uploadDocumentToDirectus, image/PDF only, 5 MB). The file's title
// carries the "document upload" marker so the /api/assets proxy
// classifies it PRIVATE (session-gated) — see src/lib/asset-classifier.ts.
//
// Idempotent. Re-runnable. Existing collections/fields are skipped. NO
// existing-data impact (these collections are net-new).
//
// Mirrors migrations/p5-safeguarding-report/001-create-safeguarding-report.mjs.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/task-detail-comments-1/001-create-task-comment.mjs
//
// Run inside a container (prod host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/app/migrations/task-detail-comments-1":/m \
//     node:22-alpine \
//     node /m/001-create-task-comment.mjs

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

async function createCollection(name, meta) {
  if (await collectionExists(name)) {
    note(`collection ${name}`, "exists (skip)");
    return;
  }
  const r = await api("POST", `/collections`, {
    collection: name,
    meta: {
      note: "Internal task comment thread (admin↔DI). Fail-closed: no user policy granted — app server-token only. Never donor-visible.",
      ...meta,
    },
    schema: { name },
    // CRITICAL FIX (v2): pass fields[] WITH the uuid PK.
    //
    // The original migration created collections via POST /collections
    // WITHOUT a fields[] array. Directus then auto-scaffolds a DEFAULT
    // AUTO-INCREMENT INTEGER `id` — so task_comment.id came out integer,
    // and the later explicit uuid `id` field-add was skipped ("exists").
    // The junction's uuid `comment` column could then NOT reference the
    // integer task_comment.id → the FK was rejected (500).
    //
    // Declaring the uuid PK in fields[] at create time scaffolds
    // `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` instead — matching
    // the proven bootstrap pattern (v3-register-collections.ts) and
    // making the comment↔attachment uuid FK valid.
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
    note(`relation ${collection}.${field} → ${related_collection}`, r.ok ? "created" : "exists (skip)");
  } else {
    note(
      `relation ${collection}.${field} → ${related_collection}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
  }
}

// ─── Self-heal: repair the integer-id bug from the v1 run ───────────
//
// The v1 migration created these collections with AUTO-INCREMENT INTEGER
// ids. We can't change a PK's type in place (a dependent FK + Directus
// have no clean API for it), so the repair is: DROP the broken
// collection and let the corrected create path remake it with a uuid PK.
//
// DATA-SAFE: only drops a collection whose id is NOT uuid AND that has
// ZERO rows. If a broken collection somehow has rows, we REFUSE to drop
// and abort — never destroy data.

async function idFieldType(coll) {
  // Returns 'uuid' | 'integer' | ... , or null if the collection/field
  // doesn't exist.
  const r = await api("GET", `/fields/${coll}/id`);
  if (r.status !== 200) return null;
  return r.json?.data?.type ?? null;
}

async function collectionIsEmpty(coll) {
  // Server token bypasses the fail-closed policy, so it can read items.
  // If the read fails for any reason, return false (treated as "has
  // data") so we never drop on uncertainty.
  const r = await api("GET", `/items/${coll}?limit=1&fields=id`);
  if (!r.ok) return false;
  const rows = r.json?.data;
  return Array.isArray(rows) && rows.length === 0;
}

async function dropCollection(coll) {
  const r = await api("DELETE", `/collections/${coll}`);
  if (r.ok) note(`drop ${coll}`, "dropped");
  else if (r.status === 404) note(`drop ${coll}`, "absent (skip)");
  else note(`drop ${coll}`, `FAIL ${r.status} ${r.text.slice(0, 200)}`);
}

/**
 * If `coll` exists with the integer-id bug AND is empty, drop it so the
 * create path can remake it with a uuid PK. Returns false ONLY when the
 * collection is broken but NOT empty (caller should abort). Returns true
 * for: absent, already-uuid, or broken-but-dropped.
 */
async function repairIfBroken(coll) {
  const t = await idFieldType(coll);
  if (t === null) {
    note(`repair ${coll}`, "absent — will create fresh");
    return true;
  }
  if (t === "uuid") {
    note(`repair ${coll}`, "id is uuid (already correct)");
    return true;
  }
  const empty = await collectionIsEmpty(coll);
  if (!empty) {
    note(
      `repair ${coll}`,
      `id is '${t}' but collection is NOT empty — refusing to drop`,
    );
    return false;
  }
  note(`repair ${coll}`, `id is '${t}' + empty → dropping to recreate as uuid`);
  await dropCollection(coll);
  return true;
}

// ─── Field definitions ──────────────────────────────────────────────

const PK = {
  field: "id",
  type: "uuid",
  meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
  schema: { is_primary_key: true, has_auto_increment: false },
};

const TASK_COMMENT_FIELDS = [
  PK,
  {
    field: "task",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], sort: 2, required: true },
    schema: { is_nullable: false },
  },
  {
    field: "author",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      sort: 3,
      options: { template: "{{first_name}} {{last_name}}" },
    },
    schema: { is_nullable: true },
  },
  {
    field: "author_role",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 4,
      note: "Set server-side from the authed session — never from client input.",
      options: {
        choices: [
          { text: "Admin", value: "admin" },
          { text: "Data Inputter", value: "di" },
        ],
      },
    },
    schema: { is_nullable: true, max_length: 8 },
  },
  {
    field: "body",
    type: "text",
    meta: { interface: "input-multiline", sort: 5 },
    schema: { is_nullable: true },
  },
  {
    field: "created_at",
    type: "timestamp",
    meta: { interface: "datetime", readonly: true, sort: 6, special: ["date-created"] },
    schema: { is_nullable: true },
  },
];

const TASK_COMMENT_ATTACHMENT_FIELDS = [
  PK,
  {
    field: "comment",
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], sort: 2, required: true },
    schema: { is_nullable: false },
  },
  {
    field: "file",
    type: "uuid",
    meta: { interface: "file", special: ["file"], sort: 3, required: true },
    schema: { is_nullable: false },
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

  console.log("=== Pre-check: task collection exists ===");
  if (!(await fieldExists("task", "title"))) {
    console.error("  task.title is missing. This shouldn't be possible on a v3 stack.");
    process.exit(1);
  }
  note("field task.title", "exists");

  // Self-heal the v1 integer-id bug. Drop the junction FIRST (it has a
  // file FK), then the parent. Only drops empty + broken collections;
  // a fresh DB or an already-fixed DB is a no-op.
  console.log(
    "\n=== Self-heal: repair v1 integer-id collections (if present + empty) ===",
  );
  const okJunction = await repairIfBroken("task_comment_attachment");
  const okParent = await repairIfBroken("task_comment");
  if (!okJunction || !okParent) {
    console.error(
      "\nABORT: a task_comment* collection has the integer-id bug but is NOT empty.\n" +
        "Refusing to drop data. Resolve manually (see README — Repairing the\n" +
        "broken production state) then re-run.",
    );
    process.exit(1);
  }

  console.log("\n=== Create task_comment collection ===");
  await createCollection("task_comment", {
    icon: "forum",
    display_template: "{{author_role}} · {{body}}",
    sort_field: "created_at",
  });
  console.log("\n=== task_comment: add fields ===");
  for (const f of TASK_COMMENT_FIELDS) await createField("task_comment", f);

  console.log("\n=== Create task_comment_attachment collection (junction) ===");
  await createCollection("task_comment_attachment", {
    icon: "attachment",
    hidden: true,
    display_template: "{{file}}",
  });
  console.log("\n=== task_comment_attachment: add fields ===");
  for (const f of TASK_COMMENT_ATTACHMENT_FIELDS)
    await createField("task_comment_attachment", f);

  console.log("\n=== Relations ===");
  // task_comment.task → task (CASCADE: comments removed with the task)
  await createRelation("task_comment", "task", "task", "CASCADE");
  // task_comment.author → directus_users (SET NULL: keep comment if user removed)
  await createRelation("task_comment", "author", "directus_users", "SET NULL");
  // task_comment_attachment.comment → task_comment (CASCADE)
  await createRelation("task_comment_attachment", "comment", "task_comment", "CASCADE");
  // task_comment_attachment.file → directus_files (CASCADE)
  await createRelation("task_comment_attachment", "file", "directus_files", "CASCADE");

  // INTENTIONALLY NO PERMISSION/POLICY GRANTS — fail-closed. Only the
  // app's full-access server token can read these collections; every
  // app access is gated by admin/DI auth. Do NOT grant the Admin, Data
  // Inputter, or Donor policies here.
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
