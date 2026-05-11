import { aggregate, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export type HomepageStats = {
  bangladesh_total: string;
  listed: number | null;
  sponsored: number | null;
  joining_next: number | null;
};

export type FeaturedChild = {
  id: string;
  display_name: string | null;
  age: number | null;
  region: string | null;
  district: string | null;
  story: string | null;
  photo: string | null;
  status: string | null;
};

type RelationRow = { code?: string | null; name?: string | null } | null;

type DirectusChildRow = {
  id: string | number;
  display_name?: string | null;
  date_of_birth?: string | null;
  // Region/district are now M2O relations to bd_division / bd_district. We
  // request `.name` and re-expose it as the legacy string shape for the
  // frontend. The legacy text columns were removed during schema migration.
  bd_division?: RelationRow;
  bd_district?: RelationRow;
  story?: string | null;
  // Directus field is `Photo` (capital P) — relation to directus_files.
  // When requested as a literal field it typically returns the file
  // UUID string, but in some schema configurations Directus returns
  // the full file row `{ id, filename_disk, ... }`. Type the field
  // as the union so the runtime coercion in `coercePhotoId` is
  // type-checked rather than `as never`-cast.
  Photo?: string | { id?: string | null } | null;
  status?: string | null;
};

/**
 * Normalize a Directus file-relation value to a non-empty UUID
 * string, or null if it's missing / malformed. Handles:
 *   - null / undefined → null
 *   - empty / whitespace string → null
 *   - non-empty string → trimmed string
 *   - relation object `{ id }` → trimmed id, or null if id is missing/empty
 *
 * The frontend filter in FeaturedChildren.tsx still rechecks
 * for truthiness as belt-and-braces.
 */
function coercePhotoId(
  raw: string | { id?: string | null } | null | undefined,
): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "object" && "id" in raw && typeof raw.id === "string") {
    const trimmed = raw.id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

type AggregateRow = { count: number | string | null };

async function safeCount(
  collection: string,
  filter: Record<string, unknown>,
): Promise<number | null> {
  try {
    const result = (await directusServer().request(
      // The SDK's aggregate is generic over the schema, which we haven't typed.
      // Cast to bypass the empty-schema constraint while preserving runtime safety.
      aggregate(collection as never, {
        aggregate: { count: "*" },
        filter,
      } as never),
    )) as unknown as AggregateRow[] | undefined;
    const row = Array.isArray(result) ? result[0] : null;
    if (!row) return null;
    const c = row.count;
    if (c === null || c === undefined) return null;
    const n = typeof c === "string" ? Number(c) : c;
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    console.warn(
      `[homepage-data] count failed for collection=${collection}`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export async function getHomepageStats(): Promise<HomepageStats> {
  const [listed, sponsored, joining_next] = await Promise.all([
    safeCount("child", { status: { _eq: "active" } }),
    safeCount("sponsorship", { status: { _eq: "active" } }),
    safeCount("child", {
      status: { _in: ["draft", "pending_approval"] },
    }),
  ]);
  return {
    bangladesh_total: "4.8M",
    listed,
    sponsored,
    joining_next,
  };
}

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

function trimStory(s: string | null | undefined, max = 120): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export async function getFeaturedChildren(): Promise<FeaturedChild[]> {
  try {
    // Session 16 polish Fix C (tightened) — fetch only children
    // whose Photo field is non-null at the Directus level. The
    // frontend then filters again defensively in case the field
    // returns an empty string, malformed value, or an object
    // instead of the expected UUID string.
    const items = (await directusServer().request(
      readItems(("child" as never), {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            { Photo: { _nnull: true } },
          ],
        },
        fields: [
          "id",
          "display_name",
          "date_of_birth",
          "bd_division.code",
          "bd_division.name",
          "bd_district.code",
          "bd_district.name",
          "story",
          "Photo",
          "status",
        ],
        // Part 4 Fix 5 — bumped from 9 → 20 so we have enough
        // candidates after the photo + sponsor filters to fill
        // 4 cards on the homepage. The `status: active` filter
        // already excludes children who are sponsored; the
        // schema's `active` state IS the "available for
        // sponsorship" state.
        limit: 20,
      } as never),
    )) as unknown as DirectusChildRow[] | undefined;
    if (!Array.isArray(items)) return [];
    return items.map((row) => ({
      id: String(row.id),
      display_name: row.display_name ?? null,
      age: calcAge(row.date_of_birth),
      region: row.bd_division?.name ?? null,
      district: row.bd_district?.name ?? null,
      story: trimStory(row.story),
      // Coerce Photo to a string id regardless of whether
      // Directus returned a UUID string (expected per field
      // selector) or a relation object (defensive — happens when
      // schema config differs from this query). Anything that
      // can't be coerced ends up null and gets filtered.
      photo: coercePhotoId(row.Photo),
      status: row.status ?? null,
    }));
  } catch (err) {
    console.warn(
      "[homepage-data] featured children fetch failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export function directusAssetUrl(
  photoId: string | null | undefined,
): string | null {
  if (!photoId) return null;
  return `/api/assets/${photoId}`;
}
