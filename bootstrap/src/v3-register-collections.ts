/**
 * OrphanGive — Session 41-v3 — register collections + fields + relations
 * ----------------------------------------------------------------------
 * Creates the 4 new DI Dashboard collections (`child_proposal`,
 * `aid_delivery`, `task`, `audit_log`) end-to-end via @directus/sdk
 * — table + metadata + fields + relations all in one pass. Mirrors
 * the C1 bootstrap pattern in `src/index.ts` exactly:
 *
 *   Phase 1 — createCollection (with id PK in fields[])
 *   Phase 2 — createField for each non-id field
 *   Phase 3 — createField for the new fields on existing collections
 *             (child, directus_users, child_moment) whose underlying
 *             columns were already added by 001-schema.sql
 *   Phase 4 — createRelation for each FK on the new collections
 *             (FKs on the existing-collection extensions are already
 *             set at the Postgres level by 001-schema.sql; Directus
 *             auto-introspects them — no explicit relation needed
 *             unless the admin UI dropdown breaks)
 *
 * Field defs use the shared `f.*` helpers from `./lib/field-helpers`.
 * The bd_division FK column needs custom handling because its target
 * PK is varchar `code`, not uuid `id` — defined inline as
 * `bdDivisionFkField()` below.
 *
 * Idempotent: safe to re-run. Existing collections / fields / relations
 * are detected and skipped.
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
  createRelation,
  readCollections,
  readFieldsByCollection,
  readRelations,
} from '@directus/sdk';
import { f, type FieldDef } from './lib/field-helpers';

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

// ─── bd_division FK column (custom — non-uuid target) ──────────────
//
// `bd_division` PK is varchar `code` (slugs: 'dhaka', 'chittagong', …),
// not uuid `id`. C1's `f.m2o` assumes uuid. Don't touch the helper —
// hand-craft the field def for this one column.
function bdDivisionFkField(opts: { required?: boolean } = {}): FieldDef {
  return {
    field: 'bd_division',
    type: 'string',
    meta: {
      interface: 'select-dropdown-m2o',
      special: ['m2o'],
      required: opts.required ?? false,
      display: 'related-values',
      display_options: { template: '{{name}}' },
    },
    schema: { is_nullable: !(opts.required ?? false) },
  };
}

// ─── Photo M2O (capital P, custom field name) ──────────────────────
// Same shape as `f.file` but with the C1-era 'Photo' field name.
function photoFkField(opts: { required?: boolean } = {}): FieldDef {
  return {
    field: 'Photo',
    type: 'uuid',
    meta: { interface: 'file-image', special: ['file'] },
    schema: { is_nullable: !(opts.required ?? false) },
  };
}

// ─── Collection definitions (mirrors C1's `collections` map shape) ─

type CollectionDef = {
  meta: Record<string, unknown>;
  fields: FieldDef[];
};

const NEW_COLLECTIONS: Record<string, CollectionDef> = {
  child_proposal: {
    meta: {
      icon: 'pending_actions',
      color: '#ED8B3F',
      note: 'DI-originated proposed mutations to child records. Workflow: draft → pending → approved | rejected.',
      display_template: '{{proposal_type}} · {{display_name}} · {{status}}',
      sort_field: 'date_created',
      accountability: 'all',
    },
    fields: [
      f.enum('proposal_type', ['create', 'update'], { required: true }),
      f.m2o('target_child', { required: false }),
      f.str('display_name'),
      f.str('first_name'),
      f.date('date_of_birth'),
      f.str('gender'),
      bdDivisionFkField({ required: false }),
      f.str('district_internal'),
      photoFkField({ required: false }),
      f.text('story'),
      f.str('education_level'),
      f.str('class_grade'),
      f.enum('support_type', ['education', 'food', 'healthcare', 'clothing', 'general_care', 'other']),
      f.int('monthly_cost', true),
      f.text('guardian_summary_internal'),
      f.date('last_visit_date'),
      f.enum('status', ['draft', 'pending', 'approved', 'rejected'], { required: true, def: 'draft' }),
      f.text('rejection_reason'),
      f.m2o('created_by', { required: true }),
      f.m2o('approved_by', { required: false }),
      f.dt('date_created'),
      f.dt('published_at'),
      f.json('previous_snapshot'),
    ],
  },

  aid_delivery: {
    meta: {
      icon: 'redeem',
      color: '#9FBFD9',
      note: 'DI-recorded aid delivery events. Photo + description + optional acknowledgment. Admin verifies.',
      display_template: '{{delivery_date}} · {{aid_type}} · {{status}}',
      sort_field: 'delivery_date',
      accountability: 'all',
    },
    fields: [
      f.m2o('child', { required: true }),
      f.m2o('sponsorship', { required: false }),
      f.enum('aid_type', ['education', 'food', 'healthcare', 'clothing', 'general_care', 'other'], { required: true }),
      f.text('description'),
      f.date('delivery_date'),
      f.file('photo'),
      f.text('recipient_acknowledgment'),
      f.enum('status', ['pending', 'verified', 'rejected'], { required: true, def: 'pending' }),
      f.text('rejection_reason'),
      f.m2o('delivered_by', { required: true }),
      f.m2o('verified_by', { required: false }),
      f.dt('date_created'),
      f.dt('verified_at'),
    ],
  },

  task: {
    meta: {
      icon: 'task_alt',
      color: '#F4B400',
      note: 'Admin-assigned work items for DI. di_status owned by DI; admin_status owned by admin.',
      display_template: '{{title}} · {{di_status}}',
      sort_field: 'due_date',
      accountability: 'all',
    },
    fields: [
      f.str('title', { required: true }),
      f.text('description'),
      f.m2o('child', { required: false }),
      f.m2o('assignee', { required: true }),
      f.m2o('created_by', { required: true }),
      f.dt('date_created'),
      f.date('due_date'),
      f.enum('priority', ['low', 'normal', 'high', 'urgent'], { def: 'normal' }),
      f.enum('di_status', ['open', 'in_progress', 'completed_pending_verification'], { def: 'open' }),
      f.enum('admin_status', ['open', 'verified_complete', 'rejected_redo'], { def: 'open' }),
      f.dt('completed_at'),
      f.dt('verified_at'),
      f.m2o('verified_by', { required: false }),
    ],
  },

  audit_log: {
    meta: {
      icon: 'receipt_long',
      color: '#5C5C5E',
      note: 'Append-only audit trail. DI role has zero access. Wired narrowly in Session 41-v3 (cron only).',
      display_template: '{{timestamp}} · {{actor_role}} · {{action}}',
      sort_field: 'timestamp',
      accountability: null, // do not audit the audit log itself
    },
    fields: [
      f.dt('timestamp'),
      f.m2o('actor', { required: true }),
      f.str('actor_role', { required: true }),
      f.str('action', { required: true }),
      f.str('collection'),
      f.str('record_id'),
      f.json('diff'),
      f.str('ip'),
      f.text('user_agent'),
      f.json('metadata'),
    ],
  },
};

// ─── Relations to register in Phase 4 ──────────────────────────────
//
// One entry per FK on the new collections. C1's pattern: type the
// target table; Directus + Postgres figure out the FK column itself.
// All point at uuid `id` PKs except bd_division which uses varchar
// `code` — Directus's auto-discovery handles the column-type mismatch
// because we declared the field's column type as 'string' above.

type RelationDef = {
  collection: string;
  field: string;
  related_collection: string;
};

const NEW_RELATIONS: RelationDef[] = [
  // child_proposal
  { collection: 'child_proposal', field: 'target_child',  related_collection: 'child' },
  { collection: 'child_proposal', field: 'bd_division',   related_collection: 'bd_division' },
  { collection: 'child_proposal', field: 'Photo',         related_collection: 'directus_files' },
  { collection: 'child_proposal', field: 'created_by',    related_collection: 'directus_users' },
  { collection: 'child_proposal', field: 'approved_by',   related_collection: 'directus_users' },
  // aid_delivery
  { collection: 'aid_delivery',   field: 'child',         related_collection: 'child' },
  { collection: 'aid_delivery',   field: 'sponsorship',   related_collection: 'sponsorship' },
  { collection: 'aid_delivery',   field: 'photo',         related_collection: 'directus_files' },
  { collection: 'aid_delivery',   field: 'delivered_by',  related_collection: 'directus_users' },
  { collection: 'aid_delivery',   field: 'verified_by',   related_collection: 'directus_users' },
  // task
  { collection: 'task',           field: 'child',         related_collection: 'child' },
  { collection: 'task',           field: 'assignee',      related_collection: 'directus_users' },
  { collection: 'task',           field: 'created_by',    related_collection: 'directus_users' },
  { collection: 'task',           field: 'verified_by',   related_collection: 'directus_users' },
  // audit_log
  { collection: 'audit_log',      field: 'actor',         related_collection: 'directus_users' },
];

// ─── Field additions to existing collections (Phase 3) ─────────────
//
// These columns were already added at the Postgres level by
// 001-schema.sql (with their FK constraints if applicable). Here we
// register the Directus metadata so the admin UI knows about them.
// Each helper produces a schema block — Directus ignores most schema
// fields when the column already exists, but `is_nullable` /
// `default_value` / `is_unique` get reconciled.

const EXISTING_COLLECTION_FIELDS: { collection: string; fields: FieldDef[] }[] = [
  {
    collection: 'child',
    fields: [
      // Both DI tracking columns are uuid FKs → directus_users.
      // Use f.m2o for the metadata; FK already enforced at Postgres
      // level by 001-schema.sql. No createRelation needed unless the
      // admin UI's m2o dropdown picker fails to populate.
      f.m2o('uploaded_by_di'),
      f.m2o('assigned_di'),
      f.str('district_internal'),
      f.enum('support_type', ['education', 'food', 'healthcare', 'clothing', 'general_care', 'other']),
      f.int('monthly_cost', true),
      f.text('guardian_summary_internal'),
      f.date('last_visit_date'),
    ],
  },
  {
    collection: 'directus_users',
    fields: [
      // assigned_divisions is jsonb storing array of bd_division.code
      // slugs. Use f.json for the editor; could also be f.tags but
      // tags is csv-backed and we want jsonb.
      f.json('assigned_divisions'),
    ],
  },
  {
    collection: 'child_moment',
    fields: [
      f.enum('media_type', ['image', 'video']),
      f.int('duration_seconds', true),
    ],
  },
];

// ─── SDK helpers ────────────────────────────────────────────────────

async function login() {
  log(`Logging in to ${URL} as ${EMAIL}...`);
  await client.login(EMAIL!, PASSWORD!);
  log('Logged in.', 'ok');
}

async function fetchRegisteredCollections() {
  // Filter to FORMALLY-registered (meta !== null). Auto-introspected
  // raw Postgres tables show up in readCollections() with meta: null
  // and would falsely register as "exists" — Session 41-v3-FIX3 fix.
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
    return new Set<string>();
  }
}

async function fetchRelations() {
  try {
    const relations = (await client.request(readRelations())) as Array<{
      collection: string;
      field: string;
    }>;
    // Key by `${collection}.${field}` so we can dedupe per-FK.
    return new Set(relations.map((r) => `${r.collection}.${r.field}`));
  } catch {
    return new Set<string>();
  }
}

async function registerCollection(name: string, def: CollectionDef, existing: Set<string>) {
  if (existing.has(name)) {
    log(`  · collection ${name} (exists, skipped)`, 'skip');
    return;
  }
  try {
    // C1's proven pattern: createCollection with id PK in fields[].
    // Directus uses fields[] to scaffold the underlying Postgres
    // table — the id PK declaration creates the `id uuid PRIMARY KEY
    // DEFAULT gen_random_uuid()` column.
    await client.request(
      createCollection({
        collection: name,
        meta: { collection: name, ...def.meta },
        schema: { name },
        fields: [
          {
            field: 'id',
            type: 'uuid',
            meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
            schema: { is_primary_key: true, has_auto_increment: false },
          },
        ],
      } as never),
    );
    log(`  ✓ collection: ${name}`, 'ok');
  } catch (e: any) {
    log(`  ✗ collection ${name}: ${e?.errors?.[0]?.message || e?.message || e}`, 'err');
  }
}

async function registerFields(collection: string, fields: FieldDef[]) {
  const existing = await fetchFields(collection);
  for (const fld of fields) {
    if (existing.has(fld.field)) {
      log(`    · field ${collection}.${fld.field} (exists, skipped)`, 'skip');
      continue;
    }
    try {
      await client.request(
        createField(collection as never, {
          field: fld.field,
          type: fld.type,
          meta: fld.meta ?? {},
          schema: fld.schema ?? {},
        } as never),
      );
      log(`    ✓ field: ${collection}.${fld.field}`, 'ok');
    } catch (e: any) {
      log(
        `    ✗ field ${collection}.${fld.field}: ${e?.errors?.[0]?.message || e?.message || e}`,
        'err',
      );
    }
  }
}

async function registerRelation(rel: RelationDef, existing: Set<string>) {
  const key = `${rel.collection}.${rel.field}`;
  if (existing.has(key)) {
    log(`  · relation ${key} → ${rel.related_collection} (exists, skipped)`, 'skip');
    return;
  }
  try {
    // Mirror C1's createRelation pattern verbatim (src/index.ts §
    // buildRelations). on_delete: 'SET NULL' is the conservative
    // default — DI proposals shouldn't cascade-delete real data.
    await client.request(
      createRelation({
        collection: rel.collection,
        field: rel.field,
        related_collection: rel.related_collection,
        meta: {
          junction_field: null,
          many_collection: rel.collection,
          many_field: rel.field,
          one_collection: rel.related_collection,
          sort_field: null,
        },
        schema: { on_delete: 'SET NULL' },
      } as never),
    );
    log(`  ✓ relation: ${key} → ${rel.related_collection}`, 'ok');
  } catch (e: any) {
    log(
      `  ✗ relation ${key}: ${e?.errors?.[0]?.message || e?.message || e}`,
      'err',
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  await login();

  const registered = await fetchRegisteredCollections();
  log(`Found ${registered.size} formally-registered collection(s).`, 'ok');

  log('\n=== Phase 1: Register 4 new collections (with id PK) ===');
  for (const [name, def] of Object.entries(NEW_COLLECTIONS)) {
    await registerCollection(name, def, registered);
  }

  log('\n=== Phase 2: Register fields on new collections ===');
  for (const [name, def] of Object.entries(NEW_COLLECTIONS)) {
    log(`  collection ${name}:`);
    await registerFields(name, def.fields);
  }

  log('\n=== Phase 3: Register added fields on existing collections ===');
  for (const ext of EXISTING_COLLECTION_FIELDS) {
    log(`  collection ${ext.collection}:`);
    await registerFields(ext.collection, ext.fields);
  }

  log('\n=== Phase 4: Register relations on new collections ===');
  const existingRelations = await fetchRelations();
  for (const rel of NEW_RELATIONS) {
    await registerRelation(rel, existingRelations);
  }

  log('\n=== Collection registration complete. ===', 'ok');
  log('Next: npm run v3-update-permissions');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
