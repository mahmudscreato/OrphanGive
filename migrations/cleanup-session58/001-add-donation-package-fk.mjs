// Session-58 cleanup — add the missing Postgres FK constraint for
// sponsorship.donation_package.
//
// Why this exists
// ---------------
// Session-58/002-extend-sponsorship-and-package.mjs added the
// `sponsorship.donation_package` column with `schema.foreign_key_table:
// "donation_package"` in the POST /fields body. Directus's REST API
// accepts that nested field, creates the uuid column, and stores the
// metadata — but it does NOT create a Postgres FK constraint. The
// actual FK comes from a separate POST /relations call.
//
// Phase 0 (feature/phase-0-foundation) hit this exact pattern when
// adding task.sponsorship + child_update.sponsorship and resolved it
// by using a two-step migration (POST /fields, then POST /relations).
// This cleanup script applies the same fix retroactively to
// sponsorship.donation_package.
//
// Pre-flight verification (run before authoring this script):
// - psql confirmed: column exists, FK constraint missing.
// - Orphan-row check: 102 sponsorship rows, 27 with non-null
//   donation_package, 0 referencing a non-existent package id. Safe
//   to add the constraint with no backfill / no data deletion.
//
// ON DELETE choice: SET NULL.
// - donation_package is OPTIONAL metadata (null for custom-amount
//   donations, per the column's own Directus note).
// - If admin ever hard-deletes a package row, the sponsorship's
//   historic package link should DETACH (set null), not cascade-delete
//   the sponsorship — losing payment + donor data is a far worse
//   outcome than losing the historic label.
// - Matches the SET NULL choice already in place for sponsorship.child
//   and sponsorship.donor on the same table.
//
// Idempotent — re-runnable. Probes GET /relations/sponsorship/donation_package
// (200 = exists; anything else = missing) and skips if already wired.
//
// Run (with .env.local sourced in the current shell):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/cleanup-session58/001-add-donation-package-fk.mjs
//
// Run inside a container (production host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/cleanup-session58":/m \
//     node:22-alpine \
//     node /m/001-add-donation-package-fk.mjs

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

const COLLECTION = "sponsorship";
const FIELD = "donation_package";
const RELATED_COLLECTION = "donation_package";
const ON_DELETE = "SET NULL";

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
  // 200 = field exists; 403/404 = missing.
  const r = await api("GET", `/fields/${coll}/${field}`);
  return r.status === 200;
}

async function relationExists(coll, field) {
  // 200 = relation registered; anything else = missing.
  const r = await api("GET", `/relations/${coll}/${field}`);
  return r.status === 200;
}

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== Pre-check: column must already exist (session-58/002) ===");
  if (!(await fieldExists(COLLECTION, FIELD))) {
    console.error(
      `  ${COLLECTION}.${FIELD} column is missing — session-58/002 must run first.`,
    );
    process.exit(1);
  }
  note(`field ${COLLECTION}.${FIELD}`, "exists (untouched)");

  console.log("\n=== Relation (Postgres FK constraint) ===");
  if (await relationExists(COLLECTION, FIELD)) {
    note(`relation ${COLLECTION}.${FIELD}`, "exists (skip)");
  } else {
    const body = {
      collection: COLLECTION,
      field: FIELD,
      related_collection: RELATED_COLLECTION,
      meta: {
        junction_field: null,
        many_collection: COLLECTION,
        many_field: FIELD,
        one_collection: RELATED_COLLECTION,
        sort_field: null,
      },
      schema: { on_delete: ON_DELETE },
    };
    const r = await api("POST", "/relations", body);
    if (r.ok) {
      note(
        `relation ${COLLECTION}.${FIELD}`,
        `created → ${RELATED_COLLECTION} (on_delete=${ON_DELETE})`,
      );
    } else {
      note(
        `relation ${COLLECTION}.${FIELD}`,
        `FAIL ${r.status} ${r.text.slice(0, 300)}`,
      );
      process.exit(1);
    }
  }

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
