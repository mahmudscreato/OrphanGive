// Session 43 — DI Dashboard server-side data layer for Children list
// and Child Detail.
//
// IMPORTANT — privacy enforcement is server-side, always.
//
//   The DI Directus role denies access to `directus_users` (where
//   donors live). When DI needs to see "who sponsors this child", we
//   fetch with the admin token from this server module, redact at
//   the server, and return only the whitelisted shape. The DI's
//   browser never receives donor PII even briefly.
//
// All exports here are server-only (the `'server-only'` import below
// is a build-time guard — Next.js will fail the build if this module
// is ever imported into a client component).
//
// Scope rules (per DI_DASHBOARD_SPEC_v3 §2.1):
//   - DI sees only children where uploaded_by_di = self OR assigned_di = self
//   - Children with status 'withdrawn' are hidden even when in scope
//   - Sponsorship reads scope-check the child first, return null if out of scope
//
// Visibility / display name rule (matches public /children pattern,
// see src/lib/visibility.ts):
//   - sponsorship.visibility === 'named'  → show donor.first_name
//   - sponsorship.visibility === 'anonymous' (or null) → show "Anonymous donor"
//   - we NEVER return last_name, email, phone, billing address, payment
//     method, or Stripe IDs to the client.

import "server-only";

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";

// ─── Public types ───────────────────────────────────────────────────

// Derived sponsorship category — matches src/lib/children-data.ts'
// `ChildCategory`, but recomputed here off DI-scoped sponsorship rows
// so we don't depend on the public-facing queue badge fetch.
export type DiChildCategory =
  | "awaiting" // no active sponsorship at queue_position 0
  | "monthly" // active sponsorship, payment_schedule != monthly_prepaid
  | "prepaid" // active sponsorship, payment_schedule = monthly_prepaid
  | "paused"; // sponsorship status is 'paused'

export interface DiChildSummary {
  id: string;
  display_name: string;
  age_years: number | null;
  bd_division_name: string | null;
  photo_url: string | null;
  status: string; // raw child.status (e.g. 'active'); kept for completeness
  category: DiChildCategory; // derived bucket used by the filter pills
  support_type: string | null;
  monthly_cost: number | null;
  last_visit_date: string | null;
  relationship: "uploaded" | "assigned" | "both";
  // Sponsorship summary for the card. The DI cares about who's
  // currently caring for the child, not the full history, so we
  // surface the active sponsorship (or null when none).
  sponsor_display_name: string | null;
  sponsor_category: string | null;
  sponsor_amount: number | null;
  sponsor_currency: string | null;
  // Last report — null until Session 45 wires child_update.
  last_report_date: string | null;
}

export interface DiChildDetail extends DiChildSummary {
  story: string;
  education_level: string | null;
  district_internal: string | null;
  guardian_summary_internal: string | null;
  approved_at: string | null;
  uploaded_by_di: string | null;
  assigned_di: string | null;
}

export interface DiSponsorshipView {
  id: string;
  donor_display_name: string;
  sponsor_category: "monthly" | "prepaid" | "one_time" | "unknown";
  amount: number | null; // EXACT — per spec §2.6
  currency: string | null;
  country: string | null; // donor's country, only when visibility=named
  start_date: string | null;
  end_date: string | null;
  status: string;
  queue_position: number | null;
  prepaid_months_remaining: number | null;
}

// ─── Internal Directus row shapes ───────────────────────────────────

// Child row as fetched from Directus. `bd_division` returns just the
// FK string by default — we expand to .code/.name. `Photo` returns a
// uuid string when requested as a literal field.
type ChildRow = {
  id: string;
  // P1.3 — first_name (public) optional; null on legacy rows.
  first_name?: string | null;
  display_name: string | null;
  date_of_birth: string | null;
  Photo: string | null;
  bd_division: { code?: string | null; name?: string | null } | null;
  status: string | null;
  support_type: string | null;
  monthly_cost: number | null;
  last_visit_date: string | null;
  uploaded_by_di: string | null;
  assigned_di: string | null;
  // Detail-only:
  story?: string | null;
  education_level?: string | null;
  district_internal?: string | null;
  guardian_summary_internal?: string | null;
  approved_at?: string | null;
};

