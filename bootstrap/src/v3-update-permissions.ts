/**
 * OrphanGive — Session 41-v3 — update permissions
 * ------------------------------------------------
 * Modifies the existing `Data Inputter` and `Admin` Access Policies
 * to reflect the v3 DI Dashboard model:
 *
 *   On Data Inputter policy:
 *     • REMOVE: child / create + update (was direct write — now via child_proposal)
 *     • UPDATE: child / read       — scoped to assigned children + field whitelist
 *     • UPDATE: child_moment / *   — workflow presets + filters
 *     • UPDATE: child_update / *   — workflow presets + filters
 *     • ADD:    child_proposal / create + read + update
 *     • ADD:    aid_delivery / create + read
 *     • ADD:    task / read + update (di_status only)
 *
 *   On Admin policy:
 *     • ADD:    child_proposal / read + update + delete (full)
 *     • ADD:    aid_delivery / read + update + delete (full)
 *     • ADD:    task / create + read + update + delete (full)
 *     • ADD:    audit_log / read (read-only; system writes)
 *
 * Idempotent: if a permission row exists, this script UPDATES its
 * filter/fields/presets/validation. If absent, CREATES it.
 *
 * Falls back to raw `fetch()` for permissions endpoints — same
 * pattern as policies.ts (the readPermissions / createPermission
 * exports vary across SDK versions).
 *
 * Run with:
 *     npm run v3-update-permissions
 */

import 'dotenv/config';
import { createDirectus, rest, authentication } from '@directus/sdk';

const URL = process.env.DIRECTUS_URL;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !EMAIL || !PASSWORD) {
  console.error('Missing DIRECTUS_URL / ADMIN_EMAIL / ADMIN_PASSWORD in .env');
  process.exit(1);
}

const client = createDirectus(URL).with(authentication('json')).with(rest());

