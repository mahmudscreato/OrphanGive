// feat/sslcommerz-phase1-guest — add gateway + SSLCommerz txn fields to
// guest_donation.
//
// Phase 1 adds SSLCommerz (bKash/Nagad/local cards, BDT) as a PARALLEL gateway
// for the guest one-time cause-donation flow. Existing rows + the Stripe path
// are untouched: `gateway` defaults to 'stripe', so every current row and every
// future Stripe row reads back exactly as before.
//
//   guest_donation.gateway           varchar  NOT NULL default 'stripe'
//                                             ('stripe' | 'sslcommerz')
//   guest_donation.ssl_tran_id       varchar  nullable  (our unique tran id;
//                                             the IPN/return lookup key)
//   guest_donation.ssl_val_id        varchar  nullable  (SSLCommerz val_id from
//                                             the validation API)
//   guest_donation.ssl_bank_tran_id  varchar  nullable  (bank_tran_id)
//   guest_donation.ssl_card_type     varchar  nullable  (method: bKash/VISA/…)
//
// ADDITIVE + idempotent + re-runnable (existing fields are skipped).
//
// ⚠ DEPLOY ORDERING — run this migration (fields registered in Directus)
// BEFORE the app build deploys, same as guest-donation 001/002. The write path
// (/api/donate/sslcommerz/init → createPendingGuestDonation) sets
// guest_donation.gateway + ssl_tran_id, which errors until the columns exist.
//
// Run (with .env.local sourced):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/sslcommerz-phase1/001-add-guest-donation-gateway.mjs

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

// gateway — payment provider discriminator. Default 'stripe' so existing rows
// and the untouched Stripe path read back unchanged.
const GATEWAY_FIELD = {
  field: "gateway",
  type: "string",
  meta: {
    interface: "select-dropdown",
    options: {
      choices: [
        { text: "Stripe", value: "stripe" },
        { text: "SSLCommerz", value: "sslcommerz" },
      ],
    },
    display: "labels",
    sort: 2,
    note: "Payment gateway. 'stripe' (default) or 'sslcommerz'.",
  },
  schema: { default_value: "stripe", is_nullable: false },
};

// SSLCommerz transaction references — all nullable (only sslcommerz rows set
// them). ssl_tran_id is OUR generated unique id and the IPN/return lookup key.
const SSL_FIELDS = [
  {
    field: "ssl_tran_id",
    type: "string",
    meta: { interface: "input", sort: 20, note: "SSLCommerz tran_id (our unique id; IPN lookup key)." },
    schema: { is_nullable: true },
  },
  {
    field: "ssl_val_id",
    type: "string",
    meta: { interface: "input", sort: 21, note: "SSLCommerz val_id (from the validation API)." },
    schema: { is_nullable: true },
  },
  {
    field: "ssl_bank_tran_id",
    type: "string",
    meta: { interface: "input", sort: 22, note: "SSLCommerz bank_tran_id." },
    schema: { is_nullable: true },
  },
  {
    field: "ssl_card_type",
    type: "string",
    meta: { interface: "input", sort: 23, note: "SSLCommerz method/card type (bKash/VISA/…)." },
    schema: { is_nullable: true },
  },
];

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  if (!(await collectionExists("guest_donation"))) {
    console.error(
      "guest_donation collection missing — run 001-create-guest-donation.mjs first.",
    );
    process.exit(1);
  }

  console.log("=== guest_donation: add gateway + SSLCommerz txn fields ===");
  await createField("guest_donation", GATEWAY_FIELD);
  for (const f of SSL_FIELDS) {
    await createField("guest_donation", f);
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
