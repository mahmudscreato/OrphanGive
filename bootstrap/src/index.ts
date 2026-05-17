/**
 * OrphanGive — Directus schema bootstrap
 * ---------------------------------------
 * Creates all 17 collections, their fields and relations, 6 roles,
 * and seed data (donation buckets, initial tenant, sample site copy).
 *
 * Idempotent: safe to re-run. If a collection / field already exists
 * it logs and continues.
 *
 * Run with:
 *     npm install
 *     cp .env.example .env   (and edit it)
 *     npm run bootstrap
 */

import 'dotenv/config';
import {
  createDirectus,
  rest,
  authentication,
  createCollection,
  createField,
  createRelation,
  createRole,
  readRoles,
  createItem,
  readItems,
} from '@directus/sdk';
// Session 41-v3-FIX4 — `f.*` field-def helpers extracted to a shared
// module so v3-register-collections.ts can use the same pattern.
// `FieldDef` re-exported here under the original local name to keep
// the rest of this file unchanged.
import { f, type FieldDef } from './lib/field-helpers';

// ============================================================
// Setup
// ============================================================

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

const isAlreadyExists = (e: any): boolean => {
  const m = (e?.errors?.[0]?.message || e?.message || '').toLowerCase();
  return m.includes('already exists') || m.includes('duplicate') || m.includes('unique');
};

const safe = async <T>(label: string, work: () => Promise<T>): Promise<T | undefined> => {
  try {
    const result = await work();
    log(`  ✓ ${label}`, 'ok');
    return result;
  } catch (e: any) {
    if (isAlreadyExists(e)) {
      log(`  · ${label} (exists, skipped)`, 'skip');
      return undefined;
    }
    log(`  ✗ ${label}: ${e?.errors?.[0]?.message || e?.message || e}`, 'err');
    return undefined;
  }
};

// ============================================================
// Field shorthand
// ============================================================
//
// Session 41-v3-FIX4 — `f.*` helpers + `FieldDef` type were extracted
// to `./lib/field-helpers` so `v3-register-collections.ts` can reuse
// the same pattern. They're imported at the top of this file.

// ============================================================
// Schema definition
// ============================================================

type CollectionDef = {
  meta: { icon: string; display_template?: string; note?: string; sort_field?: string };
  fields: FieldDef[];
};

