import { aggregate, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export const PAGE_SIZE = 12;
export const MIN_AGE = 6;
export const MAX_AGE = 18;

export const EDUCATION_LEVELS = [
  "primary",
  "secondary",
  "madrasa",
  "vocational",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export type ChildrenFilters = {
  district: string | null;
  minAge: number;
  maxAge: number;
  gender: Gender | null;
  education: EducationLevel | null;
  page: number;
};

export type ChildSummary = {
  id: string;
  display_name: string | null;
  gender: string | null;
  age: number | null;
  region: string | null;
  district: string | null;
  story_preview: string | null;
  photo: string | null;
  education_level: string | null;
  class_grade: string | null;
};

type RelationRow = { code?: string | null; name?: string | null } | null;

type DirectusChildRow = {
  id: string | number;
  display_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  // Region/district are now M2O relations to bd_division / bd_district.
  // The legacy text columns were removed during schema migration.
  bd_division?: RelationRow;
  bd_district?: RelationRow;
  story?: string | null;
  // Directus field is `Photo` (capital P) — relation to directus_files.
  // When requested as a literal field it returns the file UUID string.
  Photo?: string | null;
  education_level?: string | null;
  class_grade?: string | null;
};

const SAFE_FIELDS = [
  "id",
  "display_name",
  "gender",
  "date_of_birth",
  "bd_division.code",
  "bd_division.name",
  "bd_district.code",
  "bd_district.name",
  "story",
  "Photo",
  "education_level",
  "class_grade",
] as const;

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

function previewStory(s: string | null | undefined, max = 80): string | null {
  if (!s) return null;
  const cleaned = stripHtml(s);
  if (!cleaned) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}...`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Convert an inclusive age range [minAge, maxAge] to the matching DOB range.
// A person is age N from their Nth birthday until the day before their (N+1)th.
// So:
//   minAge=A  → DOB ≤ today − A years          (born early enough to be ≥ A)
//   maxAge=B  → DOB > today − (B+1) years      (born late enough to be ≤ B)
function ageRangeToDob(minAge: number, maxAge: number) {
  const today = new Date();
  const maxDob = new Date(today);
  maxDob.setFullYear(today.getFullYear() - minAge);

  const minDobExclusive = new Date(today);
  minDobExclusive.setFullYear(today.getFullYear() - (maxAge + 1));
  // Convert exclusive lower bound to inclusive by adding one day.
  const minDob = new Date(minDobExclusive);
  minDob.setDate(minDob.getDate() + 1);

  return { minDob: ymd(minDob), maxDob: ymd(maxDob) };
}

function buildDirectusFilter(filters: ChildrenFilters) {
  const f: Record<string, unknown> = { status: { _eq: "active" } };

  if (filters.district) {
    // The URL carries the district display name (e.g. "Khulna"). Resolve
    // it through the M2O relation since the legacy text column is gone.
    f.bd_district = { name: { _eq: filters.district } };
  }
  if (filters.gender) {
    f.gender = { _eq: filters.gender };
  }
  if (filters.education) {
    f.education_level = { _eq: filters.education };
  }
  // Only constrain DOB if the user narrowed the default range.
  const narrowed = filters.minAge > MIN_AGE || filters.maxAge < MAX_AGE;
  if (narrowed) {
    const { minDob, maxDob } = ageRangeToDob(filters.minAge, filters.maxAge);
    f.date_of_birth = { _gte: minDob, _lte: maxDob };
  }
  return f;
}

function rowToSummary(row: DirectusChildRow): ChildSummary {
  return {
    id: String(row.id),
    display_name: row.display_name?.trim() ?? null,
    gender: row.gender ?? null,
    age: calcAge(row.date_of_birth),
    region: row.bd_division?.name?.trim() ?? null,
    district: row.bd_district?.name?.trim() ?? null,
    story_preview: previewStory(row.story),
    photo: row.Photo ?? null,
    education_level: row.education_level ?? null,
    class_grade: row.class_grade ?? null,
  };
}

export type ChildrenListResult = {
  children: ChildSummary[];
  filteredCount: number;
  totalActiveCount: number;
  hasMore: boolean;
};

async function safeAggregateCount(
  filter: Record<string, unknown>,
): Promise<number> {
  try {
    const result = (await directusServer().request(
      aggregate("child" as never, {
        aggregate: { count: "*" },
        filter,
      } as never),
    )) as unknown as Array<{ count: number | string | null }> | undefined;
    const row = Array.isArray(result) ? result[0] : null;
    if (!row || row.count === null || row.count === undefined) return 0;
    const n = typeof row.count === "string" ? Number(row.count) : row.count;
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    console.warn(
      "[children-data] count failed",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export async function getChildrenPage(
  filters: ChildrenFilters,
): Promise<ChildrenListResult> {
  const directusFilter = buildDirectusFilter(filters);
  const page = Math.max(1, filters.page);
  // We render cumulatively up to the requested page (Load More appends).
  const limit = PAGE_SIZE * page;

  const [filteredCount, totalActiveCount, items] = await Promise.all([
    safeAggregateCount(directusFilter),
    safeAggregateCount({ status: { _eq: "active" } }),
    (async () => {
      try {
        const rows = (await directusServer().request(
          readItems("child" as never, {
            filter: directusFilter,
            fields: [...SAFE_FIELDS],
            limit,
            sort: ["display_name"],
          } as never),
        )) as unknown as DirectusChildRow[] | undefined;
        return Array.isArray(rows) ? rows.map(rowToSummary) : [];
      } catch (err) {
        console.warn(
          "[children-data] list failed",
          err instanceof Error ? err.message : err,
        );
        return [] as ChildSummary[];
      }
    })(),
  ]);

  const hasMore = items.length < filteredCount;
  return {
    children: items,
    filteredCount,
    totalActiveCount,
    hasMore,
  };
}

// Returns up to `limit` random active children, EXCLUDING the given id.
// Implementation: fetch the lightweight ID list of active children via the
// admin token (single round-trip), pick `limit` random ids, then fetch full
// summaries for those. Two queries total, no ORDER BY RANDOM().
//
// Trade-off: this loads all active child ids into memory. Fine at the
// current scale (<50). Above ~5k rows, switch to a DB-side random sample
// (TABLESAMPLE BERNOULLI on Postgres, or a precomputed shuffle column).
export async function getRandomActiveChildren(
  excludeId: string,
  limit = 4,
): Promise<ChildSummary[]> {
  if (limit <= 0) return [];
  let allIds: string[] = [];
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id?: string | null }> | undefined;
    if (Array.isArray(rows)) {
      allIds = rows
        .map((r) => r.id)
        .filter((id): id is string => typeof id === "string" && id !== excludeId);
    }
  } catch (err) {
    console.warn(
      "[children-data] getRandomActiveChildren id-list failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (allIds.length === 0) return [];

  // Fisher–Yates partial shuffle for the first `limit` slots.
  const n = allIds.length;
  const take = Math.min(limit, n);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    const tmp = allIds[i]!;
    allIds[i] = allIds[j]!;
    allIds[j] = tmp;
  }
  const picked = allIds.slice(0, take);

  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _in: picked } },
        fields: [...SAFE_FIELDS],
      } as never),
    )) as unknown as DirectusChildRow[] | undefined;
    if (!Array.isArray(rows)) return [];
    // Preserve the random order rather than the order Directus returns.
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return picked
      .map((id) => byId.get(id))
      .filter((r): r is DirectusChildRow => Boolean(r))
      .map(rowToSummary);
  } catch (err) {
    console.warn(
      "[children-data] getRandomActiveChildren detail-fetch failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function getActiveDistricts(): Promise<string[]> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["bd_district.name"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ bd_district?: { name?: string | null } | null }> | undefined;
    if (!Array.isArray(rows)) return [];
    const set = new Set<string>();
    for (const r of rows) {
      const d = r.bd_district?.name?.trim();
      if (d) set.add(d);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.warn(
      "[children-data] districts failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ChildrenFilters {
  const get = (k: string): string | null => {
    const v = searchParams[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const districtRaw = get("district")?.trim() || null;

  const minAgeStr = get("min_age");
  const maxAgeStr = get("max_age");
  const minAgeNum = minAgeStr !== null ? Number(minAgeStr) : NaN;
  const maxAgeNum = maxAgeStr !== null ? Number(maxAgeStr) : NaN;
  const minAge = Number.isFinite(minAgeNum)
    ? Math.min(MAX_AGE, Math.max(MIN_AGE, Math.floor(minAgeNum)))
    : MIN_AGE;
  const maxAge = Number.isFinite(maxAgeNum)
    ? Math.min(MAX_AGE, Math.max(MIN_AGE, Math.floor(maxAgeNum)))
    : MAX_AGE;

  const genderRaw = get("gender")?.toLowerCase() || null;
  const gender =
    genderRaw && (GENDERS as readonly string[]).includes(genderRaw)
      ? (genderRaw as Gender)
      : null;

  const educationRaw = get("education")?.toLowerCase() || null;
  const education =
    educationRaw && (EDUCATION_LEVELS as readonly string[]).includes(educationRaw)
      ? (educationRaw as EducationLevel)
      : null;

  const pageRaw = Number(get("page"));
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  return {
    district: districtRaw,
    minAge: Math.min(minAge, maxAge),
    maxAge: Math.max(minAge, maxAge),
    gender,
    education,
    page,
  };
}
