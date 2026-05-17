/**
 * OrphanGive — Access Policies setup
 * -----------------------------------
 * Creates 5 Access Policies (one per role) and links each policy to its matching role.
 *
 * Why this exists separately:
 * Directus 11 split "Roles" (containers for users) from "Access Policies"
 * (containers for permissions). Roles get assigned policies. The original
 * bootstrap created the Roles; this script creates the Policies and wires them up.
 *
 * Idempotent: safe to re-run.
 *
 * Run with:
 *     npm run policies
 */

import 'dotenv/config';
import {
  createDirectus,
  rest,
  authentication,
  readRoles,
  updateRole,
} from '@directus/sdk';

const URL = process.env.DIRECTUS_URL;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !EMAIL || !PASSWORD) {
  console.error('Missing DIRECTUS_URL / ADMIN_EMAIL / ADMIN_PASSWORD in .env');
  process.exit(1);
}

const client = createDirectus(URL).with(authentication('json')).with(rest());

const log = (msg: string, tone: 'info' | 'ok' | 'skip' | 'err' = 'info') => {
  const colors = { info: '\x1b[36m', ok: '\x1b[32m', skip: '\x1b[90m', err: '\x1b[31m' } as const;
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${colors[tone]}[${time}] ${msg}\x1b[0m`);
};

const policies = [
  { name: 'Admin', icon: 'verified_user', description: 'Manages a single tenant: approves children, donors, documents, reveal requests, updates.', app_access: true, admin_access: false },
  { name: 'Data Inputter', icon: 'person_add', description: 'Adds and updates child profiles. Submissions require admin approval.', app_access: true, admin_access: false },
  { name: 'Legal Guardian', icon: 'family_restroom', description: 'Verified guardian of a specific child. Phase 2 public flow.', app_access: true, admin_access: false },
  { name: 'Donor', icon: 'volunteer_activism', description: 'Sponsors children. Read-only on public child fields.', app_access: false, admin_access: false },
  { name: 'Org Donor', icon: 'corporate_fare', description: 'Same as Donor, plus organisational profile fields.', app_access: false, admin_access: false },
];

async function login() {
  log(`Logging in to ${URL} as ${EMAIL}...`);
  await client.login(EMAIL!, PASSWORD!);
  log('Logged in.', 'ok');
}

async function fetchRoles() {
  log('\nFetching existing roles...');
  const roles = await client.request(readRoles({ limit: -1 }));
  return roles as any[];
}

async function fetchPolicies() {
  log('Fetching existing access policies...');
  // Use raw REST request — readPolicies isn't exported in all SDK versions
  const url = `${URL}/policies?limit=-1`;
  const token = (client as any).getToken ? await (client as any).getToken() : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to fetch policies: ${res.status}`);
  const data = await res.json();
  return data.data as any[];
}

async function createPolicyRaw(policy: any) {
  const url = `${URL}/policies`;
  const token = (client as any).getToken ? await (client as any).getToken() : null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(policy),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create policy: ${res.status} — ${body}`);
  }
  return await res.json();
}

async function main() {
  await login();

  const roles = await fetchRoles();
  log(`Found ${roles.length} role(s).`, 'ok');

  const existingPolicies = await fetchPolicies();
  log(`Found ${existingPolicies.length} existing policy/policies.`, 'ok');
  const existingPolicyByName: Record<string, any> = {};
  for (const p of existingPolicies) existingPolicyByName[p.name] = p;

  log('\n=== Phase 1: Create Access Policies ===');
  const policyByName: Record<string, any> = {};
  for (const policyDef of policies) {
    if (existingPolicyByName[policyDef.name]) {
      log(`  · policy ${policyDef.name} (exists, skipped)`, 'skip');
      policyByName[policyDef.name] = existingPolicyByName[policyDef.name];
      continue;
    }
    try {
      const created = await createPolicyRaw(policyDef);
      log(`  ✓ policy: ${policyDef.name}`, 'ok');
      policyByName[policyDef.name] = created.data;
    } catch (e: any) {
      log(`  ✗ policy ${policyDef.name}: ${e?.message || e}`, 'err');
    }
  }

  log('\n=== Phase 2: Link Policies to Roles ===');
  for (const policyDef of policies) {
    const role = roles.find(r => r.name === policyDef.name);
    const policy = policyByName[policyDef.name];

    if (!role) {
      log(`  ✗ role "${policyDef.name}" not found — was bootstrap script run?`, 'err');
      continue;
    }
    if (!policy) {
      log(`  ✗ policy "${policyDef.name}" not available`, 'err');
      continue;
    }

    // Check if role already has this policy
    const currentPolicies = role.policies || [];
    const policyIds = currentPolicies.map((p: any) => typeof p === 'string' ? p : p.policy?.id || p.policy);
    if (policyIds.includes(policy.id)) {
      log(`  · ${policyDef.name} role already linked, skipped`, 'skip');
      continue;
    }

    try {
      // Link the policy to the role
      await client.request(updateRole(role.id, {
        policies: [
          ...currentPolicies,
          { policy: policy.id }
        ] as any
      } as any));
      log(`  ✓ linked policy → role: ${policyDef.name}`, 'ok');
    } catch (e: any) {
      log(`  ✗ link ${policyDef.name}: ${e?.errors?.[0]?.message || e?.message || e}`, 'err');
    }
  }

  log('\n=== Access Policies setup complete. ===', 'ok');
  log('\nNext steps:');
  log('  1. Open Directus → Settings → Access Policies');
  log('  2. You should now see: Administrator, Public, plus your 5 new policies.');
  log('  3. Click each policy to configure permissions (per Session 2 walkthrough).');
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
