// Phase 0 follow-up — seed the SYSTEM directus user.
//
// Closes the webhook audit gap deferred in Phase 0 (see
// docs/admin-os/01-phase0-diagnostic.md §C deferred note).
// audit_log.actor is m2o directus_users NOT NULL, so webhook /
// cron events that have no human actor still need a real user
// row to attribute to. We seed ONE service user with a stable
// known UUID and minimal footprint:
//
//   id          00000000-0000-0000-0000-00000000a0d1
//   email       system@orphangive.org
//   first_name  System
//   last_name   Webhook
//   status      active
//   role        Administrator
//   password    (none — never used for login)
//   token       (none — never used for API auth)
//
// The UUID is intentionally human-recognisable (15 leading zeros
// + "a0d1" ≈ "audit-zero deep 1"). Same role-as-cron convention
// matches src/app/api/cron/expire-stale-proposals/route.ts which
// also reads SYSTEM_USER_ID and writes audit rows with
// actor_role="system".
//
// Wire after seeding:
//   1. Copy the UUID into .env.local and any prod env file:
//        SYSTEM_USER_ID=00000000-0000-0000-0000-00000000a0d1
//   2. Restart Next.js dev server / redeploy production app so the
//      env var is picked up.
//
// Idempotent — re-runnable. Skips if a user with the canonical
// UUID exists.
//
// Run (with .env.local sourced in the current shell):
//   export $(grep -E "^(NEXT_PUBLIC_DIRECTUS_URL|DIRECTUS_SERVER_TOKEN)=" .env.local | xargs)
//   node migrations/phase-0/002-seed-system-user.mjs
//
// Run inside a container (production host has no node):
//   docker run --rm --network host \
//     -e NEXT_PUBLIC_DIRECTUS_URL="$NEXT_PUBLIC_DIRECTUS_URL" \
//     -e DIRECTUS_SERVER_TOKEN="$DIRECTUS_SERVER_TOKEN" \
//     -v "$(pwd)/migrations/phase-0":/m \
//     node:22-alpine \
//     node /m/002-seed-system-user.mjs

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

// Canonical anchor — DO NOT change after seeding. Any historic
// audit_log rows pointing here would orphan their actor FK.
const SYSTEM_USER_ID = "00000000-0000-0000-0000-00000000a0d1";
const SYSTEM_USER_EMAIL = "system@orphangive.org";
const ADMINISTRATOR_ROLE_NAME = "Administrator";

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

async function findAdministratorRoleId() {
  // Roles endpoint with `?filter[name][_eq]=Administrator` returns
  // permission-gated 403 under some Directus configs; safer to list
  // all roles (which the admin token always sees) and pick by name.
  const r = await api("GET", "/roles?fields=id,name&limit=-1");
  if (!r.ok) {
    throw new Error(`role lookup failed: ${r.status} ${r.text.slice(0, 200)}`);
  }
  const role = (r.json?.data || []).find(
    (x) => x.name === ADMINISTRATOR_ROLE_NAME,
  );
  if (!role) {
    throw new Error(
      `${ADMINISTRATOR_ROLE_NAME} role not found — seed cannot attribute the system user without it`,
    );
  }
  return role.id;
}

async function systemUserExists() {
  // Probe by canonical UUID. Returns true iff the row is present
  // AND its email matches what we expect — guards against the case
  // where the UUID slot is occupied by something unrelated.
  const r = await api(
    "GET",
    `/users?filter[id][_eq]=${SYSTEM_USER_ID}&fields=id,email,status,role.name&limit=1`,
  );
  if (!r.ok) {
    throw new Error(`user probe failed: ${r.status} ${r.text.slice(0, 200)}`);
  }
  const rows = r.json?.data ?? [];
  if (rows.length === 0) return false;
  const row = rows[0];
  if (row.email !== SYSTEM_USER_EMAIL) {
    throw new Error(
      `UUID slot ${SYSTEM_USER_ID} is occupied by a non-system user (email=${row.email}). Refusing to overwrite.`,
    );
  }
  return true;
}

async function main() {
  console.log(`Directus: ${URL}`);
  const ping = await api("GET", "/server/ping");
  if (!ping.ok) {
    console.error(`Health check failed: HTTP ${ping.status}`);
    process.exit(1);
  }
  console.log("Health: ok\n");

  console.log("=== System user seed ===");
  if (await systemUserExists()) {
    note(`user ${SYSTEM_USER_ID}`, "exists (skip)");
  } else {
    const roleId = await findAdministratorRoleId();
    note(`Administrator role id`, roleId);
    const create = await api("POST", "/users", {
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      first_name: "System",
      last_name: "Webhook",
      status: "active",
      role: roleId,
      // No password, no token — this user is never logged into
      // and never used for API auth. It exists solely to be the
      // FK target on audit_log.actor for webhook/cron events.
    });
    if (create.ok) {
      note(`user ${SYSTEM_USER_ID}`, "created");
    } else {
      note(
        `user ${SYSTEM_USER_ID}`,
        `FAIL ${create.status} ${create.text.slice(0, 300)}`,
      );
      process.exit(1);
    }
  }

  console.log("\n=== Next step ===");
  console.log(`  Add to .env.local + production env:`);
  console.log(`    SYSTEM_USER_ID=${SYSTEM_USER_ID}`);
  console.log("  Then restart the Next.js dev server / redeploy.");
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
