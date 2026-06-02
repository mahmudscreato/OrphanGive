// P5 — safeguarding_report collection.
//
// THE MOST SENSITIVE COLLECTION IN THE SYSTEM. A row concerns the safety
// of a vulnerable child. Design rules:
//   - FAIL-CLOSED ACCESS. This migration deliberately grants the collection
//     to NO Directus policy (not Admin, not Data Inputter, not Donor). A
//     freshly-created Directus collection has zero permissions by default,
//     so only a FULL-ACCESS token (the app's DIRECTUS_SERVER_TOKEN) can
//     read/write it. A plain Admin or DI logging into Directus directly
//     sees NOTHING. App-side, every read/write is gated by
//     requireSafeguardingLead() (src/lib/safeguarding-access.ts), keyed to
//     the SAFEGUARDING_LEAD_USER_IDS allowlist. Two independent locks:
//     (1) DB — no user policy can touch it; (2) app — only allowlisted
//     founder/lead user ids pass the gate.
//   - Never log report bodies to stdout/Sentry (handled in the data layer).
//
// SCHEMA (all NULLABLE in DB; required-ness enforced at the API via zod,
// mirroring partnership_inquiry):
//   id                     uuid          PK
//   created_at             timestamptz   date-created (server-set)
//   source                 varchar(32)   public_form | email_logged_manually | internal
//   reporter_name          varchar(120)  Optional — anonymous allowed.
//   reporter_email         varchar(254)  Optional.
//   reporter_relationship  varchar(120)  Optional (e.g. guardian, neighbour, teacher).
//   child_reference        text          Optional free text — a report may NOT name a child.
//   report_type            varchar(40)   concern_for_child | inappropriate_contact |
//                                         data_privacy | staff_conduct | other
//   risk_level             varchar(16)   low | medium | high | critical. Set by the LEAD,
//                                         not the reporter. Nullable until triaged.
//   description            text          The report body.
//   status                 varchar(32)   new | acknowledged | under_review |
//                                         referred_to_authority | resolved | closed. Default 'new'.
//   assigned_to            uuid → users  The lead handling it. Nullable. SET NULL on user delete.
//   action_taken           text          Lead-only. What was done. Nullable.
//   closed_at              timestamptz   When closed/resolved. Nullable.
//
// Idempotent. Re-runnable. Fields that exist are skipped.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/p5-safeguarding-report/001-create-safeguarding-report.mjs

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
      icon: "shield",
      note: "Safeguarding reports. FAIL-CLOSED: no user policy is granted access — founder/safeguarding-lead only, via the app.",
      display_template: "{{status}} · {{risk_level}} · {{report_type}}",
      sort_field: "created_at",
      ...meta,
    },
    schema: { name },
  });
  if (r.ok) note(`collection ${name}`, "created");
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

// ─── Field definitions ──────────────────────────────────────────────

const FIELDS = [
  {
    field: "id",
    type: "uuid",
    meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
    schema: { is_primary_key: true, has_auto_increment: false },
  },
  {
    field: "created_at",
    type: "timestamp",
    meta: {
      interface: "datetime",
      readonly: true,
      sort: 2,
      special: ["date-created"],
    },
    schema: { is_nullable: true },
  },
  {
    field: "source",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 3,
      options: {
        choices: [
          { text: "Public form", value: "public_form" },
          { text: "Email (logged manually)", value: "email_logged_manually" },
          { text: "Internal", value: "internal" },
        ],
      },
    },
    schema: { is_nullable: true, default_value: "public_form", max_length: 32 },
  },
  {
    field: "reporter_name",
    type: "string",
    meta: { interface: "input", sort: 4, note: "Optional — anonymous reports allowed." },
    schema: { is_nullable: true, max_length: 120 },
  },
  {
    field: "reporter_email",
    type: "string",
    meta: { interface: "input", sort: 5, note: "Optional." },
    schema: { is_nullable: true, max_length: 254 },
  },
  {
    field: "reporter_relationship",
    type: "string",
    meta: { interface: "input", sort: 6, note: "Optional — e.g. guardian, neighbour, teacher." },
    schema: { is_nullable: true, max_length: 120 },
  },
  {
    field: "child_reference",
    type: "text",
    meta: {
      interface: "input-multiline",
      sort: 7,
      note: "Optional free text. A report may NOT name a specific child.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "report_type",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 8,
      options: {
        choices: [
          { text: "Concern for a child's welfare", value: "concern_for_child" },
          { text: "Inappropriate contact", value: "inappropriate_contact" },
          { text: "Data / privacy concern", value: "data_privacy" },
          { text: "Staff / contractor conduct", value: "staff_conduct" },
          { text: "Other", value: "other" },
        ],
      },
    },
    schema: { is_nullable: true, max_length: 40 },
  },
  {
    field: "risk_level",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 9,
      note: "Set by the safeguarding lead during triage — NOT the reporter.",
      options: {
        choices: [
          { text: "Low", value: "low" },
          { text: "Medium", value: "medium" },
          { text: "High", value: "high" },
          { text: "Critical", value: "critical" },
        ],
      },
    },
    schema: { is_nullable: true, max_length: 16 },
  },
  {
    field: "description",
    type: "text",
    meta: { interface: "input-multiline", sort: 10, note: "The report body." },
    schema: { is_nullable: true },
  },
  {
    field: "status",
    type: "string",
    meta: {
      interface: "select-dropdown",
      sort: 11,
      options: {
        choices: [
          { text: "New", value: "new" },
          { text: "Acknowledged", value: "acknowledged" },
          { text: "Under review", value: "under_review" },
          { text: "Referred to authority", value: "referred_to_authority" },
          { text: "Resolved", value: "resolved" },
          { text: "Closed", value: "closed" },
        ],
      },
    },
    schema: { is_nullable: true, default_value: "new", max_length: 32 },
  },
  {
    field: "assigned_to",
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
    field: "action_taken",
    type: "text",
    meta: {
      interface: "input-multiline",
      sort: 13,
      note: "Lead-only. What was done in response. Never shown to the reporter.",
    },
    schema: { is_nullable: true },
  },
  {
    field: "closed_at",
    type: "timestamp",
    meta: { interface: "datetime", sort: 14 },
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

  console.log("=== Create safeguarding_report collection ===");
  await createCollection("safeguarding_report", {});

  console.log("\n=== Add fields ===");
  for (const f of FIELDS) {
    await createField("safeguarding_report", f);
  }

  // FK on assigned_to → directus_users (SET NULL — preserve the report
  // even if the lead's user record is later removed).
  console.log("\n=== assigned_to → directus_users relation ===");
  if (!(await fieldExists("safeguarding_report", "assigned_to"))) {
    note("relation assigned_to", "field missing (skip)");
  } else {
    const r = await api("POST", `/relations`, {
      collection: "safeguarding_report",
      field: "assigned_to",
      related_collection: "directus_users",
      schema: { on_delete: "SET NULL" },
    });
    if (r.ok || r.status === 400) {
      note("relation assigned_to", r.ok ? "created" : "exists (skip)");
    } else {
      note("relation assigned_to", `FAIL ${r.status} ${r.text.slice(0, 200)}`);
    }
  }

  // INTENTIONALLY NO PERMISSION/POLICY GRANTS. Fail-closed: the collection
  // is reachable only by the full-access server token (the app), and the
  // app gates every access behind requireSafeguardingLead(). Do NOT add
  // create/read grants for the Admin or Data Inputter policies here.
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
