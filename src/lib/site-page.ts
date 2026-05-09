// Reads CMS-authored static pages from the Directus `site_page`
// collection. Each public route at /about, /how-it-works,
// /for-charities, /stories, /faq fetches its row by slug and
// renders title + meta + body content. Authoring lives in
// Directus admin so non-engineering folks (Mahmud, future content
// editors) can edit copy without redeploys.
//
// Schema (per discovery, Session 15a):
//   slug              string  unique
//   title             string
//   content           text    (markdown OR HTML — caller decides)
//   meta_description  text    nullable
//   seo_image         uuid    nullable (future: OG image)
//   language          string
//   status            string  ('published' | 'draft' | …)
//   published_at      timestamp
//
// Read-side filter: only return rows where status='published'.
// Drafts stay hidden from the public site.

import { readItems } from "@directus/sdk";
import { directusServer } from "./directus";

export type SitePage = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  status: string;
  published_at: string | null;
};

export async function getSitePage(slug: string): Promise<SitePage | null> {
  if (!slug || typeof slug !== "string") return null;
  try {
    const rows = (await directusServer().request(
      readItems("site_page" as never, {
        filter: {
          _and: [
            { slug: { _eq: slug } },
            { status: { _eq: "published" } },
          ],
        },
        fields: [
          "id",
          "slug",
          "title",
          "content",
          "meta_description",
          "status",
          "published_at",
        ],
        limit: 1,
      } as never),
    )) as unknown as SitePage[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.warn(
      `[site-page] getSitePage(${slug}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
