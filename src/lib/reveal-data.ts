import {
  createItem,
  deleteItem,
  readItem,
  readItems,
  readUsers,
  updateItem,
} from "@directus/sdk";
import { directusServer } from "./directus";
import { recordAuditEvent } from "./di-audit";

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

// fix/reveal-data-population — each reveal target column (`*_encrypted`)
// maps to the EXISTING plaintext column(s) where the real data currently
// lives. The read path prefers the `_encrypted` value when present, else
// falls back to the source — so existing children (data in plaintext)
// reveal correctly, and any future `_encrypted` writes take precedence.
// (This adds NO encryption; the `_encrypted` columns hold plaintext.)
// guardian_full_name has no plaintext source — it stays null until
// captured; the card UX renders that as "approved, not on file yet".
// A dotted source (educational_organization.name) is a relational path.
const REVEAL_FALLBACK_COLUMNS: Record<AllowedRevealField, readonly string[]> = {
  school_name_encrypted: ["educational_organization.name", "school_name_raw"],
  full_address_encrypted: ["permanent_address"],
  guardian_full_name_encrypted: [],
  guardian_contact_encrypted: ["guardian_phone"],
  exact_birthdate_encrypted: ["date_of_birth"],
  family_circumstances_encrypted: ["guardian_summary_internal"],
};

// First non-empty string across the candidates (encrypted first, then
// its fallback sources in order). Trims; treats "" / null / whitespace as
// empty; stringifies non-object scalars (e.g. a date).
function firstNonEmptyString(vals: readonly unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string") {
      if (v.trim() !== "") return v;
      continue;
    }
    if (v != null && typeof v !== "object") {
      const s = String(v);
      if (s.trim() !== "") return s;
    }
  }
  return null;
}

// Read a possibly-relational field path off the row (e.g. "a.b" → row.a.b).
function readPath(row: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return row[path];
  const [rel, sub] = path.split(".");
  const obj = row[rel!];
  return obj && typeof obj === "object"
    ? (obj as Record<string, unknown>)[sub!]
    : undefined;
}

// Fetch the revealed values for a list of approved fields on a child.
// Server-token only — never exposed to the browser. Prefers the
// `_encrypted` column, falls back to the mapped plaintext source. Returns
// a Map of field_name → value (null if neither has a value).
export async function fetchRevealedFieldValues(
  childId: string,
  fields: ReadonlyArray<AllowedRevealField>,
): Promise<Map<AllowedRevealField, string | null>> {
  const out = new Map<AllowedRevealField, string | null>();
  if (!UUID_RE.test(childId) || fields.length === 0) return out;

  // Build the read set: id + each requested `_encrypted` column + its
  // fallback source column(s).
  const needed = new Set<string>(["id"]);
  for (const f of fields) {
    needed.add(f);
    for (const src of REVEAL_FALLBACK_COLUMNS[f]) needed.add(src);
  }

  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: [...needed],
        limit: 1,
      } as never),
    )) as unknown as Array<Record<string, unknown>>;
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return out;
    for (const f of fields) {
      const candidates: unknown[] = [row[f]]; // `_encrypted` value first
      for (const src of REVEAL_FALLBACK_COLUMNS[f]) {
        candidates.push(readPath(row, src)); // then fallback source(s)
      }
      out.set(f, firstNonEmptyString(candidates));
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
    // P2 — audit the grant request. Metadata is IDs + field_name
    // (which is the public-allowlist column name) only. Never the
    // decrypted Tier-3 value.
    await recordAuditEvent({
      actorUserId: opts.donorId,
      actorRole: "donor",
      action: "donor_requested_reveal",
      collection: "reveal_request",
      recordId: created.id,
      metadata: {
        donor: opts.donorId,
        childId: opts.childId,
        field_name: opts.fieldName,
        reason_provided: reason !== null,
      },
    });
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
  // P2 — audit AFTER the delete succeeded so we don't claim a
  // withdrawal that never happened. Metadata captures the IDs; the
  // row itself is gone so we record what we knew about it (field
  // info would need to be fetched pre-delete — keep it minimal).
  await recordAuditEvent({
    actorUserId: opts.donorId,
    actorRole: "donor",
    action: "donor_withdrew_reveal",
    collection: "reveal_request",
    recordId: opts.requestId,
    metadata: { donor: opts.donorId },
  });
}