const collections: Record<string, CollectionDef> = {

  // ---------- TENANT ----------
  tenant: {
    meta: { icon: 'apartment', display_template: '{{name}}', note: 'White-label partner organisations. Founding tenant: Children\'s Heaven Trust.' },
    fields: [
      f.slug('slug'),
      f.str('name', { required: true }),
      f.file('logo'),
      f.str('primary_color', { placeholder: '#F39322' }),
      f.str('custom_domain'),
      f.json('settings'),
    ],
  },

  // ---------- DONATION BUCKET ----------
  donation_bucket: {
    meta: { icon: 'savings', display_template: '{{display_name}}', sort_field: 'sort_order', note: 'Categories that money is allocated to.' },
    fields: [
      f.enum('code', [
        'CHILD_SPONSORSHIP_MONTHLY',
        'CHILD_SPONSORSHIP_ONETIME',
        'CLOTHING_GIFT',
        'EDUCATIONAL_SUPPLIES',
        'EID_RAMADAN',
        'MEDICAL_EMERGENCY',
        'RUNNING_COSTS',
        'GENERAL_FUND',
      ], { required: true }),
      f.str('display_name', { required: true }),
      f.text('description'),
      f.str('icon', { placeholder: 'savings' }),
      f.int('sort_order'),
      f.bool('active', true),
    ],
  },

  // ---------- ADDON ----------
  addon: {
    meta: { icon: 'redeem', display_template: '{{name}} — ৳{{amount}}', sort_field: 'display_order' },
    fields: [
      f.str('name', { required: true }),
      f.text('description'),
      f.money('amount'),
      f.str('currency', { placeholder: 'BDT' }),
      f.m2o('bucket'),
      f.file('image'),
      f.int('display_order'),
      f.bool('active', true),
      f.date('valid_from'),
      f.date('valid_to'),
      f.m2o('tenant'),
    ],
  },

  // ---------- CHILD ----------
  child: {
    meta: { icon: 'child_care', display_template: '{{display_name}} ({{district}}, age {{age}})', note: 'The central record. Sensitive fields are stored encrypted at rest by the application layer.' },
    fields: [
      f.m2o('tenant'),
      f.str('display_name', { required: true }),
      f.enum('gender', ['male', 'female']),
      f.date('date_of_birth'),
      f.str('region'),
      f.str('district'),
      f.rich('story'),
      f.file('photo'),
      f.bool('photo_consent', false),
      f.enum('education_level', ['primary', 'secondary', 'madrasa', 'vocational']),
      f.str('class_grade'),
      f.tags('areas_of_interest'),
      f.enum('status', ['draft', 'pending_approval', 'active', 'sponsored', 'archived'], { required: true, def: 'draft' }),
      f.m2o('created_by'),
      f.m2o('reviewed_by'),
      f.dt('approved_at'),
      f.text('internal_notes'),
      // Encrypted fields — stored as text by Directus, encrypted/decrypted by the public site
      f.text('full_address_encrypted'),
      f.text('exact_birthdate_encrypted'),
      f.text('school_name_encrypted'),
      f.text('guardian_full_name_encrypted'),
      f.text('guardian_contact_encrypted'),
      f.text('family_circumstances_encrypted'),
    ],
  },

  // ---------- CHILD DOCUMENT ----------
  child_document: {
    meta: { icon: 'description', display_template: '{{type}} for {{child.display_name}} — {{status}}', note: 'Verification documents. Never visible to donors.' },
    fields: [
      f.m2o('child', { required: true }),
      f.enum('type', [
        'DEATH_CERTIFICATE_FATHER',
        'DEATH_CERTIFICATE_MOTHER',
        'BIRTH_CERTIFICATE',
        'SCHOOL_RECOMMENDATION',
        'MADRASA_RECOMMENDATION',
        'GUARDIAN_NID',
        'OTHER',
      ], { required: true }),
      f.fileAny('file'),
      f.enum('status', ['pending_review', 'verified', 'rejected', 'replacement_requested', 'waived'], { required: true, def: 'pending_review' }),
      f.m2o('uploaded_by'),
      f.m2o('reviewed_by'),
      f.text('review_notes'),
      f.text('waiver_justification'),
    ],
  },

  // ---------- CHILD UPDATE ----------
  child_update: {
    meta: { icon: 'campaign', display_template: '{{title}} — {{type}}', note: 'Progress updates posted about a child.' },
    fields: [
      f.m2o('child', { required: true }),
      f.enum('type', ['academic', 'health', 'story', 'photo', 'milestone', 'eid_greeting', 'letter'], { required: true }),
      f.str('title', { required: true }),
      f.rich('content'),
      f.file('photo'),
      f.enum('visibility', ['sponsor_only', 'all_donors'], { required: true, def: 'all_donors' }),
      f.enum('status', ['draft', 'pending', 'published', 'rejected'], { required: true, def: 'draft' }),
      f.m2o('created_by'),
      f.m2o('approved_by'),
      f.dt('published_at'),
      f.text('rejection_reason'),
    ],
  },

  // ---------- SPONSORSHIP ----------
  sponsorship: {
    meta: { icon: 'volunteer_activism', display_template: '{{donor.email}} → {{child.display_name}} ({{status}})' },
    fields: [
      f.m2o('donor', { required: true }),
      f.m2o('child', { required: true }),
      f.money('monthly_amount'),
      f.str('currency', { placeholder: 'BDT' }),
      f.enum('tier', ['foundation', 'standard', 'premium'], { required: true, def: 'standard' }),
      f.int('duration_months'),
      f.date('start_date'),
      f.date('end_date'),
      f.enum('status', ['pending', 'active', 'paused', 'ended', 'cancelled', 'rejected'], { required: true, def: 'pending' }),
      f.text('application_reason'),
      f.m2o('approved_by'),
      f.text('message_to_caretaker'),
    ],
  },

  // ---------- DONATION ----------
  donation: {
    meta: { icon: 'payments', display_template: '৳{{amount}} — {{bucket.display_name}} ({{status}})' },
    fields: [
      f.m2o('donor', { required: true }),
      f.m2o('sponsorship'),
      f.m2o('child'),
      f.money('amount'),
      f.str('currency', { placeholder: 'BDT' }),
      f.m2o('bucket', { required: true }),
      f.str('parent_transaction_id', { placeholder: 'Groups multi-bucket payments together' }),
      f.enum('gateway', ['sslcommerz', 'stripe', 'manual'], { required: true }),
      f.str('gateway_reference'),
      f.enum('status', ['pending', 'succeeded', 'failed', 'refunded'], { required: true, def: 'pending' }),
      f.m2o('addon'),
      f.dt('paid_at'),
      f.str('receipt_url'),
    ],
  },

  // ---------- REPORT ----------
  report: {
    meta: { icon: 'picture_as_pdf', display_template: 'Report — {{child.display_name}} ({{period}})' },
    fields: [
      f.m2o('sponsorship', { required: true }),
      f.m2o('child', { required: true }),
      f.str('period', { placeholder: '2026-Q1', required: true }),
      f.fileAny('pdf_file'),
      f.dt('generated_at'),
      f.dt('emailed_at'),
    ],
  },

  // ---------- REVEAL REQUEST ----------
  reveal_request: {
    meta: { icon: 'visibility', display_template: '{{donor.email}} wants {{field_name}} of {{child.display_name}} — {{status}}' },
    fields: [
      f.m2o('donor', { required: true }),
      f.m2o('child', { required: true }),
      f.enum('field_name', ['full_address', 'exact_birthdate', 'school_name', 'guardian_full_name', 'guardian_contact'], { required: true }),
      f.text('reason'),
      f.enum('status', ['pending', 'approved', 'rejected', 'revoked'], { required: true, def: 'pending' }),
      f.text('decision'),
      f.m2o('decided_by'),
      f.dt('decided_at'),
      f.dt('revoked_at'),
    ],
  },

  // ---------- NOTIFICATION ----------
  notification: {
    meta: { icon: 'notifications', display_template: '{{type}} for {{recipient.email}}' },
    fields: [
      f.m2o('recipient', { required: true }),
      f.str('type', { required: true }),
      f.json('payload'),
      f.bool('read', false),
      f.dt('read_at'),
    ],
  },

  // ---------- CONTACT SUBMISSION ----------
  contact_submission: {
    meta: { icon: 'mail', display_template: '{{subject}} — {{name}}' },
    fields: [
      f.str('name', { required: true }),
      f.str('email', { required: true }),
      f.str('subject'),
      f.text('message'),
      f.enum('status', ['new', 'read', 'responded', 'archived'], { required: true, def: 'new' }),
    ],
  },

  // ---------- SITE CONTENT ----------
  site_content: {
    meta: { icon: 'article', display_template: '{{section_key}} ({{language}})', note: 'Editable copy on the public website. Each section_key is a placeholder the website renders.' },
    fields: [
      f.str('section_key', { required: true, unique: true }),
      f.rich('content'),
      f.enum('language', ['en', 'bn'], { required: true, def: 'en' }),
      f.m2o('updated_by'),
      f.dt('updated_at'),
    ],
  },

  // ---------- SITE PAGE ----------
  site_page: {
    meta: { icon: 'description', display_template: '{{title}} — /{{slug}}' },
    fields: [
      f.slug('slug'),
      f.str('title', { required: true }),
      f.rich('content'),
      f.text('meta_description'),
      f.file('seo_image'),
      f.enum('language', ['en', 'bn'], { required: true, def: 'en' }),
      f.enum('status', ['draft', 'published'], { required: true, def: 'draft' }),
      f.dt('published_at'),
    ],
  },

  // ---------- FAQ ----------
  faq: {
    meta: { icon: 'help', display_template: '{{question}}', sort_field: 'display_order' },
    fields: [
      f.enum('category', ['general', 'sponsorship', 'payment', 'safeguarding', 'for_charities'], { required: true, def: 'general' }),
      f.str('question', { required: true }),
      f.rich('answer'),
      f.int('display_order'),
      f.bool('active', true),
    ],
  },

  // ---------- STORY ----------
  story: {
    meta: { icon: 'auto_stories', display_template: '{{title}}' },
    fields: [
      f.str('title', { required: true }),
      f.slug('slug'),
      f.text('excerpt'),
      f.rich('content'),
      f.file('cover_image'),
      f.str('byline'),
      f.dt('published_at'),
      f.enum('status', ['draft', 'published'], { required: true, def: 'draft' }),
      f.tags('tags'),
    ],
  },
};

