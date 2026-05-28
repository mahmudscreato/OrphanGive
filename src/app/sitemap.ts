// Dynamic sitemap for crawlers. Next.js detects `app/sitemap.ts`
// automatically and serves the result at /sitemap.xml.
//
// Public-only routes — anything behind auth (/dashboard/*), in-flow
// (/sponsor/*), or API (/api/*) is intentionally omitted. Crawlers
// don't need them and indexing them would either confuse SEO or
// leak donor-side surfaces.
//
// P1.1 — /children and every /children/[id] are explicitly excluded.
// Those routes emit `robots: index:false, follow:false` per page
// (see src/app/children/page.tsx and /children/[id]/page.tsx) and
// robots.ts disallows the path. The sitemap omission is the third
// layer of defense: there is no point telling Google about URLs
// we've told Google not to index. The previous getActiveChildIds()
// Directus fetch + childPages enumeration was removed wholesale.

import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Session 21 priorities (P1.1 — /children removed since it's
  // noindex'd; surfacing it in the sitemap would only create
  // signal/noise for crawlers):
  //   1.0   homepage
  //   0.7   foundational marketing pages (about, how-it-works)
  //   0.6   /faq — content stable, lower change cadence
  //   0.5   secondary content (contact, help, for-charities,
  //         transparency)
  //   0.4   /stories — kept low until the publishing feature lands
  // /signin removed: no SEO value, only adds noise to the index.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
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

  return [...staticPages, ...legalPages];
}
