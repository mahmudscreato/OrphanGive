// Session 21 — page-metadata helper.
//
// Centralises the per-page Metadata object that Next.js consumes
// from each `page.tsx`. Without this helper, every public page
// would have to redeclare the same boilerplate for `openGraph`
// and `twitter` blocks just to satisfy the spec's "explicit
// per-page metadata" requirement.
//
// Layout defaults (in `src/app/layout.tsx`) cover the homepage and
// any page that doesn't export its own `metadata` — title template,
// site name, default OG image, etc. The helper below extends those
// defaults with page-specific title/description, and ensures the
// canonical URL + image set are present on every page so social
// previews resolve cleanly regardless of which page gets shared.

import type { Metadata } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

// Default OG image — the closing-CTA photo from the homepage.
// Matches the asset specified in the Session 21 brief. Cloudinary
// serves the asset at this version permanently; later versions
// (e.g. v1778529921 from Session 16) supersede the canonical
// reference but the version-pinned URL keeps social cards stable.
const DEFAULT_OG_IMAGE =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V2_25_khxro8.png";

const DEFAULT_OG_IMAGE_ALT =
  "OrphanGive — sponsor a verified child in Bangladesh";

type BuildArgs = {
  /** Page path including leading slash (e.g. "/about", "/children/abc"). */
  path: string;
  /** Title shown in the browser tab and search results.
   * The layout's title template (`%s · OrphanGive`) wraps this. */
  title: string;
  /** Description used by search engines + social cards. */
  description: string;
  /** Optional OG image override (e.g. a child profile thumbnail).
   * Falls back to `DEFAULT_OG_IMAGE`. */
  imageUrl?: string;
  /** Optional OG image alt text. */
  imageAlt?: string;
};

/**
 * Build a fully-populated Next.js `Metadata` object for a page.
 *
 * Returns title + description + openGraph (title/description/url/
 * images/type/siteName/locale) + twitter (card/title/description/
 * images). The result is the union of layout defaults and per-page
 * specifics — you can drop the return value straight into
 * `export const metadata = buildPageMetadata({ ... })`.
 */
export function buildPageMetadata({
  path,
  title,
  description,
  imageUrl,
  imageAlt,
}: BuildArgs): Metadata {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const image = imageUrl ?? DEFAULT_OG_IMAGE;
  const alt = imageAlt ?? DEFAULT_OG_IMAGE_ALT;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      siteName: "OrphanGive",
      locale: "en_US",
      url,
      title,
      description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