// Custom fields to add to the built-in directus_users collection
const userExtensions: FieldDef[] = [
  f.enum('og_role', ['super_admin', 'admin', 'data_inputter', 'legal_guardian', 'donor', 'org_donor'], { def: 'donor' }),
  f.enum('og_status', ['pending_email_verification', 'pending_approval', 'active', 'suspended', 'rejected'], { def: 'pending_email_verification' }),
  f.m2o('og_tenant'),
  f.str('phone'),
  f.str('country'),
  f.enum('display_preference', ['full_name', 'first_name', 'anonymous'], { def: 'full_name' }),
  f.bool('is_organization', false),
  f.str('organization_name'),
  f.enum('kyc_status', ['not_started', 'pending', 'verified', 'failed'], { def: 'not_started' }),
  f.str('assigned_region'),
  f.text('nid_encrypted'),
  f.text('full_address_encrypted'),
];

// Relations: which M2O fields map to which collection
const relations: { collection: string; field: string; related_collection: string }[] = [
  { collection: 'addon', field: 'bucket', related_collection: 'donation_bucket' },
  { collection: 'addon', field: 'tenant', related_collection: 'tenant' },
  { collection: 'child', field: 'tenant', related_collection: 'tenant' },
  { collection: 'child', field: 'created_by', related_collection: 'directus_users' },
  { collection: 'child', field: 'reviewed_by', related_collection: 'directus_users' },
  { collection: 'child_document', field: 'child', related_collection: 'child' },
  { collection: 'child_document', field: 'uploaded_by', related_collection: 'directus_users' },
  { collection: 'child_document', field: 'reviewed_by', related_collection: 'directus_users' },
  { collection: 'child_update', field: 'child', related_collection: 'child' },
  { collection: 'child_update', field: 'created_by', related_collection: 'directus_users' },
  { collection: 'child_update', field: 'approved_by', related_collection: 'directus_users' },
  { collection: 'sponsorship', field: 'donor', related_collection: 'directus_users' },
  { collection: 'sponsorship', field: 'child', related_collection: 'child' },
  { collection: 'sponsorship', field: 'approved_by', related_collection: 'directus_users' },
  { collection: 'donation', field: 'donor', related_collection: 'directus_users' },
  { collection: 'donation', field: 'sponsorship', related_collection: 'sponsorship' },
  { collection: 'donation', field: 'child', related_collection: 'child' },
  { collection: 'donation', field: 'bucket', related_collection: 'donation_bucket' },
  { collection: 'donation', field: 'addon', related_collection: 'addon' },
  { collection: 'report', field: 'sponsorship', related_collection: 'sponsorship' },
  { collection: 'report', field: 'child', related_collection: 'child' },
  { collection: 'reveal_request', field: 'donor', related_collection: 'directus_users' },
  { collection: 'reveal_request', field: 'child', related_collection: 'child' },
  { collection: 'reveal_request', field: 'decided_by', related_collection: 'directus_users' },
  { collection: 'notification', field: 'recipient', related_collection: 'directus_users' },
  { collection: 'site_content', field: 'updated_by', related_collection: 'directus_users' },
  { collection: 'directus_users', field: 'og_tenant', related_collection: 'tenant' },
];

