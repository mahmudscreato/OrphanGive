import { readItems, readMe } from "@directus/sdk";
import { cookies } from "next/headers";
import { directusServer } from "./directus";
import { ACCESS_COOKIE, getServerDirectus } from "./directus-server";

// ─── Tier model ──────────────────────────────────────────────────────────────
// public — no auth cookie / invalid token. Sees only the safe public fields.
// donor  — authenticated donor (no active sponsorship for THIS child).
//          Sees full story, but encrypted fields are never fetched.
// admin  — Administrator / tenant Admin / Data Inputter. Bypass for testing —
//          fetches encrypted fields too.
export type ViewerTier = "public" | "donor" | "admin";

// Admin detection: look for any policy on the user's role with
// admin_access=true. This is the actual Directus semantic for "admin" and
// is robust to roles being added/renamed/migrated.
type MeShape = {
  id?: string;
  role?:
    | { id?: string; policies?: Array<{ policy?: { admin_access?: boolean } }> }
    | null;
};

export async function getViewerTier(): Promise<{
  tier: ViewerTier;
  userId: string | null;
}> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return { tier: "public", userId: null };
  try {
    const client = getServerDirectus(accessToken);
    const me = (await client.request(
      readMe({ fields: ["id", "role.id", "role.policies.policy.admin_access"] }),
    )) as MeShape;
    if (!me?.id) return { tier: "public", userId: null };
    const policies = me.role?.policies ?? [];
    const isAdmin = policies.some((p) => p.policy?.admin_access === true);
    return { tier: isAdmin ? "admin" : "donor", userId: me.id };
  } catch {
    return { tier: "public", userId: null };
  }
}

// ─── Profile shape ───────────────────────────────────────────────────────────
//
// Session 50 — extended with the Tier 1/2 fields catalogued in the
// Session 49 donor-surface audit. Tier 1 fields live at the top
// level (always populated regardless of viewer auth state); Tier 2
// fields live under `tier2` (populated only when tier !== 'public').
//
// Tier 3 fields (permanent_address, guardian_phone, guardian_phone_alt,
// guardian_employment, guardian_employment_type, district_internal,
// guardian_summary_internal, additional_family_notes, submission_date,
// last_visit_date, last_medical_checkup, monthly_household_income_bdt,
// priority_notes) are never present in this shape — they're not in
// the SELECT list, so even for admin viewers of the donor profile
// they're absent from the payload. Admins reach those via the DI /
// admin data layers.

export type ChildProfileTier2 = {
  educational_organization: {
    id: string;
    name: string;
    type: string | null;
  } | null;
  school_name_raw: string | null;
  parent_loss: string | null;
  siblings_count: number | null;
  sibling_position: number | null;
  siblings_notes: string | null;
  household_size: number | null;
  household_income_source: string | null;
  disability_status: string | null;
  disability_notes: string | null;
  blood_group: string | null;
  vaccination_status: string | null;
  guardian_relationship: string | null;
};

export type ChildProfile = {
  id: string;
  /**
   * P1.3 — public-safe name. On `tier === "public"` this is the
   * `first_name` column (or "A child" fallback when null/empty).
   * On Tier-2 / admin tiers it's the raw `display_name` column
   * (or `first_name` / "A child" fallback). The field NAME stays
   * `display_name` so existing consumers don't need refactor; the
   * VALUE is per-tier safe by data-layer construction.
   */
  display_name: string;
  age: number | null;
  birth_year: number | null;
  district: string | null;
  region: string | null;
  // For tier 1 the story is trimmed to 200 chars; tier 2/3 receives full text.
  story: string | null;
  story_truncated: boolean;
  photo: string | null;
  status: string;
  education_level: string | null;
  class_grade: string | null;
  areas_of_interest: string[];
  // Session 50 — Tier 1 addition. Donor-side may render an "Urgent"
  // hero badge when value === 'urgent' (Session 51 design call).
  priority_support: string | null;
  // Tier 2 — populated only for authenticated viewers (donor or
  // admin). Public viewers see this as null.
  tier2: ChildProfileTier2 | null;
  // Only populated for admin tier (and eventually tier-3 sponsors with
  // approved reveals — see TODO at revealStatusFor).
  encrypted: {
    exact_birthdate: string | null;
    full_address: string | null;
    school_name: string | null;
    guardian_full_name: string | null;
    guardian_contact: string | null;
    family_circumstances: string | null;
  } | null;
};