// Sponsorship row with donor expanded. We deliberately request only
// the donor fields the DI is allowed to see — first_name + og_country.
// Last name, email, phone, payment data, Stripe IDs are NEVER fetched.
type SponsorshipWithDonor = {
  id: string;
  child: string;
  monthly_amount: number | null;
  currency: string | null;
  status: string;
  visibility: string | null;
  payment_mode: string | null;
  payment_schedule: string | null;
  start_date: string | null;
  end_date: string | null;
  queue_position: number | null;
  prepaid_months_remaining: number | null;
  started_at: string | null;
  donor: {
    id?: string;
    first_name?: string | null;
    og_country?: string | null;
  } | null;
};

const CHILD_SUMMARY_FIELDS = [
  "id",
  "display_name",
  "date_of_birth",
  "Photo",
  "bd_division.code",
  "bd_division.name",
  "status",
  "support_type",
  "monthly_cost",
  "last_visit_date",
  "uploaded_by_di",
  "assigned_di",
] as const;

const CHILD_DETAIL_FIELDS = [
  ...CHILD_SUMMARY_FIELDS,
  "story",
  "education_level",
  "district_internal",
  "guardian_summary_internal",
  "approved_at",
] as const;

const SPONSORSHIP_FIELDS = [
  "id",
  "child",
  "monthly_amount",
  "currency",
  "status",
  "visibility",
  "payment_mode",
  "payment_schedule",
  "start_date",
  "end_date",
  "queue_position",
  "prepaid_months_remaining",
  "started_at",
  "donor.id",
  "donor.first_name",
  "donor.og_country",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

// Mirrors src/lib/homepage-data.ts directusAssetUrl, intentionally
// inlined so this module has no UI dependency. The /api/assets/[id]
// route does the actual admin-token proxy to Directus.
function photoUrlFromUuid(uuid: string | null | undefined): string | null {
  if (!uuid || typeof uuid !== "string") return null;
  const trimmed = uuid.trim();
  if (trimmed.length < 8) return null;
  return `/api/assets/${trimmed}`;
}

function relationshipFor(
  uploadedBy: string | null,
  assignedTo: string | null,
  userId: string,
): DiChildSummary["relationship"] {
  const uploaded = uploadedBy === userId;
  const assigned = assignedTo === userId;
  if (uploaded && assigned) return "both";
  if (uploaded) return "uploaded";
  return "assigned"; // by elimination — caller filtered to scope already
}

// Given the sponsorship rows for a single child, derive the category
// surfaced on the card (matches the public /children categorisation
// rule, but computed off the DI's redacted view).
function deriveCategoryFromSponsorships(
  rows: ReadonlyArray<SponsorshipWithDonor>,
): DiChildCategory {
  // Find the active sponsorship at queue_position 0 (the one currently
  // paying for this child).
  const activeAtFront = rows.find(
    (r) =>
      r.status === "active" &&
      (r.queue_position === null || r.queue_position === 0),
  );
  if (activeAtFront) {
    return activeAtFront.payment_schedule === "monthly_prepaid"
      ? "prepaid"
      : "monthly";
  }
  const pausedAtFront = rows.find(
    (r) =>
      r.status === "paused" &&
      (r.queue_position === null || r.queue_position === 0),
  );
  if (pausedAtFront) return "paused";
  return "awaiting";
}

// Pick the single sponsorship to summarize on the card. Prefers the
// active queue-front, then paused queue-front, then nothing.
function pickPrimarySponsorship(
  rows: ReadonlyArray<SponsorshipWithDonor>,
): SponsorshipWithDonor | null {
  const active = rows.find(
    (r) =>
      r.status === "active" &&
      (r.queue_position === null || r.queue_position === 0),
  );
  if (active) return active;
  const paused = rows.find(
    (r) =>
      r.status === "paused" &&
      (r.queue_position === null || r.queue_position === 0),
  );
  return paused ?? null;
}

function donorDisplayNameFor(s: SponsorshipWithDonor): string {
  // Visibility default is anonymous when null/unknown — see
  // src/lib/visibility.ts effectiveVisibility().
  if (s.visibility === "named" && s.donor?.first_name) {
    return s.donor.first_name;
  }
  return "Anonymous donor";
}

function sponsorCategoryFor(
  s: SponsorshipWithDonor,
): DiSponsorshipView["sponsor_category"] {
  if (s.payment_mode === "one_time") return "one_time";
  if (s.payment_schedule === "monthly_prepaid") return "prepaid";
  if (s.payment_mode === "monthly") return "monthly";
  return "unknown";
}

function rowToSummary(
  row: ChildRow,
  userId: string,
  sponsorships: ReadonlyArray<SponsorshipWithDonor>,
): DiChildSummary {
  const primary = pickPrimarySponsorship(sponsorships);
  return {
    id: row.id,
    display_name: row.display_name?.trim() || "Unnamed child",
    age_years: calcAge(row.date_of_birth),
    bd_division_name: row.bd_division?.name?.trim() ?? null,
    photo_url: photoUrlFromUuid(row.Photo),
    status: row.status ?? "active",
    category: deriveCategoryFromSponsorships(sponsorships),
    support_type: row.support_type ?? null,
    monthly_cost: row.monthly_cost ?? null,
    last_visit_date: row.last_visit_date ?? null,
    relationship: relationshipFor(
      row.uploaded_by_di,
      row.assigned_di,
      userId,
    ),
    sponsor_display_name: primary ? donorDisplayNameFor(primary) : null,
    sponsor_category: primary ? sponsorCategoryFor(primary) : null,
    sponsor_amount:
      primary?.monthly_amount === null || primary?.monthly_amount === undefined
        ? null
        : Number(primary.monthly_amount),
    sponsor_currency: primary?.currency ?? null,
    last_report_date: null, // wired up in Session 45
  };
}

function rowToDetail(row: ChildRow, userId: string): DiChildDetail {
  // Detail returns a base summary with sponsorships intentionally
  // empty — sponsorships are fetched separately so the redaction
  // path lives in one place (getDiChildSponsorships). The card's
  // "primary sponsor" data is a small UI flourish, not a contract,
  // so derived fields here that require sponsorship state are null.
  return {
    id: row.id,
    display_name: row.display_name?.trim() || "Unnamed child",
    age_years: calcAge(row.date_of_birth),
    bd_division_name: row.bd_division?.name?.trim() ?? null,
    photo_url: photoUrlFromUuid(row.Photo),
    status: row.status ?? "active",
    category: "awaiting",
    support_type: row.support_type ?? null,
    monthly_cost: row.monthly_cost ?? null,
    last_visit_date: row.last_visit_date ?? null,
    relationship: relationshipFor(
      row.uploaded_by_di,
      row.assigned_di,
      userId,
    ),
    sponsor_display_name: null,
    sponsor_category: null,
    sponsor_amount: null,
    sponsor_currency: null,
    last_report_date: null,
    story: row.story ?? "",
    education_level: row.education_level ?? null,
    district_internal: row.district_internal ?? null,
    guardian_summary_internal: row.guardian_summary_internal ?? null,
    approved_at: row.approved_at ?? null,
    uploaded_by_di: row.uploaded_by_di,
    assigned_di: row.assigned_di,
  };
}

// ─── Scoped child fetchers ──────────────────────────────────────────

// Filter expression: child is in DI scope when uploaded_by_di OR
// assigned_di equals userId, AND status is not 'withdrawn' OR
// 'awaiting_intake' (Session 52a — stubs from CREATE drafts are
// excluded from the DI's main children list; they show up under
// /di/drafts via child_proposal.status='draft' instead).
function buildScopeFilter(userId: string): Record<string, unknown> {
  return {
    _and: [
      {
        _or: [
          { uploaded_by_di: { _eq: userId } },
          { assigned_di: { _eq: userId } },
        ],
      },
      { status: { _nin: ["withdrawn", "awaiting_intake"] } },
    ],
  };
}

/**
 * Returns the children visible to the given DI per spec §2.1.
 *
 * Sort is currently alphabetical by display_name — the v3 spec calls
 * for "status priority" sort (awaiting first, then prepaid, then
 * monthly), which we'd compute in JS after the sponsorship round-trip
 * lands. Doing that here would require a single batch sponsorship
 * fetch keyed by the children-list result. Implemented below.
 */
export async function getDiChildrenForUser(
  userId: string,
): Promise<DiChildSummary[]> {
  const scopeFilter = buildScopeFilter(userId);
  let childRows: ChildRow[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: scopeFilter,
        fields: [...CHILD_SUMMARY_FIELDS],
        limit: -1,
        sort: ["display_name"],
      } as never),
    )) as unknown as ChildRow[] | undefined;
    if (Array.isArray(rows)) childRows = rows;
  } catch (err) {
    console.warn(
      "[di-children] getDiChildrenForUser failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (childRows.length === 0) return [];

  // Single batch fetch of sponsorships across all in-scope children.
  // We restrict to status in (active, paused) — cancelled rows are not
  // useful for the card summary and inflate the payload.
  const childIds = childRows.map((c) => c.id);
  let sponsorshipRows: SponsorshipWithDonor[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _in: childIds } },
            { status: { _in: ["active", "paused"] } },
          ],
        },
        fields: [...SPONSORSHIP_FIELDS],
        limit: -1,
      } as never),
    )) as unknown as SponsorshipWithDonor[] | undefined;
    if (Array.isArray(rows)) sponsorshipRows = rows;
  } catch (err) {
    console.warn(
      "[di-children] sponsorship batch fetch failed",
      err instanceof Error ? err.message : err,
    );
    // Fall through with empty sponsorships — children still render.
  }

  // Bucket sponsorships by child id for O(1) lookup.
  const byChild = new Map<string, SponsorshipWithDonor[]>();
  for (const s of sponsorshipRows) {
    const arr = byChild.get(s.child) ?? [];
    arr.push(s);
    byChild.set(s.child, arr);
  }

  const summaries = childRows.map((row) =>
    rowToSummary(row, userId, byChild.get(row.id) ?? []),
  );

  // Spec §6.2 sort: awaiting first (most attention), then prepaid,
  // then monthly, then paused. Within each bucket preserve the
  // alphabetical order from the SQL sort.
  const RANK: Record<DiChildCategory, number> = {
    awaiting: 0,
    prepaid: 1,
    monthly: 2,
    paused: 3,
  };
  return summaries.slice().sort((a, b) => {
    const dr = RANK[a.category] - RANK[b.category];
    if (dr !== 0) return dr;
    return a.display_name.localeCompare(b.display_name);
  });
}

