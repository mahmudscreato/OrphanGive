// Donation Lifecycle — sub-phase 1 — add fulfillment exception fields
// to `sponsorship`.
//
// Per docs/admin-os/04-donation-lifecycle-design.md §B.1: the design
// recommends a HYBRID model where the happy-path fulfillment phase
// (Pending / Processing / In Delivery / Delivered) is DERIVED at read
// time from spine entities (task + child_update), and ONLY the
// exception axes (On Hold / Disputed / Refund Requested / Refunded)
// are stored. This migration adds the four columns the exception
// path needs.
//
// Adds four NEW NULLABLE columns on `sponsorship`:
//
//   fulfillment_exception              varchar(32) NULL
//                                       enum: 'on_hold' | 'disputed'
//                                          | 'refund_requested' | 'refunded'
//                                          | null (no exception)
//   fulfillment_exception_at           timestamptz NULL
//                                       when the exception was set
//   fulfillment_reason                 text NULL
//                                       PRIVATE/internal — admin's full reason.
//                                       MUST NEVER reach donor surface.
//   fulfillment_donor_visible_reason   text NULL
//                                       Curated copy admin chose to surface
//                                       to donor. Mirrors Spine 1.2's
//                                       content / donor_text privacy pattern
//                                       (forensic vs editorial).
//
// Idempotent — re-runnable. Skips fields that already exist. NO
// backfill: every existing sponsorship row stays NULL on all four
// new columns (correct — they default to "no exception", which is
// the resolver's null state). Existing payment-lifecycle behaviour
// is UNAFFECTED.
//
// FK on `fulfillment_exception_at` is NOT needed (it's a timestamp).
// No FK on any of the four columns. Therefore the two-step pattern
// (POST /fields then POST /relations) only does the /fields half.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/donation-lifecycle-1/001-add-fulfillment-exception-fields.mjs
//
// Run inside a container:
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/donation-lifecycle-1":/m \
//     node:22-alpine \
//     node /m/001-add-fulfillment-exception-fields.mjs

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

// ─── Field definitions ──────────────────────────────────────────────

const FIELDS = [
  {
    field: "fulfillment_exception",
    type: "string",
    meta: {
      interface: "select-dropdown",
      special: null,
      required: false,
      options: {
        choices: [
          { text: "On hold (admin paused fulfillment)", value: "on_hold" },
          { text: "Disputed (donor raised concern)", value: "disputed" },
          { text: "Refund requested (not yet refunded)", value: "refund_requested" },
          { text: "Refunded", value: "refunded" },
        ],
      },
      note:
        "Donation lifecycle 1 — exception axis. Null = no exception (happy path derived from spine). Separate from sponsorship.status (payment lifecycle).",
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  },
  {
    field: "fulfillment_exception_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      special: null,
      required: false,
      readonly: false,
      note: "When the fulfillment_exception was last set. Null when no exception.",
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  },
  {
    field: "fulfillment_reason",
    type: "text",
    meta: {
      interface: "input-multiline",
      special: null,
      required: false,
      note:
        "PRIVATE — admin's full reason for the exception. Audit + admin UI only. MUST NEVER reach the donor surface.",
    },
    schema: {
      is_nullable: true,
      default_value: null,
    },
  },
  {
    field: "fulfillment_donor_visible_reason",
    type: "text",
    meta: {
      interface: "input-multiline",
      special: null,
      required: false,
      note:
        "Curated donor-facing copy for the exception banner. If null, donor sees a generic phrase from the copy table. Mirrors Spine 1.2 content/donor_text pattern.",
    },
    schema: {
      is_nullable: true,
      default_value: null,
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
    "=== Pre-check: sponsorship collection exists + sponsorship.status untouched ===",
  );
  if (!(await fieldExists("sponsorship", "status"))) {
    console.error(
      "  sponsorship.status is missing. This shouldn't be possible on a v3 stack.",
    );
    process.exit(1);
  }
  note("field sponsorship.status", "exists (untouched — payment axis)");

  console.log("\n=== sponsorship: add fulfillment exception fields ===");
  for (const f of FIELDS) {
    await createField("sponsorship", f);
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