const log = (msg: string, tone: 'info' | 'ok' | 'skip' | 'err' = 'info') => {
  const colors = {
    info: '\x1b[36m',
    ok: '\x1b[32m',
    skip: '\x1b[90m',
    err: '\x1b[31m',
  } as const;
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${colors[tone]}[${time}] ${msg}\x1b[0m`);
};

// ─── Permission spec ────────────────────────────────────────────────
//
// Each rule says: on this policy, for this collection + action,
// the row should have these fields/filter/presets. The script
// upserts.

type PermSpec = {
  collection: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'share';
  fields?: string[] | '*';
  permissions?: Record<string, unknown> | null; // filter
  presets?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
};

// ─── Data Inputter — REMOVE direct child create/update ────────────
const DI_REMOVE: Array<{ collection: string; action: PermSpec['action'] }> = [
  { collection: 'child', action: 'create' },
  { collection: 'child', action: 'update' },
];

// ─── Data Inputter — UPDATE existing or ADD new ───────────────────
//
// child / read uses the canonical Tier-1+ field whitelist for DI:
// real production field names (Photo, bd_division, date_of_birth,
// etc.) plus the 7 new v3 fields (uploaded_by_di, assigned_di,
// district_internal, support_type, monthly_cost,
// guardian_summary_internal, last_visit_date). Excludes ALL guardian
// contact, GPS, exact school, medical fields per spec §6.

const DI_CHILD_READ_FIELDS = [
  'id',
  'display_name',
  'date_of_birth',
  'gender',
  'bd_division',
  'district_internal',
  'Photo',
  'status',
  'documents_status',
  'approved_at',
  'story',
  'education_level',
  'class_grade',
  'uploaded_by_di',
  'assigned_di',
  'support_type',
  'monthly_cost',
  'guardian_summary_internal',
  'last_visit_date',
];

const DI_UPSERTS: PermSpec[] = [
  // child — read only, scoped to assigned children
  {
    collection: 'child',
    action: 'read',
    fields: DI_CHILD_READ_FIELDS,
    permissions: {
      _or: [
        { uploaded_by_di: { _eq: '$CURRENT_USER' } },
        { assigned_di: { _eq: '$CURRENT_USER' } },
      ],
    },
  },

  // child_moment — workflow presets/filters
  {
    collection: 'child_moment',
    action: 'create',
    fields: '*',
    presets: { status: 'pending', created_by: '$CURRENT_USER' },
  },
  {
    collection: 'child_moment',
    action: 'read',
    fields: '*',
    permissions: {
      child: {
        _or: [
          { uploaded_by_di: { _eq: '$CURRENT_USER' } },
          { assigned_di: { _eq: '$CURRENT_USER' } },
        ],
      },
    },
  },
  {
    collection: 'child_moment',
    action: 'update',
    fields: '*',
    permissions: {
      _and: [
        { created_by: { _eq: '$CURRENT_USER' } },
        { status: { _eq: 'pending' } },
      ],
    },
  },
  {
    collection: 'child_moment',
    action: 'delete',
    fields: '*',
    permissions: {
      _and: [
        { created_by: { _eq: '$CURRENT_USER' } },
        { status: { _eq: 'pending' } },
      ],
    },
  },

  // child_update — workflow presets/filters
  {
    collection: 'child_update',
    action: 'create',
    fields: '*',
    presets: { status: 'draft', created_by: '$CURRENT_USER' },
  },
  {
    collection: 'child_update',
    action: 'read',
    fields: '*',
    permissions: {
      child: {
        _or: [
          { uploaded_by_di: { _eq: '$CURRENT_USER' } },
          { assigned_di: { _eq: '$CURRENT_USER' } },
        ],
      },
    },
  },
  {
    collection: 'child_update',
    action: 'update',
    fields: '*',
    permissions: {
      _and: [
        { created_by: { _eq: '$CURRENT_USER' } },
        { status: { _neq: 'approved' } },
      ],
    },
  },

  // child_proposal — DI's primary mutation path for child rows
  {
    collection: 'child_proposal',
    action: 'create',
    fields: '*',
    presets: { status: 'draft', created_by: '$CURRENT_USER' },
  },
  {
    collection: 'child_proposal',
    action: 'read',
    fields: '*',
    permissions: { created_by: { _eq: '$CURRENT_USER' } },
  },
  {
    collection: 'child_proposal',
    action: 'update',
    fields: '*',
    permissions: {
      _and: [
        { created_by: { _eq: '$CURRENT_USER' } },
        { status: { _in: ['draft', 'pending'] } },
      ],
    },
  },

  // aid_delivery — DI logs deliveries
  {
    collection: 'aid_delivery',
    action: 'create',
    fields: '*',
    presets: { status: 'pending', delivered_by: '$CURRENT_USER' },
  },
  {
    collection: 'aid_delivery',
    action: 'read',
    fields: '*',
    permissions: { delivered_by: { _eq: '$CURRENT_USER' } },
  },

  // task — DI sees + updates only di_status on assigned tasks
  {
    collection: 'task',
    action: 'read',
    fields: '*',
    permissions: { assignee: { _eq: '$CURRENT_USER' } },
  },
  {
    collection: 'task',
    action: 'update',
    fields: ['di_status'],
    permissions: { assignee: { _eq: '$CURRENT_USER' } },
  },
];

// ─── Admin — ADD new collections (full CRUD; read-only on audit_log) ─

const ADMIN_UPSERTS: PermSpec[] = [
  // child_proposal — full review + delete authority
  { collection: 'child_proposal', action: 'read',   fields: '*' },
  { collection: 'child_proposal', action: 'update', fields: '*' },
  { collection: 'child_proposal', action: 'delete', fields: '*' },

  // aid_delivery — verify + delete
  { collection: 'aid_delivery', action: 'read',   fields: '*' },
  { collection: 'aid_delivery', action: 'update', fields: '*' },
  { collection: 'aid_delivery', action: 'delete', fields: '*' },

  // task — admin assigns + manages
  { collection: 'task', action: 'create', fields: '*' },
  { collection: 'task', action: 'read',   fields: '*' },
  { collection: 'task', action: 'update', fields: '*' },
  { collection: 'task', action: 'delete', fields: '*' },

  // audit_log — read-only (system writes only)
  { collection: 'audit_log', action: 'read', fields: '*' },
];

// ─── Raw HTTP helpers (permissions endpoints not in SDK) ───────────

async function authToken(): Promise<string> {
  const token = (client as any).getToken
    ? await (client as any).getToken()
    : null;
  if (!token) throw new Error('No auth token available');
  return token;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await authToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function fetchPolicyByName(name: string): Promise<{ id: string; name: string } | null> {
  const headers = await authHeaders();
  const res = await fetch(
    `${URL}/policies?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`,
    { headers },
  );
  if (!res.ok) throw new Error(`fetchPolicyByName(${name}): ${res.status}`);
  const data = (await res.json()).data as Array<{ id: string; name: string }>;
  return data[0] ?? null;
}

type PermissionRow = {
  id: number;
  policy: string;
  collection: string;
  action: string;
  fields: string[] | null;
  permissions: Record<string, unknown> | null;
  presets: Record<string, unknown> | null;
  validation: Record<string, unknown> | null;
};

async function fetchPolicyPermissions(policyId: string): Promise<PermissionRow[]> {
  const headers = await authHeaders();
  const res = await fetch(
    `${URL}/permissions?filter[policy][_eq]=${policyId}&limit=-1`,
    { headers },
  );
  if (!res.ok) throw new Error(`fetchPolicyPermissions(${policyId}): ${res.status}`);
  return (await res.json()).data as PermissionRow[];
}

async function deletePermission(id: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${URL}/permissions/${id}`, { method: 'DELETE', headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`deletePermission(${id}): ${res.status} — ${body}`);
  }
}

