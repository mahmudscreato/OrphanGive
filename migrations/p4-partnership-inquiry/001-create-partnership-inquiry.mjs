// P4 — partnership_inquiry collection for the /for-charities reach-out form.
//
// Adult partner-organisation contact form. NOT donor data, NOT child
// data. Standard PII handling: store only in this collection, never
// log message body to disk / Sentry.
//
// SCHEMA (all NULLABLE in DB; required-ness enforced at the API layer
// via zod so the create won't ever happen with empty required cols):
//
//   id                 uuid              PK
//   organisation_name  varchar(200)      Required at API.
//   contact_name       varchar(100)      Required at API.
//   role               varchar(100)      Required at API. The submitter's title.
//   email              varchar(254)      Required at API. RFC 5321 max length.
//   phone              varchar(32)       Optional.
//   inquiry_type       varchar(32)       Enum: offer_help / need_help / partner / other.
//   message            text              Required at API. Max length enforced
//                                        at API (2000 chars).
//   source             varchar(64)       Origin page (e.g. "for-charities").
//                                        Lets us split inbound by surface
//                                        once /contact also wires.
//   status             varchar(32)       Workflow: new / reviewed / contacted /
//                                        closed. Default 'new'.
//   created_at         timestamptz       Server-set on insert (Directus default).
//   reviewed_by        uuid → users      Admin who last touched status. Nullable.
//   reviewed_at        timestamptz       When status last changed. Nullable.
//   admin_notes        text              Free-form notes admins can leave on
//                                        the row. Nullable.
//
// Idempotent. Re-runnable. Fields that exist are skipped.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/p4-partnership-inquiry/001-create-partnership-inquiry.mjs

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
      icon: "handshake",
      note: "Partner-org reach-out submissions from /for-charities.",
      display_template: "{{organisation_name}} — {{status}}",
      sort_field: "created_at",
      ...meta,
    },
    schema: { name },
  });
  if (r.ok) note(`collection ${name}`, "created");
  else
    note(`collection ${name}`, `FAIL ${r.status} ${r.text.slice(0, 200)}`);
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
    field: "id",
    type: "uuid",
    meta: {
      hidden: true,
      readonly: true,
      interface: "input",
      special: ["uuid"],
    },
    schema: { is_primary_key: true, has_auto_increment: false },
  },
  {
    field: "organisation_name",
    type: "string",
    meta: {
      interface: "input",
      required: false,
      sort: 2,
      note: "Submitter's organisation. Required at API.",
    },
    schema: { is_nullable: true, max_length: 200 },
  },
  {
    field: "contact_name",
    type: "string",
    meta: { interface: "input", sort: 3 },
    schema: { is_nullable: true, max_length: 100 },
  },
  {
    field: "role",
    type: "string",
    meta: { interface: "input", sort: 4 },
    schema: { is_nullable: true, max_length: 100 },
  },
  {
    field: "email",
    type: "string",
    meta: { interface: "input", sort: 5 },
    schema: { is_nullable: true, max_length: 254 },
  },
  {
    field: "phone",
    type: "string",
    meta: { interface: "input", sort: 6, note: "Optional." },
    schema: { is_nullable: true, max_length: 32 },
  },
  {
    field: "inquiry_type",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 7,
      options: {
        choices: [
          { text: "Offer help / can support a child", value: "offer_help" },
          { text: "Need help / NGO seeking sponsorship", value: "need_help" },
          { text: "Partnership / collaboration", value: "partner" },
          { text: "Other", value: "other" },
        ],
      },
    },
    schema: { is_nullable: true, max_length: 32 },
  },
  {
    field: "message",
    type: "text",
    meta: {
      interface: "input-multiline",
      sort: 8,
      note: "Body of the inquiry. Max 2000 chars at API.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "source",
    type: "string",
    meta: {
      interface: "input",
      sort: 9,
      note: "Origin page slug (e.g. 'for-charities').",
    },
    schema: { is_nullable: true, max_length: 64 },
  },
  {
    field: "status",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 10,
      options: {
        choices: [
          { text: "New", value: "new" },
          { text: "Reviewed", value: "reviewed" },
          { text: "Contacted", value: "contacted" },
          { text: "Closed", value: "closed" },
        ],
      },
    },
    schema: { is_nullable: true, default_value: "new", max_length: 32 },
  },
  {
    field: "created_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      sort: 11,
      special: ["date-created"],
    },
    schema: { is_nullable: true },
  },
  {
    field: "reviewed_by",
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      sort: 12,
      options: { template: "{{first_name}} {{last_name}}" },
      special: ["m2o"],
    },
    schema: { is_nullable: true },
  },
  {
    field: "reviewed_at",
    type: "timestamp",
    meta: { interface: "datetime", sort: 13 },
    schema: { is_nullable: true },
  },
  {
    field: "admin_notes",
    type: "text",
    meta: {
      interface: "input-multiline",
      sort: 14,
      note: "Internal admin notes about this inquiry. Not shown to submitter.",
    },
    schema: { is_nullable: true },
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

  console.log("=== Create partnership_inquiry collection ===");
  await createCollection("partnership_inquiry", {});

  console.log("\n=== Add fields ===");
  for (const f of FIELDS) {
    await createField("partnership_inquiry", f);
  }

  // FK on reviewed_by → directus_users (no cascade — preserve audit
  // even if a user is later deleted; the FK enforces referential
  // integrity at write time only).
  console.log("\n=== reviewed_by → directus_users relation ===");
  if (!(await fieldExists("partnership_inquiry", "reviewed_by"))) {
    note("relation reviewed_by", "field missing (skip)");
  } else {
    const r = await api("POST", `/relations`, {
      collection: "partnership_inquiry",
      field: "reviewed_by",
      related_collection: "directus_users",
      schema: { on_delete: "SET NULL" },
    });
    if (r.ok || r.status === 400) {
      // 400 commonly means "relation already exists" — Directus's
      // own error response when you re-POST.
      note("relation reviewed_by", r.ok ? "created" : "exists (skip)");
    } else {
      note(
        "relation reviewed_by",
        `FAIL ${r.status} ${r.text.slice(0, 200)}`,
      );
    }
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
