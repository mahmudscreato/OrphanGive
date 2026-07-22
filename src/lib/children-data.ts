import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";
import type { ChildQueueBadge } from "./sponsorship-data";

export const PAGE_SIZE = 12;
export const MIN_AGE = 6;
export const MAX_AGE = 18;

// ─── Session 36 — /children browse filters ───────────────────────────
//
// Three filters surface on /children: status / division / age.
// All three live in the URL as query params so browse links are
// shareable. Constants + parser live here so the server page and the
// client filter bar share one source of truth.
//
// PRIVACY NOTE — division-level only.
// Bangladesh has 64 districts under 8 divisions. We filter by
// DIVISION (the wider geographic unit) only on the public list. The
// underlying data has district info, but exposing district-level
// filters would let an outsider narrow a child's location far more
// than the Tier 1 privacy contract allows. Don't add district
// filtering to /children, even if it would be more useful — the
// privacy floor is not negotiable here.

/**
 * The eight Bangladesh divisions, in the canonical north-to-south
 * geographic ordering preferred by Bangladeshi government sources.
 * Each entry has a stable `value` (URL-safe slug used in the query
 * param) and a `label` (display name shown in the dropdown). The
 * value matches the lower-case division name used in the Directus
 * `bd_division.name` column once normalised.
 */
export const BANGLADESH_DIVISIONS = [
  { value: "dhaka", label: "Dhaka" },
  { value: "chittagong", label: "Chittagong" },
  { value: "khulna", label: "Khulna" },
  { value: "rajshahi", label: "Rajshahi" },
  { value: "barisal", label: "Barisal" },
  { value: "sylhet", label: "Sylhet" },
  { value: "rangpur", label: "Rangpur" },
  { value: "mymensingh", label: "Mymensingh" },
] as const;

export type DivisionValue = (typeof BANGLADESH_DIVISIONS)[number]["value"];

/**
 * Age buckets shown as chip toggles. Value is the URL-param shape
 * (`min-max`) and matches inclusive [min, max]. The buckets cover the
 * full plausible range; no need to constrain by MIN_AGE/MAX_AGE since
 * the underlying data isn't padded.
 */
export const AGE_BUCKETS = [
  { value: "0-5", label: "0–5", min: 0, max: 5 },
  { value: "6-10", label: "6–10", min: 6, max: 10 },
  { value: "11-15", label: "11–15", min: 11, max: 15 },
  { value: "16-18", label: "16–18", min: 16, max: 18 },
] as const;

export type AgeBucketValue = (typeof AGE_BUCKETS)[number]["value"];