// Roles to create. (Super Admin is built-in.)
const newRoles = [
  { name: 'Admin', icon: 'verified_user', description: 'Manages a single tenant: approves children, donors, documents, reveal requests, updates.' },
  { name: 'Data Inputter', icon: 'person_add', description: 'Adds and updates child profiles. Submissions require admin approval.' },
  { name: 'Legal Guardian', icon: 'family_restroom', description: 'Verified guardian of a specific child. Can manage that child\'s profile only. (Phase 2 public flow.)' },
  { name: 'Donor', icon: 'volunteer_activism', description: 'Sponsors children. Read-only on public child fields, writes on own sponsorships and reveal requests.' },
  { name: 'Org Donor', icon: 'corporate_fare', description: 'Same as Donor, plus organisational profile fields.' },
];

// Seed donation buckets
const seedBuckets = [
  { code: 'CHILD_SPONSORSHIP_MONTHLY', display_name: 'Monthly child sponsorship', description: 'Recurring monthly sponsorship payments to a specific child.', icon: 'family_restroom', sort_order: 1, active: true },
  { code: 'CHILD_SPONSORSHIP_ONETIME', display_name: 'One-time gift to sponsored child', description: 'One-off payments to a child the donor already sponsors.', icon: 'card_giftcard', sort_order: 2, active: true },
  { code: 'CLOTHING_GIFT', display_name: 'Clothing gift', description: 'New clothes — Eid outfits, winter coats, school uniforms.', icon: 'checkroom', sort_order: 3, active: true },
  { code: 'EDUCATIONAL_SUPPLIES', display_name: 'Educational supplies', description: 'Textbooks, notebooks, pens, geometry sets, school bags.', icon: 'menu_book', sort_order: 4, active: true },
  { code: 'EID_RAMADAN', display_name: 'Eid & Ramadan campaign', description: 'Seasonal campaign donations for Ramadan and Eid.', icon: 'mosque', sort_order: 5, active: true },
  { code: 'MEDICAL_EMERGENCY', display_name: 'Medical emergency fund', description: 'Urgent medical care for children in need.', icon: 'medical_services', sort_order: 6, active: true },
  { code: 'RUNNING_COSTS', display_name: 'OrphanGive running costs', description: 'Voluntary contributions covering verification, technology, secure payments.', icon: 'settings', sort_order: 7, active: true },
  { code: 'GENERAL_FUND', display_name: 'General fund', description: 'Untagged donations — admin allocates to greatest need.', icon: 'inbox', sort_order: 8, active: true },
];

