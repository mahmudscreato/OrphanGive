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
  // Manual "content was meaningfully revised at this time" field
  // (Session 15b2 batch 3). Surfaced on legal pages as
  // "Last updated: May 2026" — donors expect that signal on
  // privacy / terms / refund / cookies / safeguarding. Optional:
  // when null (or when the field doesn't exist on the row yet),
  // the renderer omits the footer line entirely. Mahmud adds the
  // field to the site_page collection in Directus admin; until
  // then this property is undefined from the API response, which
  // TypeScript treats as `null` via the read-side coalesce below.
  last_updated: string | null;
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
          "last_updated",
        ],
        limit: 1,
      } as never),
    )) as unknown as Array<Partial<SitePage> & { id: string; slug: string }>;
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    // Normalize: requesting a field that doesn't exist on the
    // collection (e.g. last_updated before Mahmud adds it in
    // Directus admin) sometimes returns undefined rather than
    // null. Coalesce to null so consumers can use a single guard.
    return {
      id: row.id,
      slug: row.slug,
      title: row.title ?? "",
      content: row.content ?? null,
      meta_description: row.meta_description ?? null,
      status: row.status ?? "draft",
      published_at: row.published_at ?? null,
      last_updated: row.last_updated ?? null,
    };
  } catch (err) {
    console.warn(
      `[site-page] getSitePage(${slug}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
