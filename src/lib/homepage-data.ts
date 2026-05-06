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

type DirectusChildRow = {
  id: string | number;
  display_name?: string | null;
  date_of_birth?: string | null;
  region?: string | null;
  district?: string | null;
  story?: string | null;
  // Directus field is `Photo` (capital P) — relation to directus_files.
  // When requested as a literal field it returns the file UUID string.
  Photo?: string | null;
  status?: string | null;
};

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
    const items = (await directusServer().request(
      readItems(("child" as never), {
        filter: { status: { _eq: "active" } },
        fields: [
          "id",
          "display_name",
          "date_of_birth",
          "region",
          "district",
          "story",
          "Photo",
          "status",
        ],
        limit: 3,
      } as never),
    )) as unknown as DirectusChildRow[] | undefined;
    if (!Array.isArray(items)) return [];
    return items.map((row) => ({
      id: String(row.id),
      display_name: row.display_name ?? null,
      age: calcAge(row.date_of_birth),
      region: row.region ?? null,
      district: row.district ?? null,
      story: trimStory(row.story),
      photo: row.Photo ?? null,
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