// Seed addons
const seedAddons = [
  { name: 'New clothes for Eid', description: 'A complete Eid outfit: kurta, trousers, shoes. Photographed and shared with the sponsor.', amount: 2000, currency: 'BDT', bucket_code: 'CLOTHING_GIFT', display_order: 1, active: true },
  { name: 'Educational supplies for the term', description: 'Textbooks, notebooks, pens, geometry set, school bag.', amount: 1500, currency: 'BDT', bucket_code: 'EDUCATIONAL_SUPPLIES', display_order: 2, active: true },
  { name: 'Medical checkup support', description: 'Annual full health checkup, dental, and any urgent care this year.', amount: 1000, currency: 'BDT', bucket_code: 'MEDICAL_EMERGENCY', display_order: 3, active: true },
  { name: 'Winter clothing', description: 'Warm jacket, woollen jumper, warm footwear.', amount: 2500, currency: 'BDT', bucket_code: 'CLOTHING_GIFT', display_order: 4, active: true },
];

// Seed site_content — homepage and key copy
const seedSiteContent = [
  { section_key: 'homepage_hero_tag', content: 'A sponsorship network · Bangladesh', language: 'en' },
  { section_key: 'homepage_hero_headline', content: 'Every child carries a <em>story</em><br/>still being written.', language: 'en' },
  { section_key: 'homepage_hero_sub', content: 'OrphanGive connects verified orphan children in Bangladesh with sponsors who fund their education, follow their progress, and stay with them for years. Not weeks. Years.', language: 'en' },
  { section_key: 'homepage_promise_headline', content: 'We are not a giving service.<br/>We are a <strong>long-form</strong><br/>relationship.', language: 'en' },
  { section_key: 'homepage_faith_quote', content: '"The believer\'s shade on the Day of Judgement<br/>will be their charity."', language: 'en' },
  { section_key: 'homepage_closing_headline', content: 'Begin <em>today.</em>', language: 'en' },
  { section_key: 'footer_org_description', content: 'Operated by Children\'s Heaven Trust, a registered charity in Bangladesh. Built for orphan children. Built to last.', language: 'en' },
];