// Hotfix R1 — bd_district.* moved OUT of PUBLIC_FIELDS into TIER2_FIELDS.
// Tier 1 sees Bangladesh DIVISION only; the district is one level too
// specific for the public contract (64 divisions vs 8 divisions narrows
// a child's location too far). bd_division.* stays in PUBLIC_FIELDS so
// the public location pill still renders.
//
// P1.3 — `display_name` moved OUT of PUBLIC_FIELDS into TIER2_FIELDS.
// Public viewers receive `first_name` only; if a DI ever types a
// surname into `display_name` it cannot reach the Tier-1 SQL response
// because it isn't selected. The composeProfile function below sets
// the returned `display_name` field to first_name on public tier (or
// "A child" fallback), keeping the consumer surface unchanged.
const PUBLIC_FIELDS = [
  "id",
  "first_name",
  "gender",
  "date_of_birth",
  "story",
  "Photo",
  "status",
  "education_level",
  "class_grade",
  "areas_of_interest",
  // Session 50 — priority_support is Tier 1 per the audit doc.
  "priority_support",
  "bd_division.code",
  "bd_division.name",
] as const;

// Session 50 — Tier 2 SELECT list. Added to the fetch ONLY when
// the viewer is authenticated (donor or admin tier). Public viewers
// never receive these fields in the response payload.
//
// `educational_organization` is a M2O relation to the `school` table;
// expanding `.id`, `.name`, `.type` matches the bd_division /
// bd_district expansion pattern already used for location fields.
const TIER2_FIELDS = [
  // P1.3 — display_name reserved for Tier 2+. Internal record name;
  // public viewers see first_name only via PUBLIC_FIELDS. Authed
  // donors / admin / DI see display_name as today.
  "display_name",
  // Hotfix R1 — bd_district promoted to Tier 2. See PUBLIC_FIELDS comment.
  "bd_district.code",
  "bd_district.name",
  "educational_organization.id",
  "educational_organization.name",
  "educational_organization.type",
  "school_name_raw",
  "parent_loss",
  "siblings_count",
  "sibling_position",
  "siblings_notes",
  "household_size",
  "household_income_source",
  "disability_status",
  "disability_notes",
  "blood_group",
  "vaccination_status",
  "guardian_relationship",
] as const;

const ENCRYPTED_FIELDS = [
  "exact_birthdate_encrypted",
  "full_address_encrypted",
  "school_name_encrypted",
  "guardian_full_name_encrypted",
  "guardian_contact_encrypted",
  "family_circumstances_encrypted",
] as const;

type DirectusChildRow = {
  id: string;
  // P1.3 — `first_name` is the Tier-1 public name (PUBLIC_FIELDS).
  // `display_name` is reserved for Tier 2+ (TIER2_FIELDS) so public
  // responses don't even contain the internal name in the payload.
  first_name?: string | null;
  display_name?: string | null;
  date_of_birth?: string | null;
  story?: string | null;
  Photo?: string | null;
  status?: string | null;
  education_level?: string | null;
  class_grade?: string | null;
  areas_of_interest?: string[] | string | null;
  // Session 50 — Tier 1 addition.
  priority_support?: string | null;
  bd_division?: { code?: string | null; name?: string | null } | null;
  bd_district?: { code?: string | null; name?: string | null } | null;
  // Session 50 — Tier 2 fields. Present only when the SELECT included
  // them (i.e., authenticated viewer); undefined for public viewers.
  educational_organization?: {
    id?: string | null;
    name?: string | null;
    type?: string | null;
  } | null;
  school_name_raw?: string | null;
  parent_loss?: string | null;
  siblings_count?: number | null;
  sibling_position?: number | null;
  siblings_notes?: string | null;
  household_size?: number | null;
  household_income_source?: string | null;
  disability_status?: string | null;
  disability_notes?: string | null;
  blood_group?: string | null;
  vaccination_status?: string | null;
  guardian_relationship?: string | null;
  // Encrypted (admin-only).
  exact_birthdate_encrypted?: string | null;
  full_address_encrypted?: string | null;
  school_name_encrypted?: string | null;
  guardian_full_name_encrypted?: string | null;
  guardian_contact_encrypted?: string | null;
  family_circumstances_encrypted?: string | null;
};

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

