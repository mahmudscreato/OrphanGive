/**
 * OrphanGive — Directus field-definition helpers
 * -----------------------------------------------
 * Extracted from `src/index.ts` (C1 bootstrap) in Session 41-v3-FIX4.
 * All `f.*` helpers preserved VERBATIM from C1 — same signatures,
 * same return shapes, same defaults. Do not refactor here without
 * also updating every consumer (currently `src/index.ts` and
 * `src/v3-register-collections.ts`).
 *
 * The `FieldDef` shape matches what `@directus/sdk`'s `createField`
 * expects: `{ field, type, meta, schema }`. Each helper produces
 * BOTH `meta` and `schema` blocks so Directus has everything it
 * needs to scaffold the underlying Postgres column.
 *
 * NOTE: f.m2o sets the column type and m2o interface but does NOT
 * declare the foreign key. The FK is configured in a SEPARATE
 * `createRelation` call (see C1's Phase 3, mirrored as Phase 4 in
 * v3-register-collections.ts).
 */

export type FieldDef = {
  field: string;
  type: string;
  meta?: any;
  schema?: any;
};

export const f = {
  // Plain text
  str: (field: string, opts: { required?: boolean; nullable?: boolean; unique?: boolean; placeholder?: string } = {}): FieldDef => ({
    field, type: 'string',
    meta: { interface: 'input', required: opts.required ?? false, options: { placeholder: opts.placeholder } },
    schema: { is_nullable: opts.nullable ?? !opts.required, is_unique: opts.unique ?? false },
  }),

  // Multiline text
  text: (field: string): FieldDef => ({
    field, type: 'text',
    meta: { interface: 'input-multiline' },
    schema: { is_nullable: true },
  }),

  // Rich text (HTML)
  rich: (field: string): FieldDef => ({
    field, type: 'text',
    meta: { interface: 'input-rich-text-html', options: { toolbar: ['bold','italic','underline','h2','h3','quote','bullist','numlist','link','removeformat'] } },
    schema: { is_nullable: true },
  }),

  // Slug-like (string + unique)
  slug: (field: string): FieldDef => ({
    field, type: 'string',
    meta: { interface: 'input', options: { slug: true }, required: true },
    schema: { is_nullable: false, is_unique: true },
  }),

  // Integer
  int: (field: string, nullable = true): FieldDef => ({
    field, type: 'integer',
    meta: { interface: 'input' },
    schema: { is_nullable: nullable },
  }),

  // Decimal — for money
  money: (field: string): FieldDef => ({
    field, type: 'decimal',
    meta: { interface: 'input', options: { iconLeft: 'payments' } },
    schema: { numeric_precision: 12, numeric_scale: 2, is_nullable: true },
  }),

  // Boolean with default
  bool: (field: string, def = false): FieldDef => ({
    field, type: 'boolean',
    meta: { interface: 'boolean' },
    schema: { default_value: def, is_nullable: false },
  }),

  // Date only
  date: (field: string): FieldDef => ({
    field, type: 'date',
    meta: { interface: 'datetime' },
    schema: { is_nullable: true },
  }),

  // Date + time
  dt: (field: string): FieldDef => ({
    field, type: 'timestamp',
    meta: { interface: 'datetime' },
    schema: { is_nullable: true },
  }),

  // Dropdown (string-backed enum)
  enum: (field: string, choices: string[], opts: { required?: boolean; def?: string } = {}): FieldDef => ({
    field, type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: { choices: choices.map(value => ({ text: value, value })) },
      required: opts.required ?? false,
    },
    schema: { default_value: opts.def, is_nullable: !(opts.required ?? false) },
  }),

  // JSON blob
  json: (field: string): FieldDef => ({
    field, type: 'json',
    meta: { interface: 'input-code', options: { language: 'json' } },
    schema: { is_nullable: true },
  }),

  // Single file (image)
  file: (field: string): FieldDef => ({
    field, type: 'uuid',
    meta: { interface: 'file-image', special: ['file'] },
    schema: { is_nullable: true },
  }),

  // Single file (any)
  fileAny: (field: string): FieldDef => ({
    field, type: 'uuid',
    meta: { interface: 'file', special: ['file'] },
    schema: { is_nullable: true },
  }),

  // Many-to-one relation (the column itself; relation defined separately)
  m2o: (field: string, opts: { required?: boolean } = {}): FieldDef => ({
    field, type: 'uuid',
    meta: { interface: 'select-dropdown-m2o', special: ['m2o'], required: opts.required ?? false },
    schema: { is_nullable: !(opts.required ?? false) },
  }),

  // CSV-backed tag list
  tags: (field: string): FieldDef => ({
    field, type: 'csv',
    meta: { interface: 'tags', special: ['cast-csv'] },
    schema: { is_nullable: true },
  }),
};