async function createPermission(payload: PermSpec & { policy: string }): Promise<void> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {
    policy: payload.policy,
    collection: payload.collection,
    action: payload.action,
  };
  if (payload.fields !== undefined) body.fields = payload.fields;
  if (payload.permissions !== undefined) body.permissions = payload.permissions;
  if (payload.presets !== undefined) body.presets = payload.presets;
  if (payload.validation !== undefined) body.validation = payload.validation;
  const res = await fetch(`${URL}/permissions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createPermission: ${res.status} — ${text}`);
  }
}

async function updatePermission(id: number, payload: PermSpec): Promise<void> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {};
  if (payload.fields !== undefined) body.fields = payload.fields;
  if (payload.permissions !== undefined) body.permissions = payload.permissions;
  if (payload.presets !== undefined) body.presets = payload.presets;
  if (payload.validation !== undefined) body.validation = payload.validation;
  const res = await fetch(`${URL}/permissions/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`updatePermission(${id}): ${res.status} — ${text}`);
  }
}

// ─── Upsert helper ─────────────────────────────────────────────────
async function upsertPermissions(
  policyName: string,
  upserts: PermSpec[],
  removes: Array<{ collection: string; action: PermSpec['action'] }>,
) {
  const policy = await fetchPolicyByName(policyName);
  if (!policy) {
    log(`Policy "${policyName}" not found — skipping`, 'err');
    return;
  }
  log(`Policy "${policyName}" — id ${policy.id}`, 'ok');

  const existing = await fetchPolicyPermissions(policy.id);
  log(`  ${existing.length} existing permission row(s) on this policy.`, 'info');

  // Phase: REMOVES
  for (const rem of removes) {
    const match = existing.find(
      (p) => p.collection === rem.collection && p.action === rem.action,
    );
    if (!match) {
      log(`  · remove ${rem.collection}/${rem.action} (not present, skipped)`, 'skip');
      continue;
    }
    try {
      await deletePermission(match.id);
      log(`  ✗ removed ${rem.collection}/${rem.action} (id ${match.id})`, 'ok');
    } catch (e: any) {
      log(`  ✗ remove ${rem.collection}/${rem.action} failed: ${e?.message || e}`, 'err');
    }
  }

  // Phase: UPSERTS
  for (const spec of upserts) {
    const match = existing.find(
      (p) => p.collection === spec.collection && p.action === spec.action,
    );
    try {
      if (match) {
        await updatePermission(match.id, spec);
        log(`  ↻ updated ${spec.collection}/${spec.action} (id ${match.id})`, 'ok');
      } else {
        await createPermission({ ...spec, policy: policy.id });
        log(`  ✓ created ${spec.collection}/${spec.action}`, 'ok');
      }
    } catch (e: any) {
      log(`  ✗ ${spec.collection}/${spec.action}: ${e?.message || e}`, 'err');
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────
async function login() {
  log(`Logging in to ${URL} as ${EMAIL}...`);
  await client.login(EMAIL!, PASSWORD!);
  log('Logged in.', 'ok');
}

async function main() {
  await login();

  log('\n=== Phase 1: Update Data Inputter policy ===');
  await upsertPermissions('Data Inputter', DI_UPSERTS, DI_REMOVE);

  log('\n=== Phase 2: Extend Admin policy ===');
  await upsertPermissions('Admin', ADMIN_UPSERTS, []);

  log('\n=== Permission update complete. ===', 'ok');
  log('\nNext steps:');
  log('  1. Restart og-directus-local: docker restart og-directus-local');
  log('  2. Log in to admin UI as data_in@input.com — verify cannot create/update child');
  log('  3. Verify can create child_proposal (defaults: status=draft, created_by=self)');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
