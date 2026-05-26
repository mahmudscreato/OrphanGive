// Spine 1.2 — extend child_update for the donor-facing report
// lifecycle.
//
// Adds 6 new NULLABLE columns to child_update. No alter/drop of
// existing columns. Idempotent via the same skip-if-exists pattern
// Phase 0 used (migrations/phase-0/001-add-sponsorship-fks.mjs):
//   probe GET /fields/<coll>/<field> + GET /relations/<coll>/<field>
//   for 200 (exists) → skip; anything else → create.
//
// New columns:
//
//   task                 uuid M2O → task (nullable, ON DELETE SET NULL)
//                        Spine 1.2 reports are typically filed against
//                        a task created in Spine 1.1, but a DI may
//                        also file an "organic" report with task=null
//                        (sponsorship FK still required).
//
//   report_type          string (nullable; new values 'progress' |
//                        'deployment'). Derived at write time from
//                        sponsorship.payment_mode: monthly → progress,
//                        one_time → deployment. Stored (not pure-
//                        derived) so admin queue filters don't need
//                        a sponsorship join per row.
//
//   donor_text           text (nullable). Admin-editable donor-facing
//                        copy. Convention: at DI-submit time
//                        donor_text is INITIALIZED to the DI's
//                        `content` so the donor reader's
//                        COALESCE(donor_text, content) always reads
//                        consistently. Admin may edit during review;
//                        the DI's `content` stays untouched as
//                        forensic record. Per docs/admin-os/
//                        02-spine-design.md v2 §1 Decision 1.
//
//   donor_text_edited_at timestamp (nullable). Set when admin's edit
//                        diverges from the DI's content; null while
//                        donor_text mirrors content.
//
//   donor_text_edited_by uuid M2O → directus_users (nullable,
//                        ON DELETE SET NULL).
//
//   correction_reason    text (nullable). Admin's body text when
//                        status flips to 'correction_requested'.
//                        Distinct from rejection_reason (terminal).
//
// New status enum values (column is varchar; values are dropdown-
// level metadata only):
//   submitted_by_di | under_admin_review | approved | correction_requested
//
// Existing values (draft | pending | published | rejected) are NOT
// removed. Legacy DI flow keeps writing 'pending'; the new
// sponsorship-tied flow writes 'submitted_by_di'. Admin queue reads
// both. Backfill window: drop 'pending' alias after legacy data is
// migrated to new flow (future phase).
//
// No data backfill. Existing rows stay at their current status.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/spine-1.2/001-extend-child-update.mjs
//
// Run in a throwaway container (production host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/spine-1.2":/m \
//     node:22-alpine \
//     node /m/001-extend-child-update.mjs

const URL = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_SERVER_TOKEN;

if (!URL || !TOKEN) {
  console.error(
    "Missing env. Run with NEXT_PUBLIC_DIRECTUS_URL + DIRECTUS_SERVER_TOKEN set.",
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
  console.log(`  ${label.padEnd(56)} ${status}`);
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
  else {
    note(
      `field ${coll}.${field.field}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
    process.exit(1);
  }
}

async function relationExists(coll, field) {
  const r = await api("GET", `/relations/${coll}/${field}`);
  return r.status === 200;
}

async function createRelation(coll, field, relatedCollection, onDelete) {
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
  else {
    note(
      `relation ${coll}.${field}`,
      `FAIL ${r.status} ${r.text.slice(0, 200)}`,
    );
    process.exit(1);
  }
}

// ─── Field definitions ──────────────────────────────────────────────

const NEW_FIELDS = [
  {
    field: "task",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      required: false,
      note: "Optional link to the field task that produced this report (Spine 1.1).",
    },
    schema: {
      is_nullable: true,
      foreign_key_table: "task",
      foreign_key_column: "id",
    },
  },
  {
    field: "report_type",
    type: "string",
    meta: {
      interface: "select-dropdown",
      required: false,
      options: {
        choices: [
          { text: "Progress (monthly sponsor)", value: "progress" },
          { text: "Deployment (one-time donor)", value: "deployment" },
        ],
      },
      note: "Derived at write time from sponsorship.payment_mode. monthly → progress; one_time → deployment.",
    },
    schema: { is_nullable: true, max_length: 32 },
  },
  {
    field: "donor_text",
    type: "text",
    meta: {
      interface: "input-multiline",
      required: false,
      note: "Admin-editable donor-facing copy. Initialized to the DI's content at submit; admin may polish during review. DI's content stays untouched as forensic record.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "donor_text_edited_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      required: false,
      note: "Set when admin's edit diverges from the DI's content.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "donor_text_edited_by",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      required: false,
      note: "Admin who edited donor_text. ON DELETE SET NULL — audit trail still resolves via audit_log.",
    },
    schema: {
      is_nullable: true,
      foreign_key_table: "directus_users",
      foreign_key_column: "id",
    },
  },
  {
    field: "correction_reason",
    type: "text",
    meta: {
      interface: "input-multiline",
      required: false,
      note: "Admin's body text when status='correction_requested'. Surfaced to the DI; distinct from rejection_reason (terminal).",
    },
    schema: { is_nullable: true },
  },
];

// ─── Status enum dropdown choices (column is varchar; this is just
//     a dropdown metadata patch for Directus admin UI) ────────────

const NEW_STATUS_CHOICES = [
  { text: "Draft", value: "draft" },
  { text: "Pending (legacy)", value: "pending" },
  { text: "Submitted by DI", value: "submitted_by_di" },
  { text: "Under admin review", value: "under_admin_review" },
  { text: "Approved (ready to send)", value: "approved" },
  { text: "Correction requested", value: "correction_requested" },
  { text: "Published (sent to donor)", value: "published" },
  { text: "Rejected", value: "rejected" },
];

async function patchStatusChoices() {
  // Patch the existing status field's meta.options.choices. Idempotent
  // by writing the canonical list every run (no harm).
  const r = await api("PATCH", "/fields/child_update/status", {
    meta: {
      interface: "select-dropdown",
      options: { choices: NEW_STATUS_CHOICES },
      note: "Spine 1.2 lifecycle: draft → submitted_by_di → under_admin_review → approved → published (1.3 send). correction_requested loops back to DI. Legacy `pending` still accepted; new sponsorship-tied writes use `submitted_by_di`.",
    },
  });
  if (r.ok) note("status enum choices", "patched");
  else
    note(
      "status enum choices",
      `WARN ${r.status} ${r.text.slice(0, 200)} (non-fatal — column is varchar so values still write)`,
    );
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== Pre-check: child_update + Phase 0 sponsorship FK ===");
  if (!(await fieldExists("child_update", "sponsorship"))) {
    console.error(
      "  child_update.sponsorship is missing. Phase 0 (migrations/phase-0/001) must run first.",
    );
    process.exit(1);
  }
  note("field child_update.sponsorship", "exists (Phase 0; untouched)");

  console.log("\n=== child_update: new fields ===");
  for (const f of NEW_FIELDS) await createField("child_update", f);

  console.log("\n=== child_update: relations (Postgres FK constraints) ===");
  // task FK → task table
  await createRelation("child_update", "task", "task", "SET NULL");
  // donor_text_edited_by FK → directus_users
  await createRelation(
    "child_update",
    "donor_text_edited_by",
    "directus_users",
    "SET NULL",
  );

  console.log("\n=== child_update.status: dropdown choices ===");
  await patchStatusChoices();

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
