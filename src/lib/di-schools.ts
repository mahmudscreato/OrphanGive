// Session 48a — DI school lookup data layer.
//
// `school` is the new collection that backs the educational_organization
// dropdown on the child form. DI sees an autocomplete-style dropdown
// pre-populated from existing school rows; if no row matches, DI can
// add a new one inline (which writes here, then the new id is selected).
//
// Privacy: all admin-token reads server-side. The collection itself
// has DI-policy READ + CREATE permissions (registered in
// migrations/session-48a/002-register-fields.sh) so the dropdown can
// also work via the DI's own session if we ever switch to client-
// direct fetches. For Session 48a we keep server-mediated.
//
// No PII concerns — schools are public-knowledge institutions
// (school name, type, division/district, optional notes).

import "server-only";

import { createItem, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

export type SchoolType = "school" | "madrasa" | "vocational" | "other";

export const SCHOOL_TYPES: ReadonlyArray<SchoolType> = [
  "school",
  "madrasa",
  "vocational",
  "other",
];

export interface SchoolSummary {
  id: string;
  name: string;
  type: SchoolType | null;
  bd_division: string | null;
  bd_district: string | null;
}

export interface CreateSchoolInput {
  name: string;
  type?: SchoolType;
  bd_division?: string;
  bd_district?: string;
  notes?: string;
}

// ─── Typed errors ───────────────────────────────────────────────────

export class DuplicateSchoolError extends Error {
  readonly code = "duplicate_school" as const;
  constructor(public readonly existingId?: string) {
    super("A school with this name already exists");
    this.name = "DuplicateSchoolError";
  }
}

// ─── Public API ─────────────────────────────────────────────────────

const SCHOOL_FIELDS = [
  "id",
  "name",
  "type",
  "bd_division",
  "bd_district",
] as const;

function isSchoolType(s: string | null | undefined): s is SchoolType {
  return s !== null && s !== undefined && (SCHOOL_TYPES as readonly string[]).includes(s);
}

/**
 * List schools, optionally narrowed by case-insensitive substring on
 * name. Sorted alphabetically. Caps at `limit` (default 20).
 */
export async function listSchools(
  opts?: { q?: string; limit?: number },
): Promise<SchoolSummary[]> {
  const filter: Record<string, unknown> | undefined =
    opts?.q && opts.q.trim().length > 0
      ? { name: { _icontains: opts.q.trim() } }
      : undefined;

  let rows: Array<{
    id: string;
    name: string | null;
    type: string | null;
    bd_division: string | null;
    bd_district: string | null;
  }> = [];
  try {
    const result = (await directusServer().request(
      readItems("school" as never, {
        ...(filter ? { filter } : {}),
        fields: [...SCHOOL_FIELDS],
        sort: ["name"],
        limit: opts?.limit ?? 20,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-schools] listSchools failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows
    .filter((r) => r.name && r.name.trim().length > 0)
    .map((r) => ({
      id: r.id,
      name: r.name!.trim(),
      type: isSchoolType(r.type) ? r.type : null,
      bd_division: r.bd_division,
      bd_district: r.bd_district,
    }));
}

/**
 * Create a new school row. Throws DuplicateSchoolError if a row with
 * the same (case-insensitive) name already exists — caller (the
 * /api/di/schools/create route) maps that to 409.
 *
 * `created_by` auto-fills via Directus 'user-created' special.
 */
export async function createSchool(
  userId: string,
  input: CreateSchoolInput,
): Promise<SchoolSummary> {
  const name = input.name?.trim();
  if (!name) throw new Error("school name required");

  // Case-insensitive duplicate check. The unique constraint on
  // school.name handles exact-case dupes, but we want to flag
  // case-insensitive dupes too so DIs don't end up with "Dhaka High
  // School" alongside "DHAKA HIGH SCHOOL".
  const existing = await listSchools({ q: name, limit: 5 });
  const dupe = existing.find(
    (s) => s.name.toLowerCase() === name.toLowerCase(),
  );
  if (dupe) throw new DuplicateSchoolError(dupe.id);

  let created: { id?: string } | undefined;
  try {
    created = (await directusServer().request(
      createItem("school" as never, {
        name,
        ...(input.type ? { type: input.type } : {}),
        ...(input.bd_division ? { bd_division: input.bd_division } : {}),
        ...(input.bd_district ? { bd_district: input.bd_district } : {}),
        ...(input.notes ? { notes: input.notes.trim() } : {}),
        // Stamp the DI as creator for auditing. The Directus
        // 'user-created' special on `created_by` would also auto-set
        // this when called via a DI session token, but we use the
        // admin token, so explicit assignment is needed. (Directus
        // won't error if the special and the explicit value match.)
        created_by: userId,
      } as never),
    )) as unknown as { id?: string };
  } catch (err) {
    // Postgres unique constraint violation surfaces as code 23505 in
    // the SDK error chain. Heuristic: if message contains the
    // unique key name, treat as duplicate (admin user added the
    // exact-case dupe between our check and our insert — race).
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("school_name_key") || msg.includes("duplicate")) {
      throw new DuplicateSchoolError();
    }
    throw err;
  }

  if (!created?.id) throw new Error("createSchool: no id returned");

  return {
    id: String(created.id),
    name,
    type: input.type ?? null,
    bd_division: input.bd_division ?? null,
    bd_district: input.bd_district ?? null,
  };
}

/**
 * Resolve a list of school IDs to their summaries. Used when
 * displaying existing children with linked schools (so the form's
 * pre-fill includes the school name in the dropdown's selected
 * label rather than just the UUID).
 */
export async function getSchoolsByIds(
  ids: string[],
): Promise<SchoolSummary[]> {
  if (ids.length === 0) return [];
  let rows: Array<{
    id: string;
    name: string | null;
    type: string | null;
    bd_division: string | null;
    bd_district: string | null;
  }> = [];
  try {
    const result = (await directusServer().request(
      readItems("school" as never, {
        filter: { id: { _in: ids } },
        fields: [...SCHOOL_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as typeof rows | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-schools] getSchoolsByIds failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows
    .filter((r) => r.name)
    .map((r) => ({
      id: r.id,
      name: r.name!.trim(),
      type: isSchoolType(r.type) ? r.type : null,
      bd_division: r.bd_division,
      bd_district: r.bd_district,
    }));
}