/**
 * Session 52c — ownership-only scope check for attachment writes
 * (documents, intake photos). Returns true when the DI is
 * uploaded_by_di OR assigned_di on the child, regardless of child
 * status. Distinct from `getDiChildById` which ALSO excludes
 * `withdrawn` + `awaiting_intake` because those statuses don't
 * surface in the "Children I manage" list.
 *
 * Why split: the attachment endpoints (di-documents +
 * di-intake-photos) need to allow uploads against the DI's own
 * `awaiting_intake` stub children (Session 52a unlock). They DON'T
 * need the full liveness check that detail pages / reports /
 * deliveries pages use — those rightfully 404 stubs because the
 * profile isn't real yet, but attachments to the stub ARE the
 * point of the Session 52a flow.
 *
 * Other DIs still can't access the stub (the ownership filter
 * blocks them) — privacy preserved.
 */
export async function canDiAttachToChild(
  childId: string,
  userId: string,
): Promise<boolean> {
  if (!childId || typeof childId !== "string") return false;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [
            { id: { _eq: childId } },
            {
              _or: [
                { uploaded_by_di: { _eq: userId } },
                { assigned_di: { _eq: userId } },
              ],
            },
            // Only `withdrawn` is hard-excluded — once a child is
            // withdrawn, no DI should still be uploading anything
            // against them. `awaiting_intake` IS allowed (stub
            // unlock); `active` / `sponsored` allowed (post-approval
            // edits); other statuses allowed conservatively (admin
            // can tighten via the Directus permission layer if needed).
            { status: { _neq: "withdrawn" } },
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn(
      "[di-children] canDiAttachToChild failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Single child fetch with scope guard.
 * Returns null when the child is out of scope (or doesn't exist).
 * Caller renders 404 on null.
 */
export async function getDiChildById(
  childId: string,
  userId: string,
): Promise<DiChildDetail | null> {
  if (!childId || typeof childId !== "string") return null;
  let rows: ChildRow[] = [];
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [
            { id: { _eq: childId } },
            buildScopeFilter(userId),
          ],
        },
        fields: [...CHILD_DETAIL_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as ChildRow[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-children] getDiChildById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  const row = rows[0];
  if (!row) return null;
  return rowToDetail(row, userId);
}

// ─── bd_division + bd_district lookups (for form dropdowns) ──────────

export interface BdDivisionOption {
  code: string;
  name: string;
}

export interface BdDistrictOption {
  code: string;
  name: string;
  name_bn: string;
  sort_order: number;
  division: string; // FK back to bd_division.code (drives cascade)
}

/**
 * Returns all bd_district rows for the cascade dropdown in ChildForm.
 * Sorted by (division, sort_order) so the client component can group
 * cleanly without re-sorting.
 *
 * No restriction filter — the form's client-side cascade decides
 * which rows to show based on the currently-selected division. The
 * full list is small enough (~64 rows for all of Bangladesh) that
 * passing it down once is cheaper than re-fetching on every cascade
 * change.
 */
export async function getBdDistricts(): Promise<BdDistrictOption[]> {
  let rows: BdDistrictOption[] = [];
  try {
    const result = (await directusServer().request(
      readItems("bd_district" as never, {
        fields: ["code", "name", "name_bn", "sort_order", "division"],
        limit: -1,
        sort: ["division", "sort_order"],
      } as never),
    )) as unknown as BdDistrictOption[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-children] getBdDistricts failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows.filter((r) => r.code && r.name && r.division);
}

/**
 * Returns all bd_division rows. If `restrictToCodes` is provided
 * (Add New Child page), only divisions whose code is in that list
 * are returned. Sorted alphabetically by name.
 */
export async function getBdDivisions(
  restrictToCodes?: string[] | null,
): Promise<BdDivisionOption[]> {
  let rows: Array<{ code: string; name: string }> = [];
  try {
    const filter =
      restrictToCodes && restrictToCodes.length > 0
        ? { code: { _in: restrictToCodes } }
        : undefined;
    const result = (await directusServer().request(
      readItems("bd_division" as never, {
        ...(filter ? { filter } : {}),
        fields: ["code", "name"],
        limit: -1,
        sort: ["name"],
      } as never),
    )) as unknown as Array<{ code: string; name: string }> | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-children] getBdDivisions failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  return rows
    .filter((r) => r.code && r.name)
    .map((r) => ({ code: r.code, name: r.name }));
}

// ─── Edit-form snapshot ─────────────────────────────────────────────
//
// Specialized fetcher for /di/children/[id]/edit. Returns the raw
// values the form needs to pre-fill (bd_division.code, raw Photo
// UUID, date_of_birth) — these aren't on DiChildDetail because the
// detail page's reading audience doesn't need them.

export interface ChildEditSnapshot {
  id: string;
  // Identity
  // P1.3 — first_name is the new public-facing name. Legacy rows
  // pre-P1.3 may carry null until the DI edits them.
  first_name: string | null;
  display_name: string;
  gender: string | null;
  date_of_birth: string | null;
  photo_consent: boolean | null;
  current_photo_uuid: string | null;
  // Location (Session 48a — added permanent_address)
  bd_division_code: string | null;
  bd_district_code: string | null;
  district_internal: string | null;
  permanent_address: string | null;
  // Education + interests (Session 48a — added educational_organization
  // M2O id + school_name_raw fallback; areas_of_interest is now text[])
  education_level: string | null;
  class_grade: string | null;
  educational_organization: string | null;
  school_name_raw: string | null;
  areas_of_interest: string[] | null;
  // Donor-facing story
  story: string;
  // Support plan (Session 48a — priority columns)
  support_type: string | null;
  monthly_cost: number | null;
  priority_support: string | null;
  priority_notes: string | null;
  // Health (subset)
  blood_group: string | null;
  vaccination_status: string | null;
  last_medical_checkup: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  // Family (Session 48a — added parent_loss)
  parent_loss: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  // Socioeconomic
  household_income_source: string | null;
  monthly_household_income_bdt: number | null;
  // Guardian context (Session 48a — added employment_type, phones)
  guardian_relationship: string | null;
  guardian_employment_type: string | null;
  guardian_employment: string | null;
  guardian_phone: string | null;
  guardian_phone_alt: string | null;
  guardian_summary_internal: string | null;
  additional_family_notes: string | null;
  // Field visit / submission (Session 48a — submission_date is the
  // new canonical column; last_visit_date is mirrored alongside it)
  last_visit_date: string | null;
  submission_date: string | null;
}

// Session 46-fix-2 — full editable surface (28 mirror fields). Order
// here is the SELECT order; `rowToEditSnapshot` pulls each into the
// snapshot. Photo is requested as the raw UUID (`Photo`); bd_division
// + bd_district are expanded to their `.code` so the form pre-fill
// has the slug PKs the cascade dropdown needs.
const CHILD_EDIT_FIELDS = [
  "id",
  // P1.3 — first_name added so the edit form pre-fills the
  // public-name input.
  "first_name",
  "display_name",
  "gender",
  "date_of_birth",
  "photo_consent",
  "Photo",
  "bd_division.code",
  "bd_district.code",
  "district_internal",
  "permanent_address",
  "education_level",
  "class_grade",
  "educational_organization",
  "school_name_raw",
  "areas_of_interest",
  "story",
  "support_type",
  "monthly_cost",
  "priority_support",
  "priority_notes",
  "blood_group",
  "vaccination_status",
  "last_medical_checkup",
  "disability_status",
  "disability_notes",
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  "household_income_source",
  "monthly_household_income_bdt",
  "guardian_relationship",
  "guardian_employment_type",
  "guardian_employment",
  "guardian_phone",
  "guardian_phone_alt",
  "guardian_summary_internal",
  "additional_family_notes",
  "last_visit_date",
  "submission_date",
] as const;

/**
 * Single-child fetch with scope guard + raw editable values.
 * Returns null when out-of-scope or doesn't exist (collapsed for
 * privacy, same as getDiChildById).
 */
export async function getChildEditSnapshot(
  childId: string,
  userId: string,
): Promise<ChildEditSnapshot | null> {
  if (!childId || typeof childId !== "string") return null;
  let row:
    | {
        id: string;
        // P1.3 — first_name (public) returned for edit pre-fill.
        first_name: string | null;
        display_name: string | null;
        gender: string | null;
        date_of_birth: string | null;
        photo_consent: boolean | null;
        Photo: string | null;
        bd_division: { code?: string | null } | null;
        bd_district: { code?: string | null } | null;
        district_internal: string | null;
        permanent_address: string | null;
        education_level: string | null;
        class_grade: string | null;
        educational_organization: string | null;
        school_name_raw: string | null;
        // Session 48a — areas_of_interest is now text[]; the SDK
        // surfaces it as a JS string array.
        areas_of_interest: string[] | null;
        story: string | null;
        support_type: string | null;
        monthly_cost: number | null;
        priority_support: string | null;
        priority_notes: string | null;
        blood_group: string | null;
        vaccination_status: string | null;
        last_medical_checkup: string | null;
        disability_status: string | null;
        disability_notes: string | null;
        parent_loss: string | null;
        siblings_count: number | null;
        sibling_position: number | null;
        siblings_notes: string | null;
        household_size: number | null;
        household_income_source: string | null;
        monthly_household_income_bdt: number | null;
        guardian_relationship: string | null;
        guardian_employment_type: string | null;
        guardian_employment: string | null;
        guardian_phone: string | null;
        guardian_phone_alt: string | null;
        guardian_summary_internal: string | null;
        additional_family_notes: string | null;
        last_visit_date: string | null;
        submission_date: string | null;
      }
    | undefined;
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [{ id: { _eq: childId } }, buildScopeFilter(userId)],
        },
        fields: [...CHILD_EDIT_FIELDS],
        limit: 1,
      } as never),
    )) as unknown as Array<typeof row> | undefined;
    row = Array.isArray(result) ? result[0] : undefined;
  } catch (err) {
    console.warn(
      "[di-children] getChildEditSnapshot failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!row) return null;
  return {
    id: row.id,
    // Identity
    // P1.3 — first_name surfaced for the form's public-name input.
    // Legacy rows return null here until the DI edits + saves.
    first_name: row.first_name?.trim() || null,
    display_name: row.display_name?.trim() || "",
    gender: row.gender ?? null,
    date_of_birth: row.date_of_birth ?? null,
    photo_consent: row.photo_consent ?? null,
    current_photo_uuid: row.Photo ?? null,
    // Location
    bd_division_code: row.bd_division?.code ?? null,
    bd_district_code: row.bd_district?.code ?? null,
    district_internal: row.district_internal ?? null,
    permanent_address: row.permanent_address ?? null,
    // Education + interests
    education_level: row.education_level ?? null,
    class_grade: row.class_grade ?? null,
    educational_organization: row.educational_organization ?? null,
    school_name_raw: row.school_name_raw ?? null,
    areas_of_interest: row.areas_of_interest ?? null,
    // Donor-facing story
    story: row.story ?? "",
    // Support plan
    support_type: row.support_type ?? null,
    monthly_cost: row.monthly_cost ?? null,
    priority_support: row.priority_support ?? null,
    priority_notes: row.priority_notes ?? null,
    // Health
    blood_group: row.blood_group ?? null,
    vaccination_status: row.vaccination_status ?? null,
    last_medical_checkup: row.last_medical_checkup ?? null,
    disability_status: row.disability_status ?? null,
    disability_notes: row.disability_notes ?? null,
    // Family
    parent_loss: row.parent_loss ?? null,
    siblings_count: row.siblings_count ?? null,
    sibling_position: row.sibling_position ?? null,
    siblings_notes: row.siblings_notes ?? null,
    household_size: row.household_size ?? null,
    // Socioeconomic
    household_income_source: row.household_income_source ?? null,
    monthly_household_income_bdt: row.monthly_household_income_bdt ?? null,
    // Guardian context
    guardian_relationship: row.guardian_relationship ?? null,
    guardian_employment_type: row.guardian_employment_type ?? null,
    guardian_employment: row.guardian_employment ?? null,
    guardian_phone: row.guardian_phone ?? null,
    guardian_phone_alt: row.guardian_phone_alt ?? null,
    guardian_summary_internal: row.guardian_summary_internal ?? null,
    additional_family_notes: row.additional_family_notes ?? null,
    // Field visit / submission
    last_visit_date: row.last_visit_date ?? null,
    submission_date: row.submission_date ?? null,
  };
}

/**
 * Sponsorship list for a child, scope-checked + PII-redacted.
 *
 * Returns null when the child is out of the DI's scope so the API
 * route can distinguish "no sponsorships" (return [] inside the
 * payload) from "you can't see this child" (404).
 *
 * The ONLY donor-related fields returned are:
 *   - donor_display_name (computed from visibility)
 *   - country (only when visibility=named)
 *
 * The exact `amount` IS returned — that's load-bearing transparency
 * per spec §2.6, NOT a leak. Currency is returned alongside so the UI
 * can render "USD 25/mo" or "BDT 1500/mo" honestly.
 */
export async function getDiChildSponsorships(
  childId: string,
  userId: string,
): Promise<DiSponsorshipView[] | null> {
  // Scope guard: confirm the DI can see this child before reading any
  // sponsorships. We do this with a lightweight existence check rather
  // than re-using getDiChildById (no need to pull the full detail
  // payload just to compute one boolean).
  let inScope = false;
  try {
    const result = (await directusServer().request(
      readItems("child" as never, {
        filter: {
          _and: [
            { id: { _eq: childId } },
            buildScopeFilter(userId),
          ],
        },
        fields: ["id"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    inScope = Array.isArray(result) && result.length > 0;
  } catch (err) {
    console.warn(
      "[di-children] sponsorship scope check failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  if (!inScope) return null;

  let rows: SponsorshipWithDonor[] = [];
  try {
    const result = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            // Surface active + paused sponsors. Cancelled sponsorships
            // are noise for the DI's "who's caring for this child"
            // question — surface them in a future History tab if a
            // DI ever asks.
            { status: { _in: ["active", "paused"] } },
          ],
        },
        fields: [...SPONSORSHIP_FIELDS],
        limit: -1,
        // Active before paused, then by start_date desc within bucket.
        sort: ["status", "-start_date"],
      } as never),
    )) as unknown as SponsorshipWithDonor[] | undefined;
    if (Array.isArray(result)) rows = result;
  } catch (err) {
    console.warn(
      "[di-children] sponsorships fetch failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }

  return rows.map((s) => ({
    id: s.id,
    donor_display_name: donorDisplayNameFor(s),
    sponsor_category: sponsorCategoryFor(s),
    amount:
      s.monthly_amount === null || s.monthly_amount === undefined
        ? null
        : Number(s.monthly_amount),
    currency: s.currency ?? null,
    // Country only when the donor opted into 'named' — anonymizing
    // also means not narrowing them by country. Conservative read of
    // the whitelist in the spec.
    country:
      s.visibility === "named" ? (s.donor?.og_country ?? null) : null,
    start_date: s.start_date ?? null,
    end_date: s.end_date ?? null,
    status: s.status,
    queue_position: s.queue_position ?? null,
    prepaid_months_remaining: s.prepaid_months_remaining ?? null,
  }));
}