// Seed FAQ
const seedFAQ = [
  { category: 'sponsorship', question: 'How do I begin sponsoring a child?', answer: '<p>Browse our verified profiles, choose a child whose story moves you, create an account, and complete the sponsorship checkout. An admin reviews your application within 48 hours.</p>', display_order: 1, active: true },
  { category: 'sponsorship', question: 'Can I cancel my sponsorship?', answer: '<p>Yes — at any time, no questions asked. Visit your dashboard, find the sponsorship, and click cancel. We will email confirmation and stop future payments immediately.</p>', display_order: 2, active: true },
  { category: 'payment', question: 'What payment methods do you accept?', answer: '<p>For donors in Bangladesh: bKash, Nagad, Visa, Mastercard, and bank transfer via SSLCommerz. For international donors: Visa, Mastercard, and bank transfer via Stripe.</p>', display_order: 1, active: true },
  { category: 'safeguarding', question: 'Why are some details about the child hidden?', answer: '<p>To protect children from harm, we keep their full address, school name, guardian contact, and exact birthdate private by default — even from their sponsor. If you have a clear reason to view any of these (sending a gift, planning a visit, tax records), you can request access. Our safeguarding team reviews each request.</p>', display_order: 1, active: true },
];

// ============================================================
// Execution
// ============================================================

async function login() {
  log(`Logging in to ${URL} as ${EMAIL}...`);
  await client.login(EMAIL, PASSWORD);
  log('Logged in.', 'ok');
}

async function buildCollections() {
  log('\n=== Phase 1: Collections ===');
  for (const [name, def] of Object.entries(collections)) {
    await safe(`collection: ${name}`, () =>
      client.request(createCollection({
        collection: name,
        meta: { collection: name, ...def.meta },
        schema: { name },
        fields: [{
          field: 'id',
          type: 'uuid',
          meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
          schema: { is_primary_key: true, has_auto_increment: false }
        }],
      }))
    );
  }
}

async function buildFields() {
  log('\n=== Phase 2: Fields ===');
  for (const [collectionName, def] of Object.entries(collections)) {
    log(`Adding fields for: ${collectionName}`);
    for (const field of def.fields) {
      await safe(`${collectionName}.${field.field}`, () =>
        client.request(createField(collectionName, field as any))
      );
    }
  }
  log('\n=== Phase 2b: directus_users custom fields ===');
  for (const field of userExtensions) {
    await safe(`directus_users.${field.field}`, () =>
      client.request(createField('directus_users', field as any))
    );
  }
}

async function buildRelations() {
  log('\n=== Phase 3: Relations ===');
  for (const r of relations) {
    await safe(`${r.collection}.${r.field} -> ${r.related_collection}`, () =>
      client.request(createRelation({
        collection: r.collection,
        field: r.field,
        related_collection: r.related_collection,
        meta: {
          junction_field: null,
          many_collection: r.collection,
          many_field: r.field,
          one_collection: r.related_collection,
          sort_field: null,
        },
        schema: {
          on_delete: 'SET NULL',
        },
      } as any))
    );
  }
}

async function buildRoles() {
  log('\n=== Phase 4: Roles ===');
  const existing = await client.request(readRoles({ limit: -1 }));
  const existingNames = new Set(existing.map((r: any) => r.name));
  for (const role of newRoles) {
    if (existingNames.has(role.name)) {
      log(`  · role ${role.name} (exists, skipped)`, 'skip');
      continue;
    }
    await safe(`role: ${role.name}`, () =>
      client.request(createRole({
        name: role.name,
        icon: role.icon,
        description: role.description,
        admin_access: false,
        app_access: role.name === 'Admin' || role.name === 'Data Inputter',
      } as any))
    );
  }
}

