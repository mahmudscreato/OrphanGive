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
export type ChildProfile = {
  id: string;
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

const PUBLIC_FIELDS = [
  "id",
  "display_name",
  "gender",
  "date_of_birth",
  "story",
  "Photo",
  "status",
  "education_level",
  "class_grade",
  "areas_of_interest",
  "bd_division.code",
  "bd_division.name",
  "bd_district.code",
  "bd_district.name",
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
  display_name?: string | null;
  date_of_birth?: string | null;
  story?: string | null;
  Photo?: string | null;
  status?: string | null;
  education_level?: string | null;
  class_grade?: string | null;
  areas_of_interest?: string[] | string | null;
  bd_division?: { code?: string | null; name?: string | null } | null;
  bd_district?: { code?: string | null; name?: string | null } | null;
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

  const fields =
    tier === "admin"
      ? [...PUBLIC_FIELDS, ...ENCRYPTED_FIELDS]
      : [...PUBLIC_FIELDS];

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

  return {
    id: row.id,
    display_name: (row.display_name ?? "").trim() || "A child awaiting sponsorship",
    age: calcAge(row.date_of_birth),
    birth_year: birthYear(row.date_of_birth),
    district: row.bd_district?.name?.trim() ?? null,
    region: row.bd_division?.name?.trim() ?? null,
    story,
    story_truncated: truncated,
    photo: row.Photo ?? null,
    status: row.status ?? "active",
    education_level: row.education_level ?? null,
    class_grade: row.class_grade ?? null,
    areas_of_interest: parseInterests(row.areas_of_interest),
    encrypted,
  };
}

// ─── Documents ───────────────────────────────────────────────────────────────
export const REQUIRED_DOC_TYPES = [
  { type: "BIRTH_CERTIFICATE", label: "Birth certificate" },
  { type: "DEATH_CERTIFICATE_FATHER", label: "Father's death certificate" },
  { type: "DEATH_CERTIFICATE_MOTHER", label: "Mother's death certificate" },
  { type: "SCHOOL_RECOMMENDATION", label: "School recommendation" },
] as const;

export type DocStatus = "verified" | "pending" | "missing";
export type ChildDocSummary = {
  type: string;
  label: string;
  status: DocStatus;
};

export async function getChildDocumentsStatus(
  childId: string,
): Promise<ChildDocSummary[]> {
  if (!UUID_RE.test(childId))
    return REQUIRED_DOC_TYPES.map((d) => ({ ...d, status: "missing" as const }));
  let rows: Array<{ type?: string; status?: string }> = [];
  try {
    const items = (await directusServer().request(
      readItems("child_document" as never, {
        filter: { child: { _eq: childId } },
        fields: ["type", "status"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ type?: string; status?: string }> | undefined;
    rows = Array.isArray(items) ? items : [];
  } catch (err) {
    console.warn(
      "[child-profile-data] getChildDocumentsStatus failed",
      err instanceof Error ? err.message : err,
    );
  }
  // For each required doc type, prefer verified > pending > missing.
  return REQUIRED_DOC_TYPES.map(({ type, label }) => {
    const matching = rows.filter((r) => r.type === type);
    const verified = matching.some((r) => r.status === "verified");
    const pending = matching.some((r) => r.status === "pending");
    const status: DocStatus = verified
      ? "verified"
      : pending
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