export const SPONSOR_STATUSES = ["awaiting", "sponsored"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

/**
 * The shape of /children URL params after parsing. Each field is
 * either the validated value or null (= no filter applied).
 */
export type BrowseFilters = {
  status: SponsorStatus | null;
  division: DivisionValue | null;
  age: AgeBucketValue | null;
};

export function parseBrowseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): BrowseFilters {
  const get = (k: string): string | null => {
    const v = searchParams[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const statusRaw = get("status")?.toLowerCase().trim() ?? null;
  const status =
    statusRaw && (SPONSOR_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as SponsorStatus)
      : null;

  const divisionRaw = get("division")?.toLowerCase().trim() ?? null;
  const division =
    divisionRaw &&
    BANGLADESH_DIVISIONS.some((d) => d.value === divisionRaw)
      ? (divisionRaw as DivisionValue)
      : null;

  const ageRaw = get("age")?.toLowerCase().trim() ?? null;
  const age =
    ageRaw && AGE_BUCKETS.some((b) => b.value === ageRaw)
      ? (ageRaw as AgeBucketValue)
      : null;

  return { status, division, age };
}

export function isAnyBrowseFilterActive(f: BrowseFilters): boolean {
  return f.status !== null || f.division !== null || f.age !== null;
}

/**
 * Sponsorship category for the /children sort.
 *
 * Order is intentional and stable:
 *   1. `awaiting` — no active monthly sponsor → most attention-grabbing.
 *      These are the cards a typical visitor came here to see.
 *   2. `prepaid`  — sponsored via a `monthly_prepaid` sub. The donor's
 *      prepaid term will end at some point, so these cards may open up
 *      sooner than a recurring monthly. Surfaced second so donors
 *      considering a queue-join know there's a likely turnover slot.
 *   3. `monthly`  — sponsored via recurring `monthly` (or indefinite,
 *      where `payment_schedule = null`). Lowest urgency; the queue
 *      depth is bounded so these still accept new joiners.
 *
 * Within each category, sort by the same `approved_at asc` rule used
 * by the existing browse fetch — longest-waiting profile first within
 * its bucket.
 */
export type ChildCategory = "awaiting" | "prepaid" | "monthly";

const CATEGORY_RANK: Record<ChildCategory, number> = {
  awaiting: 0,
  prepaid: 1,
  monthly: 2,
};

export function categorizeChild(
  badge: ChildQueueBadge | undefined,
): ChildCategory {
  if (!badge?.hasActiveSponsor) return "awaiting";
  if (badge.activeSchedule === "monthly_prepaid") return "prepaid";
  return "monthly";
}

/**
 * Sort children by category (Awaiting → Prepaid → Monthly), then by
 * the secondary order (caller-supplied — typically `approved_at asc`
 * preserved from the Directus fetch).
 *
 * The input `children` is treated as already sorted by the secondary
 * key, so this function is stable: items within the same category
 * keep their input ordering.
 */
export function sortChildrenByCategory<T extends { id: string }>(
  children: ReadonlyArray<T>,
  badgeByChild: ReadonlyMap<string, ChildQueueBadge>,
): T[] {
  return children
    .map((c, idx) => ({
      child: c,
      idx,
      rank: CATEGORY_RANK[categorizeChild(badgeByChild.get(c.id))],
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // Stable secondary: preserve input order so approved_at-asc holds.
      return a.idx - b.idx;
    })
    .map((entry) => entry.child);
}

/**
 * Apply the URL-driven filters to an already-fetched, already-sorted
 * children list. Done in JS rather than at the Directus layer so the
 * sponsorship-state classification (queue badge → category) and the
 * filter pass share one in-memory pipeline. At current scale (~10
 * children) this is trivially fast; if the active pool ever exceeds
 * a few hundred, push the filters into the Directus query instead.
 */
export function applyBrowseFilters(
  children: ReadonlyArray<ChildSummary>,
  badgeByChild: ReadonlyMap<string, ChildQueueBadge>,
  filters: BrowseFilters,
): ChildSummary[] {
  return children.filter((c) => {
    if (filters.status) {
      const cat = categorizeChild(badgeByChild.get(c.id));
      const isAwaiting = cat === "awaiting";
      if (filters.status === "awaiting" && !isAwaiting) return false;
      if (filters.status === "sponsored" && isAwaiting) return false;
    }
    if (filters.division) {
      const region = c.region?.toLowerCase().trim() ?? "";
      if (region !== filters.division) return false;
    }
    if (filters.age) {
      const bucket = AGE_BUCKETS.find((b) => b.value === filters.age);
      if (!bucket) return false;
      if (c.age === null) return false;
      if (c.age < bucket.min || c.age > bucket.max) return false;
    }
    return true;
  });
}

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
  /**
   * P1.3 — public-safe name. Sourced from the `first_name` column
   * with a "A child" fallback when null/empty. The field name stays
   * `display_name` so existing card consumers don't change; the
   * VALUE is data-layer-guaranteed safe (never the internal
   * display_name column). All Tier-1 cards (BrowseChildCard,
   * FeaturedChildren, RelatedChildren / ChildCard) render this.
   */
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
  // P1.3 — `first_name` is the Tier-1 public name; SAFE_FIELDS pulls
  // only this and never the internal `display_name`.
  first_name?: string | null;
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

// Hotfix R1 — /children browse list is Tier 1 (public). BrowseChildCard
// is a client component, so anything in SAFE_FIELDS that flows into
// the props gets wire-serialized into the page HTML — render-side
// gating is not enough. DROP bd_district.* so the column never reaches
// the wire on a public surface. The browse-list FILTER for districts
// (`districts` derived list at the bottom of this file) is admin/
// internal — see `listDistricts` below — and is unaffected; the public
// browse exposes division-level filtering only per the privacy note at
// the top of this file.
//
// P1.3 — `display_name` swapped for `first_name`. SAFE_FIELDS is the
// authoritative Tier-1 SQL projection for this surface; the internal
// record name (`display_name` column) MUST NOT reach the public list
// payload. Card consumers still read `child.display_name`, which is
// now populated from `first_name` (with safe fallback).
const SAFE_FIELDS = [
  "id",
  "first_name",
  "gender",
  "date_of_birth",
  "bd_division.code",
  "bd_division.name",
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
    // P1.3 — public-safe name from `first_name`. The field name on
    // ChildSummary stays `display_name` so existing card props don't
    // need refactoring. Returns null when first_name is missing; the
    // card component's `safeDisplayName` helper then renders the
    // dignified "A child" placeholder (NEVER the internal display_name).
    display_name: row.first_name?.trim() || null,
    gender: row.gender ?? null,
    age: calcAge(row.date_of_birth),
    region: row.bd_division?.name?.trim() ?? null,
    // Hotfix R1 — district is Tier 2+; SAFE_FIELDS no longer fetches
    // bd_district.* so row.bd_district is undefined. Field kept on
    // ChildSummary for shape compatibility (existing donor-tier
    // consumers may surface district from other data sources).
    district: null,
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
  // fix/donor-small-batch — count via readItems + length, NOT the SDK's
  // aggregate() helper. Session 47 discovery (documented in
  // admin-home-stats.ts) established that this SDK's aggregate()
  // SILENTLY IGNORES the filter — so every "count of active children"
  // here was really a count of ALL children, leaking non-approved rows
  // (awaiting_intake / withdrawn) into the public-facing counts
  // ("N children awaiting sponsors" on the donor dashboard + the
  // /children callouts). Same pattern as admin-home-stats.ts safeCount.
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter,
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
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

// Total count of children currently awaiting a sponsor — same predicate
// as the public /children list (status='active' = available to sponsor).
// Used by the dashboard home's "More children you could support" section
// to surface the actual size of the awaiting pool, not just the visible
// preview cards.
export async function getAwaitingChildrenCount(): Promise<number> {
  return safeAggregateCount({ status: { _eq: "active" } });
}

/**
 * Session 17 — fetch every active child for the public browse list.
 * Sorted by `approved_at` ascending so the longest-waiting children
 * surface first. `approved_at` reflects the moment a profile became
 * publicly listed (post-verification), which is a more honest "how
 * long has this child been waiting?" signal than the system
 * `date_created` field (and `date_created` isn't readable on this
 * collection — see scripts/verify-children-list-sort.mjs).
 *
 * `display_name` is the secondary sort key so two children approved
 * in the same instant render in a stable order across requests.
 *
 * Children whose `approved_at` is null still render — they fall to
 * the end of the list (Directus default) but are visible.
 *
 * No pagination, no filtering — both deferred until the active pool
 * grows past ~25 children. See TODOs in `app/children/page.tsx`.
 */
export async function getActiveChildrenForBrowse(): Promise<ChildSummary[]> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: [...SAFE_FIELDS],
        sort: ["approved_at", "display_name"],
        limit: -1,
      } as never),
    )) as unknown as DirectusChildRow[] | undefined;
    return Array.isArray(rows) ? rows.map(rowToSummary) : [];
  } catch (err) {
    console.warn(
      "[children-data] getActiveChildrenForBrowse failed",
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