function birthYear(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function trimStory(
  s: string | null | undefined,
  max: number,
): { story: string | null; truncated: boolean } {
  if (!s) return { story: null, truncated: false };
  const cleaned = stripHtml(s);
  if (!cleaned) return { story: null, truncated: false };
  if (cleaned.length <= max) return { story: cleaned, truncated: false };
  return {
    story: `${cleaned.slice(0, max).trimEnd()}…`,
    truncated: true,
  };
}

function parseInterests(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  return [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getChildById(
  id: string,
  tier: ViewerTier,
): Promise<ChildProfile | null> {
  if (!UUID_RE.test(id)) return null;

  // Session 50 — compose the SELECT list per tier:
  //   public  → Tier 1 only
  //   donor   → Tier 1 + Tier 2 (the new sponsor-after-consent fields)
  //   admin   → Tier 1 + Tier 2 + ENCRYPTED (admin user viewing the
  //             donor profile; Tier 3 fields are still NEVER in this
  //             SELECT — admins reach those via the DI / admin data
  //             layers, never via the donor-facing query)
  const fields: string[] = [...PUBLIC_FIELDS];
  if (tier !== "public") {
    fields.push(...TIER2_FIELDS);
  }
  if (tier === "admin") {
    fields.push(...ENCRYPTED_FIELDS);
  }

  let row: DirectusChildRow | null;
  try {
    const items = (await directusServer().request(
      readItems("child" as never, {
        filter: { _and: [{ id: { _eq: id } }, { status: { _eq: "active" } }] },
        fields,
        limit: 1,
      } as never),
    )) as unknown as DirectusChildRow[] | undefined;
    row = Array.isArray(items) && items[0] ? items[0] : null;
  } catch (err) {
    console.warn(
      "[child-profile-data] getChildById failed",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  if (!row || !row.id) return null;

  const truncate = tier === "public" ? 200 : Number.POSITIVE_INFINITY;
  const { story, truncated } = trimStory(row.story, truncate);

  const encrypted =
    tier === "admin"
      ? {
          exact_birthdate: row.exact_birthdate_encrypted ?? null,
          full_address: row.full_address_encrypted ?? null,
          school_name: row.school_name_encrypted ?? null,
          guardian_full_name: row.guardian_full_name_encrypted ?? null,
          guardian_contact: row.guardian_contact_encrypted ?? null,
          family_circumstances: row.family_circumstances_encrypted ?? null,
        }
      : null;

  // Session 50 — Tier 2 enrichment. Populated only for authenticated
  // viewers; public viewers see `tier2: null`. Render gating happens
  // downstream — even when populated, no donor-side component reads
  // these fields yet (Session 51 will).
  const tier2: ChildProfileTier2 | null =
    tier !== "public"
      ? {
          educational_organization:
            row.educational_organization && row.educational_organization.id
              ? {
                  id: String(row.educational_organization.id),
                  name: row.educational_organization.name?.trim() ?? "",
                  type: row.educational_organization.type ?? null,
                }
              : null,
          school_name_raw: row.school_name_raw?.trim() ?? null,
          parent_loss: row.parent_loss ?? null,
          siblings_count: row.siblings_count ?? null,
          sibling_position: row.sibling_position ?? null,
          siblings_notes: row.siblings_notes?.trim() ?? null,
          household_size: row.household_size ?? null,
          household_income_source: row.household_income_source ?? null,
          disability_status: row.disability_status ?? null,
          disability_notes: row.disability_notes?.trim() ?? null,
          blood_group: row.blood_group ?? null,
          vaccination_status: row.vaccination_status ?? null,
          guardian_relationship: row.guardian_relationship ?? null,
        }
      : null;

  // P1.3 — public-safe name. For `tier === "public"` the SQL response
  // contains `first_name` only (display_name is in TIER2_FIELDS), so
  // we always source from `first_name` and fall back to "A child"
  // when null/empty. For Tier 2+ the response contains both columns;
  // prefer `display_name` (the internal record name) but fall back
  // through `first_name` → "A child" so a row with neither set
  // still renders something sensible.
  const safeFirstName =
    (row.first_name ?? "").trim() || "A child awaiting sponsorship";
  const safeDisplayNameAuthed =
    (row.display_name ?? "").trim() ||
    (row.first_name ?? "").trim() ||
    "A child awaiting sponsorship";
  const publicSafeName =
    tier === "public" ? safeFirstName : safeDisplayNameAuthed;

  return {
    id: row.id,
    display_name: publicSafeName,
    age: calcAge(row.date_of_birth),
    birth_year: birthYear(row.date_of_birth),
    // Hotfix R1 — district is Tier 2+. When tier === "public",
    // bd_district isn't in the SELECT list, so row.bd_district is
    // undefined and this resolves to null. The explicit guard is
    // defense-in-depth in case a future PUBLIC_FIELDS edit
    // accidentally re-adds the field.
    // fix/donor-small-batch — district is now ADMIN-only (was Tier 2+).
    // District narrows a child's location too far for anyone outside the
    // org: donors see the DIVISION only (the safe public granularity),
    // matching the Hotfix R1 rationale that pulled district from Tier 1.
    // Admin/DI surfaces keep full location (admin via this tier; DI via
    // the separate DI data layer, untouched).
    district: tier === "admin" ? row.bd_district?.name?.trim() ?? null : null,
    region: row.bd_division?.name?.trim() ?? null,
    story,
    story_truncated: truncated,
    photo: row.Photo ?? null,
    status: row.status ?? "active",
    education_level: row.education_level ?? null,
    class_grade: row.class_grade ?? null,
    areas_of_interest: parseInterests(row.areas_of_interest),
    priority_support: row.priority_support ?? null,
    tier2,
    encrypted,
  };
}

// ─── Documents ───────────────────────────────────────────────────────────────
//
// Session 50 — REQUIRED_DOC_TYPES is now derived from the canonical
// DOCUMENT_TYPES + DOCUMENT_TYPE_LABELS in form-constants. The data
// layer reads BOTH the legacy (`type` + verified/pending_review/etc.)
// and the new brief-spec (`document_type` + approved/pending/etc.)
// columns, normalizes each row through document-normalize.ts, and
// rolls up to one summary per required type.
//
// This is what fixes the Session 49 divergence: a DI uploading via
// the new flow now correctly registers on this donor-facing surface
// when admin marks status='approved'. Legacy `type='BIRTH_CERTIFICATE'`
// rows with `status='verified'` continue to register too — the
// normalizer maps both into the same canonical (type, status) shape.

import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "./form-constants";
import {
  normalizeDocumentStatus,
  normalizeDocumentType,
} from "./document-normalize";

export const REQUIRED_DOC_TYPES: ReadonlyArray<{
  type: DocumentType;
  label: string;
}> = DOCUMENT_TYPES.map((type) => ({
  type,
  label: DOCUMENT_TYPE_LABELS[type],
}));

// `verified` here means "admin signed off" — i.e. status='approved'
// in the new vocabulary or 'verified' in the legacy. The donor-facing
// pill copy uses "verified" so we keep the field name for UX clarity.
export type DocStatus = "verified" | "pending" | "missing";
export type ChildDocSummary = {
  type: DocumentType;
  label: string;
  status: DocStatus;
};

export async function getChildDocumentsStatus(
  childId: string,
): Promise<ChildDocSummary[]> {
  if (!UUID_RE.test(childId))
    return REQUIRED_DOC_TYPES.map((d) => ({ ...d, status: "missing" as const }));

  // Read BOTH column shapes. After Session 49 the same row may have
  // either or both populated; the normalizers handle the rest.
  let rows: Array<{
    type?: string | null;
    document_type?: string | null;
    status?: string | null;
  }> = [];
  try {
    const items = (await directusServer().request(
      readItems("child_document" as never, {
        filter: { child: { _eq: childId } },
        fields: ["type", "document_type", "status"],
        limit: -1,
      } as never),
    )) as unknown as
      | Array<{ type?: string | null; document_type?: string | null; status?: string | null }>
      | undefined;
    rows = Array.isArray(items) ? items : [];
  } catch (err) {
    console.warn(
      "[child-profile-data] getChildDocumentsStatus failed",
      err instanceof Error ? err.message : err,
    );
  }

  // Normalize once.
  const normalized = rows.map((r) => ({
    type: normalizeDocumentType(r),
    status: normalizeDocumentStatus(r),
  }));

  // For each canonical required type: approved > pending > missing.
  // Rows whose normalized type is null (legacy `OTHER`) are dropped
  // here — they don't belong to any of the four required slots.
  return REQUIRED_DOC_TYPES.map(({ type, label }) => {
    const matching = normalized.filter((r) => r.type === type);
    const isVerified = matching.some((r) => r.status === "approved");
    const isPending = matching.some((r) => r.status === "pending");
    const status: DocStatus = isVerified
      ? "verified"
      : isPending
        ? "pending"
        : "missing";
    return { type, label, status };
  });
}

// ─── Updates ────────────────────────────────────────────────────────────────
export type ChildUpdate = {
  id: string;
  type: string | null;
  title: string;
  preview: string | null;
  photo: string | null;
  published_at: string | null;
  posted_by: string | null;
};

type DirectusUpdateRow = {
  id: string;
  type?: string | null;
  title?: string | null;
  content?: string | null;
  photo?: string | null;
  published_at?: string | null;
  visibility?: string | null;
  status?: string | null;
};

export async function getChildUpdates(
  childId: string,
): Promise<ChildUpdate[]> {
  if (!UUID_RE.test(childId)) return [];
  try {
    const items = (await directusServer().request(
      readItems("child_update" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "published" } },
          ],
        },
        fields: [
          "id",
          "type",
          "title",
          "content",
          "photo",
          "published_at",
          "visibility",
          "status",
        ],
        sort: ["-published_at"],
        limit: 6,
      } as never),
    )) as unknown as DirectusUpdateRow[] | undefined;
    if (!Array.isArray(items)) return [];
    return items.map((row) => {
      const cleaned = row.content ? stripHtml(row.content) : "";
      const preview = cleaned.length > 160
        ? `${cleaned.slice(0, 160).trimEnd()}…`
        : cleaned || null;
      return {
        id: String(row.id),
        type: row.type ?? null,
        title: (row.title ?? "Update").trim(),
        preview,
        photo: row.photo ?? null,
        published_at: row.published_at ?? null,
        posted_by: null,
      };
    });
  } catch (err) {
    console.warn(
      "[child-profile-data] getChildUpdates failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Moments gallery ────────────────────────────────────────────────────────
export type ChildMoment = {
  id: string;
  photo: string | null;
  caption: string | null;
  taken_at: string | null;
};

const MOMENTS_PUBLIC_LIMIT = 10;

export async function getChildMoments(childId: string): Promise<ChildMoment[]> {
  if (!UUID_RE.test(childId)) return [];
  try {
    const items = (await directusServer().request(
      readItems("child_moment" as never, {
        filter: {
          _and: [
            { child: { _eq: childId } },
            { status: { _eq: "published" } },
          ],
        },
        fields: ["id", "photo", "caption", "taken_at"],
        // display_order ASC (manual priority), then most-recent first.
        sort: ["display_order", "-taken_at"],
        limit: MOMENTS_PUBLIC_LIMIT,
      } as never),
    )) as unknown as Array<{
      id: string;
      photo?: string | null;
      caption?: string | null;
      taken_at?: string | null;
    }> | undefined;
    if (!Array.isArray(items)) return [];
    return items.map((row) => ({
      id: String(row.id),
      photo: row.photo ?? null,
      caption: row.caption?.trim() || null,
      taken_at: row.taken_at ?? null,
    }));
  } catch (err) {
    console.warn(
      "[child-profile-data] getChildMoments failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ─── Reveal status (TIER 3 enrichment) ──────────────────────────────────────
// TODO: when the reveal-request flow ships, look up reveal_request rows where
// donor=viewerId AND child=childId AND status='approved' AND revoked_at is
// null, and return the set of field_names that are unlocked. The page can
// then merge those into the encrypted block.
export async function revealStatusFor(
  _viewerId: string | null,
  _childId: string,
): Promise<{ approvedFields: string[] }> {
  return { approvedFields: [] };
}
