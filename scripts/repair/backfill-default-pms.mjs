// One-shot backfill: ensures every donor with a Stripe customer
// also has a default payment method set (Session 15b1).
//
// Background: early test donors created Stripe customers but
// their PaymentIntents/SetupIntents didn't always promote the
// resulting PaymentMethod to the customer's default. Newer
// "manage cards" UI assumes a default exists for off-session
// charging (extension flow, queue activation). Donors with
// orphaned customers get a friendly card-entry fallback, but the
// silent-success ones never trigger that fallback and end up
// stuck.
//
// Logic per donor (idempotent):
//   1. List PaymentMethods on the Stripe customer (type=card)
//   2. Read customer.invoice_settings.default_payment_method
//   3. If default is missing AND at least 1 PM exists:
//        - pick the most-recently-created PM
//        - update customer's default_payment_method to that id
//        - log
//      Else log no-op.
//
// Re-run safely: a customer with the default already set produces
// 0 actions on a second run.
//
// Usage:
//   node --env-file=.env.local scripts/repair/backfill-default-pms.mjs
//   node --env-file=.env.local scripts/repair/backfill-default-pms.mjs --dry-run
//
// Production usage:
//   node --env-file=.env.production.local scripts/repair/backfill-default-pms.mjs
//
// --dry-run prints actions without writing. Always run with
// --dry-run first.

const DRY_RUN = process.argv.includes("--dry-run");

const directusUrl = process.env.NEXT_PUBLIC_DIRECTUS_URL;
const directusToken = process.env.DIRECTUS_SERVER_TOKEN;
const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!directusUrl || !directusToken || !stripeKey) {
  console.error(
    "Missing env: NEXT_PUBLIC_DIRECTUS_URL, DIRECTUS_SERVER_TOKEN, STRIPE_SECRET_KEY",
  );
  console.error("Run with: node --env-file=.env.local <script>");
  process.exit(1);
}

console.log(
  `[backfill-pm] starting${DRY_RUN ? " (DRY RUN — no writes)" : ""}`,
);

async function directusGet(path) {
  const r = await fetch(`${directusUrl}${path}`, {
    headers: { Authorization: `Bearer ${directusToken}` },
  });
  if (!r.ok) {
    throw new Error(`Directus GET ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function stripeGet(path) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!r.ok) {
    throw new Error(`Stripe GET ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

async function stripePost(path, formBody) {
  const body = new URLSearchParams(formBody).toString();
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!r.ok) {
    throw new Error(`Stripe POST ${path} failed: ${r.status} ${await r.text()}`);
  }
  return r.json();
}

// ─── 1. Find donors with a Stripe customer id ─────────────────────────
const filter = encodeURIComponent(
  JSON.stringify({ og_stripe_customer_id: { _nnull: true } }),
);
const fields = "id,email,first_name,last_name,og_stripe_customer_id";
const { data: donors } = await directusGet(
  `/users?filter=${filter}&fields=${fields}&limit=-1`,
);
console.log(`[backfill-pm] found ${donors.length} donor(s) with a Stripe customer`);

const stats = {
  scanned: donors.length,
  defaultSet: 0,
  alreadyDefaulted: 0,
  noPm: 0,
  errors: 0,
};

for (const donor of donors) {
  const cs = donor.og_stripe_customer_id;
  const email = donor.email ?? "(no email)";
  const prefix = `[backfill-pm] ${email} (cus=${cs?.slice(0, 12)}…)`;

  let customer;
  try {
    customer = await stripeGet(
      `/customers/${encodeURIComponent(cs)}?expand[]=invoice_settings.default_payment_method`,
    );
  } catch (err) {
    console.warn(`${prefix} retrieve failed: ${err instanceof Error ? err.message : err}`);
    stats.errors++;
    continue;
  }

  if (customer.deleted) {
    console.log(`${prefix} customer is deleted in Stripe; skip`);
    continue;
  }

  const currentDefault = customer.invoice_settings?.default_payment_method;
  const currentDefaultId =
    typeof currentDefault === "string"
      ? currentDefault
      : currentDefault?.id ?? null;

  if (currentDefaultId) {
    stats.alreadyDefaulted++;
    continue;
  }

  // No default set — list card PaymentMethods and pick the most
  // recent.
  let pms;
  try {
    pms = await stripeGet(
      `/payment_methods?customer=${encodeURIComponent(cs)}&type=card&limit=10`,
    );
  } catch (err) {
    console.warn(`${prefix} list PMs failed: ${err instanceof Error ? err.message : err}`);
    stats.errors++;
    continue;
  }
  const cards = (pms.data ?? []).slice().sort(
    (a, b) => (b.created ?? 0) - (a.created ?? 0),
  );
  if (cards.length === 0) {
    console.log(`${prefix} no PMs on file; skip`);
    stats.noPm++;
    continue;
  }
  const pickedPm = cards[0];
  console.log(
    `${prefix} action=set_default pm=${pickedPm.id} (${pickedPm.card?.brand} •••• ${pickedPm.card?.last4})`,
  );
  if (DRY_RUN) {
    stats.defaultSet++;
    continue;
  }
  try {
    await stripePost(`/customers/${encodeURIComponent(cs)}`, {
      "invoice_settings[default_payment_method]": pickedPm.id,
    });
    stats.defaultSet++;
  } catch (err) {
    console.warn(`${prefix} update failed: ${err instanceof Error ? err.message : err}`);
    stats.errors++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────
console.log();
console.log("[backfill-pm] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`[backfill-pm] mode:                ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
console.log(`[backfill-pm] donors scanned:      ${stats.scanned}`);
console.log(`[backfill-pm] default PM set:      ${stats.defaultSet}`);
console.log(`[backfill-pm] already had default: ${stats.alreadyDefaulted}`);
console.log(`[backfill-pm] no PMs on file:      ${stats.noPm}`);
console.log(`[backfill-pm] errors:              ${stats.errors}`);
console.log("[backfill-pm] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
if (DRY_RUN) {
  console.log("[backfill-pm] re-run without --dry-run to apply.");
}
