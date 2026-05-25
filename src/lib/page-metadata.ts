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

// Default site-wide social-share image. Mirrored from
// src/app/layout.tsx so every helper-built page emits the same
// og:image / twitter:image as the root layout. Cloudinary URL is
// format-forced to image/jpeg (the most universally-rendered share
// format — WhatsApp / iMessage often won't render WebP/AVIF that
// f_auto would otherwise serve). See the layout's comment for the
// full rationale.
//
// Why not "leave images unset and let the layout fill in":
// Next.js merges metadata SHALLOWLY. When a page exports its own
// openGraph block (even without an images key), the layout's
// openGraph — including its images — is fully replaced. So a
// page-level openGraph without images means NO og:image renders on
// that page. Defensively naming the URL here keeps every helper-
// built page wired correctly regardless.
//
// Callers can pass `imageUrl` to override per-page (useful when a
// future per-child OG flow ships).
const DEFAULT_OG_IMAGE_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/c_fill,w_1200,h_630,f_jpg,q_auto/v1778529921/_OrphanGive_CG_V2_25_khxro8.jpg";
const DEFAULT_OG_IMAGE_ALT = "OrphanGive — Sponsor an orphan in Bangladesh";
const DEFAULT_OG_IMAGE_TYPE = "image/jpeg";

type BuildArgs = {
  /** Page path including leading slash (e.g. "/about", "/children/abc"). */
  path: string;
  /** Title shown in the browser tab and search results.
   * The layout's title template (`%s · OrphanGive`) wraps this. */
  title: string;
  /** Description used by search engines + social cards. */
  description: string;
  /**
   * Optional OG image override (e.g. a per-child generated card).
   * Defaults to /opengraph-image (the root file-convention route).
   */
  imageUrl?: string;
  /** Optional OG image alt text. */
  imageAlt?: string;
};

/**
 * Build a fully-populated Next.js `Metadata` object for a page.
 *
 * Returns title + description + openGraph (title/description/url/
 * type/siteName/locale/images) + twitter (card/title/description/
 * images). Drop the return value straight into
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
  const image = imageUrl ?? DEFAULT_OG_IMAGE_URL;
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
          secureUrl: image,
          width: 1200,
          height: 630,
          type: DEFAULT_OG_IMAGE_TYPE,
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
