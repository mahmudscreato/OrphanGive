import {
  createItem,
  deleteItem,
  readItem,
  readItems,
} from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Allowlist ───────────────────────────────────────────────────────────────
//
// The set of encrypted child fields a donor can request to view. This is
// the canonical security boundary — any reveal_request with a field_name
// outside this set is rejected at the API layer.
//
// NOTE: the original product spec listed 12 field names. The current
// `child` collection only has 6 encrypted columns; this allowlist matches
// reality. To extend, add columns to `child` first, then add their names
// here.
export const ALLOWED_REVEAL_FIELDS = [
  "exact_birthdate_encrypted",
  "full_address_encrypted",
  "school_name_encrypted",
  "guardian_full_name_encrypted",
  "guardian_contact_encrypted",
  "family_circumstances_encrypted",
] as const;

export type AllowedRevealField = (typeof ALLOWED_REVEAL_FIELDS)[number];

export function isAllowedRevealField(name: unknown): name is AllowedRevealField {
  return (
    typeof name === "string" &&
    (ALLOWED_REVEAL_FIELDS as readonly string[]).includes(name)
  );
}

// Friendly labels surfaced in the UI (modal heading, dashboard list, email).
export const REVEAL_FIELD_LABELS: Record<AllowedRevealField, string> = {
  exact_birthdate_encrypted: "Exact birthdate",
  full_address_encrypted: "Full address",
  school_name_encrypted: "School name",
  guardian_full_name_encrypted: "Guardian's name",
  guardian_contact_encrypted: "Guardian's contact",
  family_circumstances_encrypted: "Family circumstances",
};

// ─── Types ───────────────────────────────────────────────────────────────────
export type RevealStatus =
  | "pending"
  | "approved"
  | "denied"
  | "revoked"
  | "expired";

export type RevealRequest = {
  id: string;
  donor: string;
  child: string;
  field_name: AllowedRevealField | string;
  status: RevealStatus | string;
  donor_reason: string | null;
  admin_decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  approved_until: string | null;
  date_created: string | null;
};

const REVEAL_FIELDS = [
  "id",
  "donor",
  "child",
  "field_name",
  "status",
  "donor_reason",
  "admin_decision_note",
  "decided_by",
  "decided_at",
  "approved_until",
  "date_created",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Reads ───────────────────────────────────────────────────────────────────
export async function getDonorRevealsForChild(
  donorId: string,
  childId: string,
): Promise<RevealRequest[]> {
  if (!UUID_RE.test(donorId) || !UUID_RE.test(childId)) return [];
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { child: { _eq: childId } },
          ],
        },
        fields: [...REVEAL_FIELDS],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as RevealRequest[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[reveal-data] getDonorRevealsForChild failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// Returns ONLY the field-names that are currently revealed: status='approved'
// AND approved_until > now. Effectively-expired rows are excluded even if
// their status hasn't been updated to 'expired' yet (read-side enforcement).
export async function getActiveReveals(
  donorId: string,
  childId: string,
): Promise<Set<AllowedRevealField>> {
  if (!UUID_RE.test(donorId) || !UUID_RE.test(childId)) return new Set();
  const nowIso = new Date().toISOString();
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { child: { _eq: childId } },
            { status: { _eq: "approved" } },
            { approved_until: { _gt: nowIso } },
          ],
        },
        fields: ["field_name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ field_name?: string }>;
    const set = new Set<AllowedRevealField>();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (isAllowedRevealField(r.field_name)) set.add(r.field_name);
      }
    }
    return set;
  } catch (err) {
    console.warn(
      "[reveal-data] getActiveReveals failed",
      err instanceof Error ? err.message : err,
    );
    return new Set();
  }
}

// All requests by a donor across all children — used by dashboard.
export async function getAllDonorReveals(
  donorId: string,
): Promise<RevealRequest[]> {
  if (!UUID_RE.test(donorId)) return [];
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: { donor: { _eq: donorId } },
        fields: [
          ...REVEAL_FIELDS,
          "child.id",
          "child.display_name",
        ],
        sort: ["-date_created"],
        limit: -1,
      } as never),
    )) as unknown as Array<RevealRequest & { child: { id: string; display_name: string | null } | string }>;
    return Array.isArray(rows) ? (rows as unknown as RevealRequest[]) : [];
  } catch (err) {
    console.warn(
      "[reveal-data] getAllDonorReveals failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// Fetch the actual encrypted values for a list of revealed fields on a child.
// Server-token only — never exposed to the browser. Returns a Map of
// field_name → value (or null if the column is empty).
export async function fetchRevealedFieldValues(
  childId: string,
  fields: ReadonlyArray<AllowedRevealField>,
): Promise<Map<AllowedRevealField, string | null>> {
  const out = new Map<AllowedRevealField, string | null>();
  if (!UUID_RE.test(childId) || fields.length === 0) return out;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["id", ...fields],
        limit: 1,
      } as never),
    )) as unknown as Array<Record<string, unknown>>;
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return out;
    for (const f of fields) {
      const v = row[f];
      out.set(f, typeof v === "string" ? v : v == null ? null : String(v));
    }
  } catch (err) {
    console.warn(
      "[reveal-data] fetchRevealedFieldValues failed",
      err instanceof Error ? err.message : err,
    );
  }
  return out;
}