// ─── P2 — Revoke reveals on sponsorship end ─────────────────────────
//
// When a sponsorship transitions to cancelled / refunded / completed,
// the (former) donor must lose Tier-3 access via any active reveal
// they hold on the same child. Without this hook, the 90-day expiry
// cron is the only safeguard — a stale window of up to 90 days where
// a former donor still sees guardian contact / address / etc.
//
// Policy: if the donor still has ANY OTHER active or paused
// sponsorship of the same child, do NOT revoke (their relationship
// continues). Otherwise, flip all of this donor's reveal_request rows
// for this child where status='approved' AND approved_until > now()
// to status='revoked' with revoked_at + revoked_reason metadata.
//
// Best-effort: never throws. The caller is on a money-flow path that
// must not be blocked by an audit/revoke failure.

interface RevokeOnSponsorshipEndOpts {
  /** The sponsorship that just ended (we exclude it from the
   * "other active sponsorships" check below). */
  sponsorshipId: string;
  donorId: string;
  childId: string;
  /** Short label captured in the audit metadata — e.g. "donor_cancel",
   * "admin_cancel", "webhook_charge_refunded",
   * "webhook_subscription_deleted", "cron_prepaid_ended". */
  reason: string;
}

export async function revokeRevealsForSponsorshipEnd(
  opts: RevokeOnSponsorshipEndOpts,
): Promise<{ revokedCount: number; skipped?: "other-active-sponsorship" }> {
  if (
    !UUID_RE.test(opts.donorId) ||
    !UUID_RE.test(opts.childId) ||
    !UUID_RE.test(opts.sponsorshipId)
  ) {
    return { revokedCount: 0 };
  }

  // 1) Check for OTHER active/paused sponsorships by this donor for
  //    this child. If any exist, leave the reveals alone.
  try {
    const others = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { donor: { _eq: opts.donorId } },
            { child: { _eq: opts.childId } },
            { id: { _neq: opts.sponsorshipId } },
            { status: { _in: ["active", "paused"] } },
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }>;
    if (Array.isArray(others) && others.length > 0) {
      return { revokedCount: 0, skipped: "other-active-sponsorship" };
    }
  } catch (err) {
    console.warn(
      "[reveal-data] revokeRevealsForSponsorshipEnd: other-sponsorship check failed",
      err instanceof Error ? err.message : err,
    );
    // Fail OPEN on the safety check failure — better to leave reveals
    // intact and risk an extra revoke if the donor really lost
    // access than to leave them with Tier-3 access on a state where
    // we couldn't verify they still have a sponsorship.
    // (Actually: fail CLOSED is safer. Reverse — revoke and let the
    //  donor re-request if needed.)
  }

  // 2) Find this donor's currently-active reveals for the child.
  const nowIso = new Date().toISOString();
  let active: Array<{ id: string; field_name: string }> = [];
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: {
          _and: [
            { donor: { _eq: opts.donorId } },
            { child: { _eq: opts.childId } },
            { status: { _eq: "approved" } },
            { approved_until: { _gt: nowIso } },
          ],
        },
        fields: ["id", "field_name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string; field_name: string }>;
    active = Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn(
      "[reveal-data] revokeRevealsForSponsorshipEnd: active-reveal read failed",
      err instanceof Error ? err.message : err,
    );
    return { revokedCount: 0 };
  }

  if (active.length === 0) {
    return { revokedCount: 0 };
  }

  // 3) Flip each to 'revoked'. Sequential to keep the audit rows
  //    paired with each row's id; the per-donor count is tiny
  //    (max 6 fields per child).
  let revokedCount = 0;
  for (const row of active) {
    try {
      await directusServer().request(
        updateItem("reveal_request" as never, row.id as never, {
          status: "revoked",
        } as never),
      );
      // Audit one row per revoked field so the timeline reader shows
      // each Tier-3 surface that closed. Metadata IDs + field name
      // (allowlist column) + reason only — never the decrypted value.
      await recordAuditEvent({
        actorUserId: opts.donorId,
        actorRole: "system",
        action: "system_revoked_reveal",
        collection: "reveal_request",
        recordId: row.id,
        metadata: {
          donor: opts.donorId,
          childId: opts.childId,
          sponsorshipId: opts.sponsorshipId,
          field_name: row.field_name,
          reason: opts.reason,
        },
      });
      revokedCount += 1;
    } catch (err) {
      console.warn(
        `[reveal-data] revokeRevealsForSponsorshipEnd: revoke ${row.id} failed`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { revokedCount };
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

// ─── Admin decision layer (fix/reveal-decision-loop) ────────────────
//
// The in-app admin approve/deny surface. Previously admins had to edit
// reveal_request rows by hand in Directus — and crucially, the read
// path (getActiveReveals) requires `approved_until > now`, which nothing
// auto-set, so even a manual approval granted nothing. approveReveal
// now stamps approved_until = now + 90 days, matching the expire-reveals
// cron window (which expires rows whose decided_at is > 90 days old), so
// the read-side and cron notions of expiry agree.

// 90-day access window — mirrors NINETY_DAYS_MS in
// /api/cron/expire-reveals. Kept in sync by hand (the cron owns the
// authoritative sweep; this sets the read-path bound to match).
const REVEAL_APPROVAL_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const MIN_DECISION_NOTE = 3;
const MAX_DECISION_NOTE = 1000;

export interface PendingRevealRequest {
  id: string;
  donorId: string;
  donorName: string;
  donorEmail: string;
  childId: string;
  childName: string;
  fieldName: string;
  fieldLabel: string;
  donorReason: string | null;
  requestedAt: string | null;
}

/**
 * Admin queue reader — every reveal_request still `pending`, oldest
 * first (FIFO triage), with donor + child resolved to display strings.
 * Tier-1 safe: shows WHICH field was requested (the allowlist column
 * name / label), never the child's actual private value.
 */
export async function listPendingRevealRequests(): Promise<
  PendingRevealRequest[]
> {
  let rows: RevealRequest[] = [];
  try {
    const result = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: { status: { _eq: "pending" } },
        fields: [...REVEAL_FIELDS],
        sort: ["date_created"],
        limit: -1,
      } as never),
    )) as unknown as RevealRequest[];
    rows = Array.isArray(result) ? result : [];
  } catch (err) {
    console.warn(
      "[reveal-data] listPendingRevealRequests failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (rows.length === 0) return [];

  // Resolve donor + child display strings in two batched reads.
  const donorIds = Array.from(new Set(rows.map((r) => r.donor).filter(Boolean)));
  const childIds = Array.from(new Set(rows.map((r) => r.child).filter(Boolean)));
  const donorById = new Map<string, { name: string; email: string }>();
  const childNameById = new Map<string, string>();
  try {
    if (donorIds.length > 0) {
      const users = (await directusServer().request(
        readUsers({
          filter: { id: { _in: donorIds } },
          fields: ["id", "first_name", "last_name", "email"],
          limit: -1,
        } as never),
      )) as unknown as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }>;
      for (const u of users ?? []) {
        const name =
          [u.first_name, u.last_name].filter((s) => s && s.trim()).join(" ").trim() ||
          u.email;
        donorById.set(u.id, { name, email: u.email });
      }
    }
    if (childIds.length > 0) {
      const kids = (await directusServer().request(
        readItems("child" as never, {
          filter: { id: { _in: childIds } },
          fields: ["id", "display_name"],
          limit: -1,
        } as never),
      )) as unknown as Array<{ id: string; display_name: string | null }>;
      for (const c of kids ?? []) {
        if (c.display_name?.trim()) childNameById.set(c.id, c.display_name.trim());
      }
    }
  } catch (err) {
    console.warn(
      "[reveal-data] listPendingRevealRequests resolve failed",
      err instanceof Error ? err.message : err,
    );
  }

  return rows.map((r) => {
    const donor = donorById.get(r.donor);
    return {
      id: r.id,
      donorId: r.donor,
      donorName: donor?.name ?? r.donor,
      donorEmail: donor?.email ?? "",
      childId: r.child,
      childName: childNameById.get(r.child) ?? "Unknown child",
      fieldName: r.field_name,
      fieldLabel: isAllowedRevealField(r.field_name)
        ? REVEAL_FIELD_LABELS[r.field_name]
        : String(r.field_name),
      donorReason: r.donor_reason?.trim() || null,
      requestedAt: r.date_created,
    };
  });
}

