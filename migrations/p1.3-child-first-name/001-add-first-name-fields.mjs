// P1.3 — add `first_name` to `child` and `child_proposal`.
//
// WHY THIS EXISTS
// Public surfaces today render `child.display_name`, a freeform field.
// One DI typing a surname there leaks it to every public surface
// (cards, profile H1, OG title, social previews). The privacy floor
// can't depend on data-entry discipline.
//
// THIS MIGRATION
// Adds a NEW NULLABLE column `first_name` on both `child` and
// `child_proposal`. The data layer (src/lib/child-profile-data.ts +
// src/lib/children-data.ts) is updated in this lot to render
// `first_name` on Tier-1 surfaces and reserve `display_name` for
// authed/admin/DI tiers. The proposal column mirrors so DIs can
// propose first_name through the create/update flow.
//
// Idempotent — re-runnable. Skips fields that already exist. No
// backfill: existing rows stay NULL on the new column. The data
// layer falls back to "A child" when first_name is empty, so demo
// data still renders safely. (Demo data is wiped at P1.0 before
// real DI uploads.)
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/p1.3-child-first-name/001-add-first-name-fields.mjs
//
// Run inside a container:
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/p1.3-child-first-name":/m \
//     node:22-alpine \
//     node /m/001-add-first-name-fields.mjs

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
//
// Same shape applied to both `child` and `child_proposal`. text
// (varchar 64) is more than enough for a first name; nullable so
// existing demo rows don't trip a NOT NULL constraint on apply.

const FIRST_NAME_FIELD = {
  field: "first_name",
  type: "string",
  meta: {
    interface: "input",
    special: null,
    required: false,
    width: "half",
    sort: 2, // Right after display_name in the Directus admin UI.
    note:
      "First name only — shown publicly on cards, profile, and OG metadata. Never enter a surname here. `display_name` is the internal record name (admin/DI only).",
    translations: [{ language: "en-US", translation: "First name (public)" }],
  },
  schema: {
    is_nullable: true,
    default_value: null,
    max_length: 64,
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

  console.log("=== Pre-check: child + child_proposal collections exist ===");
  if (!(await fieldExists("child", "display_name"))) {
    console.error("  child.display_name is missing. Aborting.");
    process.exit(1);
  }
  note("field child.display_name", "exists (untouched — internal record name)");
  if (!(await fieldExists("child_proposal", "display_name"))) {
    console.error("  child_proposal.display_name is missing. Aborting.");
    process.exit(1);
  }
  note("field child_proposal.display_name", "exists (untouched)");

  console.log("\n=== child: add first_name (public) ===");
  await createField("child", FIRST_NAME_FIELD);

  console.log("\n=== child_proposal: add first_name (public) ===");
  await createField("child_proposal", FIRST_NAME_FIELD);

  console.log("\n=== Cache clear ===");
  const c = await api("POST", "/utils/cache/clear");
  note("cache clear", c.ok ? "ok" : `FAIL ${c.status}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
