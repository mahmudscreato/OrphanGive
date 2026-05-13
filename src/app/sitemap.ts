// Dynamic sitemap for crawlers. Next.js detects `app/sitemap.ts`
// automatically and serves the result at /sitemap.xml.
//
// Public-only routes — anything behind auth (/dashboard/*), in-flow
// (/sponsor/*), or API (/api/*) is intentionally omitted. Crawlers
// don't need them and indexing them would either confuse SEO or
// leak donor-side surfaces.
//
// Child profile pages are surfaced individually so each child can
// be discovered organically. The profile metadata is privacy-
// preserving (see /children/[id] generateMetadata) — donor-facing
// data lives behind the reveal-request flow, not in <meta> tags.
//
// lastModified: the `child` collection currently has no
// `date_updated` field (Directus timestamp tracking wasn't enabled
// at create-time). Fallback is the current build's `new Date()` —
// crawlers will see a fresh timestamp on every regeneration, which
// is fine for a low-volume site. Add `date_updated` to the child
// collection later if granular last-modified matters.

import type { MetadataRoute } from "next";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

type ChildRow = { id: string };

async function getActiveChildIds(): Promise<string[]> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { status: { _eq: "active" } },
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as ChildRow[];
    return Array.isArray(rows) ? rows.map((r) => r.id).filter(Boolean) : [];
  } catch {
    // Sitemap should never 500 — better to ship a partial map than
    // none. Static routes still surface even if Directus is briefly
    // unreachable.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const childIds = await getActiveChildIds();

  // Session 21 — priorities tuned per spec:
  //   1.0   homepage (changefreq weekly per spec, retained `daily`
  //         in this codebase since the homepage live-data band
  //         changes that often)
  //   0.9   /children — re-listed daily as new profiles land
  //   0.7   foundational marketing pages (about, how-it-works)
  //   0.6   /faq — content stable, lower change cadence
  //   0.5   secondary content (contact, help, for-charities,
  //         transparency)
  //   0.4   /stories — kept low until the publishing feature lands
  // /signin removed: no SEO value, only adds noise to the index.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/children`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/for-charities`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/transparency`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/stories`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
  ];

  // Legal pages — declared in the sitemap even though they
  // currently render the "Coming soon" placeholder. Search engines
  // index the URLs ahead of content, so when Mahmud authors the
  // real copy the rankings already have a target. yearly cadence
  // keeps re-crawling polite.
  const legalPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/refund`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/safeguarding`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const childPages: MetadataRoute.Sitemap = childIds.map((id) => ({
    url: `${BASE_URL}/children/${id}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...legalPages, ...childPages];
}