async function seedDonationBuckets() {
  log('\n=== Phase 5: Seed donation buckets ===');
  // Skip if any exist already
  try {
    const existing = await client.request(readItems('donation_bucket' as any, { limit: 1 } as any));
    if (Array.isArray(existing) && existing.length > 0) {
      log('  · donation buckets already seeded, skipping', 'skip');
      return;
    }
  } catch {}
  for (const bucket of seedBuckets) {
    await safe(`bucket: ${bucket.code}`, () =>
      client.request(createItem('donation_bucket' as any, bucket as any))
    );
  }
}

async function seedFoundingTenant() {
  log('\n=== Phase 6: Seed founding tenant ===');
  try {
    const existing = await client.request(readItems('tenant' as any, { limit: 1 } as any));
    if (Array.isArray(existing) && existing.length > 0) {
      log('  · tenant already seeded, skipping', 'skip');
      return;
    }
  } catch {}
  await safe(`tenant: Children's Heaven Trust`, () =>
    client.request(createItem('tenant' as any, {
      slug: 'childrens-heaven-trust',
      name: "Children's Heaven Trust",
      primary_color: '#F39322',
    } as any))
  );
}

async function seedAddonsData() {
  log('\n=== Phase 7: Seed sample add-ons ===');
  try {
    const existing = await client.request(readItems('addon' as any, { limit: 1 } as any));
    if (Array.isArray(existing) && existing.length > 0) {
      log('  · addons already seeded, skipping', 'skip');
      return;
    }
  } catch {}
  // Lookup buckets to get their IDs
  const buckets = await client.request(readItems('donation_bucket' as any, { limit: -1 } as any));
  const bucketByCode: Record<string, string> = {};
  for (const b of buckets as any[]) bucketByCode[b.code] = b.id;
  for (const addon of seedAddons) {
    const { bucket_code, ...rest } = addon;
    await safe(`addon: ${addon.name}`, () =>
      client.request(createItem('addon' as any, { ...rest, bucket: bucketByCode[bucket_code] } as any))
    );
  }
}

async function seedSiteContentData() {
  log('\n=== Phase 8: Seed site copy ===');
  try {
    const existing = await client.request(readItems('site_content' as any, { limit: 1 } as any));
    if (Array.isArray(existing) && existing.length > 0) {
      log('  · site_content already seeded, skipping', 'skip');
      return;
    }
  } catch {}
  for (const item of seedSiteContent) {
    await safe(`site_content: ${item.section_key}`, () =>
      client.request(createItem('site_content' as any, item as any))
    );
  }
}

async function seedFAQData() {
  log('\n=== Phase 9: Seed FAQ ===');
  try {
    const existing = await client.request(readItems('faq' as any, { limit: 1 } as any));
    if (Array.isArray(existing) && existing.length > 0) {
      log('  · faq already seeded, skipping', 'skip');
      return;
    }
  } catch {}
  for (const item of seedFAQ) {
    await safe(`faq: ${item.question}`, () =>
      client.request(createItem('faq' as any, item as any))
    );
  }
}

async function main() {
  const onlyArg = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
  const doSchema = !onlyArg || onlyArg === 'schema';
  const doSeed = !onlyArg || onlyArg === 'seed';

  await login();

  if (doSchema) {
    await buildCollections();
    await buildFields();
    await buildRelations();
    await buildRoles();
  }

  if (doSeed) {
    await seedDonationBuckets();
    await seedFoundingTenant();
    await seedAddonsData();
    await seedSiteContentData();
    await seedFAQData();
  }

  log('\n=== Bootstrap complete. ===', 'ok');
  log('Next steps:');
  log('  1. Open Directus → Settings → Roles & Permissions, refine field-level permissions per role.');
  log('  2. Open Directus → User Directory, invite your team and assign their role.');
  log('  3. In .env of your Directus stack, set STORAGE_LOCATIONS=cloud once Cloudinary is configured.');
  log('  4. Begin Part 2 — public website build with Claude Code.');
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