// ─── Mutations ───────────────────────────────────────────────────────────────
export class RevealRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function createRevealRequest(opts: {
  donorId: string;
  childId: string;
  fieldName: AllowedRevealField;
  donorReason?: string | null;
}): Promise<RevealRequest> {
  if (!UUID_RE.test(opts.donorId) || !UUID_RE.test(opts.childId)) {
    throw new RevealRequestError(400, "Invalid id.");
  }
  if (!isAllowedRevealField(opts.fieldName)) {
    throw new RevealRequestError(400, "Field not allowed for reveal.");
  }

  // Refuse duplicate pending request for same donor+child+field.
  try {
    const existing = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { donor: { _eq: opts.donorId } },
            { child: { _eq: opts.childId } },
            { field_name: { _eq: opts.fieldName } },
            { status: { _eq: "pending" } },
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    if (Array.isArray(existing) && existing.length > 0) {
      throw new RevealRequestError(409, "Request already pending for this field.");
    }
  } catch (err) {
    if (err instanceof RevealRequestError) throw err;
    // read failure shouldn't block — fall through and let create fail loudly.
  }

  // Verify child exists and is active.
  try {
    const childRow = (await directusServer().request(
      readItem("child" as never, opts.childId as never, {
        fields: ["id", "status"],
      } as never),
    )) as unknown as { id?: string; status?: string } | null;
    if (!childRow?.id) {
      throw new RevealRequestError(400, "Child not found.");
    }
    if (childRow.status !== "active") {
      throw new RevealRequestError(400, "Child not available for sponsorship.");
    }
  } catch (err) {
    if (err instanceof RevealRequestError) throw err;
    throw new RevealRequestError(400, "Child lookup failed.");
  }

  const reason = (opts.donorReason ?? "").trim().slice(0, 500) || null;
  try {
    const created = (await directusServer().request(
      createItem("reveal_request" as never, {
        donor: opts.donorId,
        child: opts.childId,
        field_name: opts.fieldName,
        status: "pending",
        donor_reason: reason,
      } as never),
    )) as unknown as RevealRequest;
    return created;
  } catch (err) {
    console.error(
      "[reveal-data] createRevealRequest failed",
      err instanceof Error ? err.message : err,
    );
    throw new RevealRequestError(500, "Could not create request.");
  }
}

export async function withdrawRevealRequest(opts: {
  donorId: string;
  requestId: string;
}): Promise<void> {
  if (!UUID_RE.test(opts.donorId) || !UUID_RE.test(opts.requestId)) {
    throw new RevealRequestError(404, "Not found.");
  }
  // Hard ownership + status check before delete.
  let row: { id: string; donor: string; status: string } | null = null;
  try {
    row = (await directusServer().request(
      readItem("reveal_request" as never, opts.requestId as never, {
        fields: ["id", "donor", "status"],
      } as never),
    )) as unknown as { id: string; donor: string; status: string };
  } catch {
    throw new RevealRequestError(404, "Not found.");
  }
  if (
    !row ||
    row.donor !== opts.donorId ||
    row.status !== "pending"
  ) {
    // 404 instead of 403 — hide existence/state from the wrong owner.
    throw new RevealRequestError(404, "Not found.");
  }
  try {
    await directusServer().request(
      deleteItem("reveal_request" as never, opts.requestId as never),
    );
  } catch (err) {
    console.error("[reveal-data] withdraw failed", err);
    throw new RevealRequestError(500, "Could not withdraw.");
  }
}

// Per-donor daily rate limit on creation.
export async function countRevealsToday(donorId: string): Promise<number> {
  if (!UUID_RE.test(donorId)) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { donor: { _eq: donorId } },
            { date_created: { _gte: since } },
          ],
        },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<unknown>;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}
