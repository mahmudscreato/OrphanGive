import { aggregate, readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export type HomepageStats = {
  bangladesh_total: string;
  listed: number | null;
  /**
   * Distinct children with active monthly support.
   * `sponsorship.status = 'active'` AND
   *   (`payment_schedule = 'monthly'`
   *    OR (`payment_schedule = 'monthly_prepaid'`
   *        AND (`scheduled_end_date IS NULL` OR `scheduled_end_date > NOW()`)))
   * Null payment_schedule is excluded by design.
   */
  sponsored: number | null;
  /**
   * Children waiting for a sponsor: `child.status = 'active'`
   * AND child.id NOT IN (the distinct child set above). Replaces
   * the old `joining_next` ("onboarding") metric.
   */
  waiting: number | null;
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
  // Part 5.6 Z.2 — strict tile 3 query (distinct children with
  // active monthly support) + new tile 4 query (active children
  // NOT in the tile 3 set). Both fetch raw rows then dedupe
  // client-side rather than aggregating in Directus, so the count
  // is always "distinct children" regardless of how many
  // sponsorship rows a single child might have.
  const nowIso = new Date().toISOString();

  // Active sponsorships matching the strict criteria. Null
  // payment_schedule is excluded — see HomepageStats.sponsored
  // jsdoc for the exact predicate.
  let sponsored: number | null = null;
  const sponsoredChildIds = new Set<string>();
  try {
    const rows = (await directusServer().request(
      readItems("sponsorship" as never, {
        filter: {
          _and: [
            { status: { _eq: "active" } },
            // Part 5.6 → 5.7 Fix F — exclude queued sponsorships.
            // A queued row has `status='active'` because money is
            // committed, but the actual support hasn't started yet
            // (it's waiting for a slot or the previous donor's
            // coverage to end). The Directus `queue_status` enum
            // only has 'queued' or null today; explicit OR keeps
            // future enum values from accidentally being included.
            {
              _or: [
                { queue_status: { _null: true } },
                { queue_status: { _neq: "queued" } },
              ],
            },
            {
              _or: [
                { payment_schedule: { _eq: "monthly" } },
                {
                  _and: [
                    { payment_schedule: { _eq: "monthly_prepaid" } },
                    {
                      _or: [
                        { scheduled_end_date: { _null: true } },
                        { scheduled_end_date: { _gt: nowIso } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        fields: ["child"],
        limit: -1,
      } as never),
    )) as unknown as
      | Array<{ child: string | number | { id: string | number } | null }>
      | undefined;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const c = r.child;
        // Part 5.8 Fix C.4 — coerce to string defensively.
        // Directus can return primary keys as either string or
        // number depending on the column type; the Tile 4 set
        // membership check below also coerces, so both sides
        // end up comparing strings regardless of source type.
        const cid =
          typeof c === "string" || typeof c === "number"
            ? String(c)
            : c && typeof c === "object" && c.id != null
              ? String(c.id)
              : null;
        if (cid) sponsoredChildIds.add(cid);
      }
      sponsored = sponsoredChildIds.size;
    }
  } catch (err) {
    console.warn(
      "[homepage-data] tile 3 (sponsored) query failed",
      err instanceof Error ? err.message : err,
    );
  }

  // All active children — used to compute both `listed` (total
  // count) and `waiting` (count NOT in the sponsored set above).
  let listed: number | null = null;
  let waiting: number | null = null;
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string | number }> | undefined;
    if (Array.isArray(rows)) {
      listed = rows.length;
      // `waiting` only meaningful if the sponsored query succeeded;
      // otherwise we skip rather than report a misleading number.
      // Part 5.8 Fix C.4 — `String(c.id)` keeps the comparison
      // consistent with the same coercion above when building
      // `sponsoredChildIds`.
      if (sponsored !== null) {
        waiting = rows.filter(
          (c) => !sponsoredChildIds.has(String(c.id)),
        ).length;
      }
    }
  } catch (err) {
    console.warn(
      "[homepage-data] active children query failed",
      err instanceof Error ? err.message : err,
    );
  }

  // Part 5.8 Fix C.4 — math-identity warning. With both Tile 3
  // and Tile 4 sourced from the SAME `sponsoredChildIds` set
  // (and consistent string coercion), the identity
  // `waiting === listed - (sponsored ∩ listed)` should hold.
  // If sponsored children are entirely a subset of listed
  // children (the normal case), this simplifies to
  // `waiting === listed - sponsored`. A gap here means either
  // (a) a sponsored child has child.status ≠ 'active', or
  // (b) ID type drift slipped past the coercion. Doesn't
  // block rendering — just notes the drift for ops.
  if (listed !== null && sponsored !== null && waiting !== null) {
    const expected = listed - sponsored;
    if (waiting !== expected) {
      console.warn(
        `[homepage-stats] math identity drift: listed=${listed}, sponsored=${sponsored}, waiting=${waiting}, expected waiting=${expected}. ` +
          `Likely cause: at least one sponsored child has child.status ≠ 'active'.`,
      );
    }
  }

  return {
    bangladesh_total: "4.8M",
    listed,
    sponsored,
    waiting,
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
