/**
 * OrphanGive — Session 41-v3 — register collections + fields
 * ----------------------------------------------------------
 * Registers the 4 new DI Dashboard collections in Directus's
 * metadata (directus_collections + directus_fields) so they appear
 * in the admin UI with proper field interfaces, options, and
 * display templates. Also registers the new fields added to
 * existing collections (child, directus_users, child_moment).
 *
 * Why this exists separately from 001-schema.sql:
 * 001-schema.sql creates the underlying Postgres tables + columns
 * via raw DDL. Directus doesn't auto-introspect new tables — its
 * metadata layer needs explicit registration to render the
 * collections in admin and to serve them via the SDK with proper
 * field interfaces. This script is the second half.
 *
 * Idempotent: safe to re-run.
 *
 * Run with:
 *     npm run v3-register-collections
 */

import 'dotenv/config';
import {
  createDirectus,
  rest,
  authentication,
  createCollection,
  createField,
  readCollections,
  readFieldsByCollection,
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
  const colors = {
    info: '\x1b[36m',
    ok: '\x1b[32m',
    skip: '\x1b[90m',
    err: '\x1b[31m',
  } as const;
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${colors[tone]}[${time}] ${msg}\x1b[0m`);
};

// ─── Collection metadata definitions ───────────────────────────────
//
// Each entry is a Directus collection registration payload + the
// fields to register on it. The schema for the underlying Postgres
// table is created separately by 001-schema.sql; here we just teach
// Directus how to render each column in admin.

type FieldDef = {
  field: string;
  type:
    | 'uuid'
    | 'string'
    | 'text'
    | 'integer'
    | 'date'
    | 'timestamp'
    | 'json'
    | 'boolean';
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
};

type CollectionDef = {
  collection: string;
  meta: Record<string, unknown>;
  fields: FieldDef[];
};

const NEW_COLLECTIONS: CollectionDef[] = [
  // ─── child_proposal ──────────────────────────────────────────────
  {
    collection: 'child_proposal',
    meta: {
      icon: 'pending_actions',
      color: '#ED8B3F',
      note: 'DI-originated proposed mutations to child records. Workflow: draft → pending → approved | rejected.',
      display_template: '{{proposal_type}} · {{display_name}} · {{status}}',
      sort_field: 'date_created',
      accountability: 'all',
    },
    fields: [
      { field: 'id', type: 'uuid', meta: { interface: 'input', readonly: true, hidden: false, special: ['uuid'] } },
      { field: 'proposal_type', type: 'string', meta: { interface: 'select-dropdown', required: true, width: 'half', options: { choices: [{ text: 'Create', value: 'create' }, { text: 'Update', value: 'update' }] } } },
      { field: 'target_child', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'related-values', display_options: { template: '{{display_name}}' }, width: 'half', note: 'Null for create proposals; UUID of target row for update.' } },
      { field: 'display_name', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'first_name', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'date_of_birth', type: 'date', meta: { interface: 'datetime', width: 'half' } },
      { field: 'gender', type: 'string', meta: { interface: 'input', width: 'half' } },
      // bd_division PK is varchar `code` (e.g. 'dhaka'), not uuid `id`.
      { field: 'bd_division', type: 'string', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'related-values', display_options: { template: '{{name}}' }, width: 'half' } },
      { field: 'district_internal', type: 'string', meta: { interface: 'input', width: 'half', note: 'Internal-only district label. Never exposed at Tier 1.' } },
      { field: 'Photo', type: 'uuid', meta: { interface: 'file-image', special: ['file'], width: 'half' } },
      { field: 'story', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'education_level', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'class_grade', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'support_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Education', value: 'education' }, { text: 'Food', value: 'food' }, { text: 'Healthcare', value: 'healthcare' }, { text: 'Clothing', value: 'clothing' }, { text: 'General care', value: 'general_care' }, { text: 'Other', value: 'other' }] } } },
      { field: 'monthly_cost', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Monthly support amount in BDT. Nullable.' } },
      { field: 'guardian_summary_internal', type: 'text', meta: { interface: 'input-multiline', note: 'Internal-only family context. Never exposed at any donor tier.' } },
      { field: 'last_visit_date', type: 'date', meta: { interface: 'datetime', width: 'half' } },
      { field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'half', options: { choices: [{ text: 'Draft', value: 'draft' }, { text: 'Pending', value: 'pending' }, { text: 'Approved', value: 'approved' }, { text: 'Rejected', value: 'rejected' }] } } },
      { field: 'rejection_reason', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'created_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o', 'user-created'], display: 'user', readonly: true, width: 'half' } },
      { field: 'approved_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', readonly: true, width: 'half' } },
      { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', readonly: true, special: ['date-created'], width: 'half' } },
      { field: 'published_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half' } },
      { field: 'previous_snapshot', type: 'json', meta: { interface: 'input-code', options: { language: 'JSON' }, note: 'JSONB capture of affected child row pre-mutation. Set when status moves to pending.' } },
    ],
  },

  // ─── aid_delivery ────────────────────────────────────────────────
  {
    collection: 'aid_delivery',
    meta: {
      icon: 'redeem',
      color: '#9FBFD9',
      note: 'DI-recorded aid delivery events. Photo + description + optional acknowledgment. Admin verifies.',
      display_template: '{{delivery_date}} · {{aid_type}} · {{status}}',
      sort_field: 'delivery_date',
      accountability: 'all',
    },
    fields: [
      { field: 'id', type: 'uuid', meta: { interface: 'input', readonly: true, hidden: false, special: ['uuid'] } },
      { field: 'child', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'related-values', display_options: { template: '{{display_name}}' }, required: true } },
      { field: 'sponsorship', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'related-values', width: 'half', note: 'Optional — null for general-fund deliveries.' } },
      { field: 'aid_type', type: 'string', meta: { interface: 'select-dropdown', required: true, width: 'half', options: { choices: [{ text: 'Education', value: 'education' }, { text: 'Food', value: 'food' }, { text: 'Healthcare', value: 'healthcare' }, { text: 'Clothing', value: 'clothing' }, { text: 'General care', value: 'general_care' }, { text: 'Other', value: 'other' }] } } },
      { field: 'description', type: 'text', meta: { interface: 'input-multiline', required: true } },
      { field: 'delivery_date', type: 'date', meta: { interface: 'datetime', required: true, width: 'half' } },
      { field: 'photo', type: 'uuid', meta: { interface: 'file-image', special: ['file'], required: true, width: 'half' } },
      { field: 'recipient_acknowledgment', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'status', type: 'string', meta: { interface: 'select-dropdown', display: 'labels', width: 'half', options: { choices: [{ text: 'Pending', value: 'pending' }, { text: 'Verified', value: 'verified' }, { text: 'Rejected', value: 'rejected' }] } } },
      { field: 'rejection_reason', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'delivered_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o', 'user-created'], display: 'user', readonly: true, width: 'half' } },
      { field: 'verified_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', readonly: true, width: 'half' } },
      { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', readonly: true, special: ['date-created'], width: 'half' } },
      { field: 'verified_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half' } },
    ],
  },

  // ─── task ────────────────────────────────────────────────────────
  {
    collection: 'task',
    meta: {
      icon: 'task_alt',
      color: '#F4B400',
      note: 'Admin-assigned work items for DI. di_status owned by DI; admin_status owned by admin.',
      display_template: '{{title}} · {{di_status}}',
      sort_field: 'due_date',
      accountability: 'all',
    },
    fields: [
      { field: 'id', type: 'uuid', meta: { interface: 'input', readonly: true, hidden: false, special: ['uuid'] } },
      { field: 'title', type: 'string', meta: { interface: 'input', required: true } },
      { field: 'description', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'child', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'related-values', display_options: { template: '{{display_name}}' }, width: 'half' } },
      { field: 'assignee', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', required: true, width: 'half' } },
      { field: 'created_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o', 'user-created'], display: 'user', readonly: true, width: 'half' } },
      { field: 'date_created', type: 'timestamp', meta: { interface: 'datetime', readonly: true, special: ['date-created'], width: 'half' } },
      { field: 'due_date', type: 'date', meta: { interface: 'datetime', width: 'half' } },
      { field: 'priority', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Low', value: 'low' }, { text: 'Normal', value: 'normal' }, { text: 'High', value: 'high' }, { text: 'Urgent', value: 'urgent' }] } } },
      { field: 'di_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', note: 'DI owns this. Open → in_progress → completed_pending_verification.', options: { choices: [{ text: 'Open', value: 'open' }, { text: 'In progress', value: 'in_progress' }, { text: 'Completed (pending verification)', value: 'completed_pending_verification' }] } } },
      { field: 'admin_status', type: 'string', meta: { interface: 'select-dropdown', width: 'half', note: 'Admin owns this. DI cannot edit.', options: { choices: [{ text: 'Open', value: 'open' }, { text: 'Verified complete', value: 'verified_complete' }, { text: 'Rejected — redo', value: 'rejected_redo' }] } } },
      { field: 'completed_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half' } },
      { field: 'verified_at', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half' } },
      { field: 'verified_by', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', readonly: true, width: 'half' } },
    ],
  },

  // ─── audit_log ───────────────────────────────────────────────────
  {
    collection: 'audit_log',
    meta: {
      icon: 'receipt_long',
      color: '#5C5C5E',
      note: 'Append-only audit trail. DI role has zero access. Wired narrowly in Session 41-v3 (cron only).',
      display_template: '{{timestamp}} · {{actor_role}} · {{action}}',
      sort_field: 'timestamp',
      accountability: null, // do not audit the audit log itself
    },
    fields: [
      { field: 'id', type: 'uuid', meta: { interface: 'input', readonly: true, hidden: false, special: ['uuid'] } },
      { field: 'timestamp', type: 'timestamp', meta: { interface: 'datetime', readonly: true, width: 'half' } },
      { field: 'actor', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', required: true, width: 'half' } },
      { field: 'actor_role', type: 'string', meta: { interface: 'input', required: true, width: 'half' } },
      { field: 'action', type: 'string', meta: { interface: 'input', required: true, width: 'half' } },
      { field: 'collection', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'record_id', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'diff', type: 'json', meta: { interface: 'input-code', options: { language: 'JSON' } } },
      { field: 'ip', type: 'string', meta: { interface: 'input', width: 'half' } },
      { field: 'user_agent', type: 'text', meta: { interface: 'input-multiline' } },
      { field: 'metadata', type: 'json', meta: { interface: 'input-code', options: { language: 'JSON' } } },
    ],
  },
];

// ─── Field additions to existing collections ────────────────────────

const EXISTING_COLLECTION_FIELDS: { collection: string; fields: FieldDef[] }[] = [
  {
    collection: 'child',
    fields: [
      { field: 'uploaded_by_di', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', readonly: true, note: 'Set on admin approval of a child_proposal create.' } },
      { field: 'assigned_di', type: 'uuid', meta: { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user', note: 'Admin-assigned. Reassignable. Controls DI READ scope.' } },
      { field: 'district_internal', type: 'string', meta: { interface: 'input', note: 'Internal-only district label. Never exposed at Tier 1.' } },
      { field: 'support_type', type: 'string', meta: { interface: 'select-dropdown', width: 'half', options: { choices: [{ text: 'Education', value: 'education' }, { text: 'Food', value: 'food' }, { text: 'Healthcare', value: 'healthcare' }, { text: 'Clothing', value: 'clothing' }, { text: 'General care', value: 'general_care' }, { text: 'Other', value: 'other' }] } } },
      { field: 'monthly_cost', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Monthly support amount in BDT. Nullable. Existing rows backfilled to 1500.' } },
      { field: 'guardian_summary_internal', type: 'text', meta: { interface: 'input-multiline', note: 'Internal-only family context. Never exposed at any donor tier.' } },
      { field: 'last_visit_date', type: 'date', meta: { interface: 'datetime', note: 'Date of DI most recent in-person visit. Nullable.' } },
    ],
  },
  {
    collection: 'directus_users',
    fields: [
      { field: 'assigned_divisions', type: 'json', meta: { interface: 'tags', special: ['cast-json'], note: 'Array of bd_division.code values (slug strings like "dhaka", "chittagong"). Constrains DI CREATE scope. Does NOT govern READ.' } },
    ],
  },
  {
    collection: 'child_moment',
    fields: [
      { field: 'media_type', type: 'string', meta: { interface: 'select-dropdown', required: true, width: 'half', options: { choices: [{ text: 'Image', value: 'image' }, { text: 'Video', value: 'video' }] } } },
      { field: 'duration_seconds', type: 'integer', meta: { interface: 'input', width: 'half', note: 'Required for video (1–60s); must be null for image.' } },
    ],
  },
];

// ─── Main ───────────────────────────────────────────────────────────

async function login() {
  log(`Logging in to ${URL} as ${EMAIL}...`);
  await client.login(EMAIL, PASSWORD);
  log('Logged in.', 'ok');
}

async function fetchCollections() {
  // Directus auto-detects raw Postgres tables and reports them via the
  // /collections endpoint even when they have no row in
  // `directus_collections` (i.e. no explicit metadata registration).
  // Auto-detected entries return with `meta: null`; explicitly-registered
  // ones return a populated `meta` object. We only count "registered" if
  // meta is non-null — otherwise the field-creation phase fails with
  // "permission to access collection 'X' or it does not exist" because
  // the addressable-collection layer requires the metadata row.
  // (Session 41-v3-FIX3.)
  const collections = (await client.request(readCollections())) as Array<{
    collection: string;
    meta: unknown | null;
  }>;
  return new Set(
    collections.filter((c) => c.meta !== null).map((c) => c.collection),
  );
}

async function fetchFields(collection: string) {
  try {
    const fields = (await client.request(
      readFieldsByCollection(collection as never),
    )) as Array<{ field: string }>;
    return new Set(fields.map((f) => f.field));
  } catch {
    // Collection may not have any registered fields yet — return empty set.
    return new Set<string>();
  }
}

async function registerCollection(def: CollectionDef, existing: Set<string>) {
  if (existing.has(def.collection)) {
    log(`  · collection ${def.collection} (exists, skipped)`, 'skip');
    return;
  }
  try {
    await client.request(
      createCollection({
        collection: def.collection,
        meta: def.meta,
        schema: { name: def.collection },
      } as never),
    );
    log(`  ✓ collection: ${def.collection}`, 'ok');
  } catch (e: any) {
    log(`  ✗ collection ${def.collection}: ${e?.errors?.[0]?.message || e?.message || e}`, 'err');
  }
}

async function registerFields(collection: string, fields: FieldDef[]) {
  const existing = await fetchFields(collection);
  for (const f of fields) {
    if (existing.has(f.field)) {
      log(`    · field ${collection}.${f.field} (exists, skipped)`, 'skip');
      continue;
    }
    try {
      await client.request(
        createField(collection as never, {
          field: f.field,
          type: f.type,
          meta: f.meta ?? {},
          schema: f.schema ?? {},
        } as never),
      );
      log(`    ✓ field: ${collection}.${f.field}`, 'ok');
    } catch (e: any) {
      log(
        `    ✗ field ${collection}.${f.field}: ${e?.errors?.[0]?.message || e?.message || e}`,
        'err',
      );
    }
  }
}

async function main() {
  await login();

  const existing = await fetchCollections();
  log(`Found ${existing.size} existing collection(s).`, 'ok');

  log('\n=== Phase 1: Register 4 new collections ===');
  for (const def of NEW_COLLECTIONS) {
    await registerCollection(def, existing);
  }

  log('\n=== Phase 2: Register fields on new collections ===');
  for (const def of NEW_COLLECTIONS) {
    log(`  collection ${def.collection}:`);
    await registerFields(def.collection, def.fields);
  }

  log('\n=== Phase 3: Register added fields on existing collections ===');
  for (const ext of EXISTING_COLLECTION_FIELDS) {
    log(`  collection ${ext.collection}:`);
    await registerFields(ext.collection, ext.fields);
  }

  log('\n=== Collection registration complete. ===', 'ok');
  log('Next: npm run v3-update-permissions');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