/** Count of pending reveal requests — for the reviews-hub badge. */
export async function countPendingRevealRequests(): Promise<number> {
  try {
    const rows = (await directusServer().request(
      readItems("reveal_request" as never, {
        filter: { status: { _eq: "pending" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<unknown>;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      "[reveal-data] countPendingRevealRequests failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export interface RevealDecisionResult {
  id: string;
  donorId: string;
  childId: string;
  fieldName: string;
}

// Shared read+guard for a decision: the row must exist and be pending.
async function loadPendingRevealForDecision(
  requestId: string,
): Promise<RevealRequest> {
  let row: RevealRequest | null = null;
  try {
    row = (await directusServer().request(
      readItem("reveal_request" as never, requestId as never, {
        fields: [...REVEAL_FIELDS],
      } as never),
    )) as unknown as RevealRequest;
  } catch {
    throw new RevealRequestError(404, "Reveal request not found.");
  }
  if (!row || !row.id) throw new RevealRequestError(404, "Reveal request not found.");
  if (row.status !== "pending") {
    throw new RevealRequestError(
      409,
      `This request is already ${row.status}.`,
    );
  }
  return row;
}

function normalizeDecisionNote(note: string | null | undefined): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length < MIN_DECISION_NOTE) {
    throw new RevealRequestError(
      400,
      "A reason is required (at least 3 characters).",
    );
  }
  return trimmed.slice(0, MAX_DECISION_NOTE);
}

/**
 * APPROVE — status='approved', decided_by/at stamped, admin note
 * recorded, AND approved_until = now + 90d (the read-path bound). Only
 * a pending request can be approved. Requires a non-empty reason.
 */
export async function approveRevealRequest(opts: {
  requestId: string;
  adminUserId: string;
  note: string;
}): Promise<RevealDecisionResult> {
  if (!UUID_RE.test(opts.requestId) || !UUID_RE.test(opts.adminUserId)) {
    throw new RevealRequestError(400, "Invalid id.");
  }
  const note = normalizeDecisionNote(opts.note);
  const row = await loadPendingRevealForDecision(opts.requestId);

  const nowIso = new Date().toISOString();
  const approvedUntil = new Date(
    Date.now() + REVEAL_APPROVAL_WINDOW_MS,
  ).toISOString();
  try {
    await directusServer().request(
      updateItem("reveal_request" as never, opts.requestId as never, {
        status: "approved",
        decided_by: opts.adminUserId,
        decided_at: nowIso,
        admin_decision_note: note,
        approved_until: approvedUntil,
      } as never),
    );
  } catch (err) {
    console.error(
      "[reveal-data] approveRevealRequest update failed",
      err instanceof Error ? err.message : err,
    );
    throw new RevealRequestError(500, "Could not approve the request.");
  }

  await recordAuditEvent({
    actorUserId: opts.adminUserId,
    actorRole: "admin",
    action: "admin_approved_reveal",
    collection: "reveal_request",
    recordId: opts.requestId,
    metadata: {
      donor: row.donor,
      childId: row.child,
      field_name: row.field_name,
      approved_until: approvedUntil,
    },
  });

  return {
    id: opts.requestId,
    donorId: row.donor,
    childId: row.child,
    fieldName: row.field_name,
  };
}

/**
 * DENY — status='denied' (the value the read-path, donor UI, and
 * reveal-denied email all key off), decided_by/at stamped, admin note
 * recorded. Grants nothing (no approved_until). Only a pending request
 * can be denied. Requires a non-empty reason.
 */
export async function denyRevealRequest(opts: {
  requestId: string;
  adminUserId: string;
  note: string;
}): Promise<RevealDecisionResult> {
  if (!UUID_RE.test(opts.requestId) || !UUID_RE.test(opts.adminUserId)) {
    throw new RevealRequestError(400, "Invalid id.");
  }
  const note = normalizeDecisionNote(opts.note);
  const row = await loadPendingRevealForDecision(opts.requestId);

  const nowIso = new Date().toISOString();
  try {
    await directusServer().request(
      updateItem("reveal_request" as never, opts.requestId as never, {
        status: "denied",
        decided_by: opts.adminUserId,
        decided_at: nowIso,
        admin_decision_note: note,
      } as never),
    );
  } catch (err) {
    console.error(
      "[reveal-data] denyRevealRequest update failed",
      err instanceof Error ? err.message : err,
    );
    throw new RevealRequestError(500, "Could not deny the request.");
  }

  await recordAuditEvent({
    actorUserId: opts.adminUserId,
    actorRole: "admin",
    action: "admin_denied_reveal",
    collection: "reveal_request",
    recordId: opts.requestId,
    metadata: {
      donor: row.donor,
      childId: row.child,
      field_name: row.field_name,
    },
  });

  return {
    id: opts.requestId,
    donorId: row.donor,
    childId: row.child,
    fieldName: row.field_name,
  };
}
