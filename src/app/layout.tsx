import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Fraunces,
  Inter,
  JetBrains_Mono,
  Roboto,
} from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Analytics } from "@/components/analytics/Analytics";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { getCurrentDonor } from "@/lib/donor-data";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Session 16 — Caveat for hand-drawn script callouts. Used
// sparingly: founder-style annotations near photos, handwritten
// list numerals on "How it works", a heart-doodle byline on the
// story callout. Loaded with display:swap so the page never
// blocks on the font fetch.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Session 16 Part 5.10 Fix B — Roboto Black for the Live Data
// big numbers. Heavyweight geometric sans-serif —
// institutional / financial-report / infographic feel — replaces
// the Part 5.9 Cormorant Garamond which was a misread of
// "formal" as "formal serif". Loaded only at weight 900 to keep
// the font payload small.
//
// `--font-roboto-src` is the raw next/font CSS variable.
// `globals.css` aliases this to the `--font-roboto` Tailwind
// theme token (utility: `font-roboto`) — separate names avoid
// a circular `var()` reference inside `@theme inline`.
const roboto = Roboto({
  variable: "--font-roboto-src",
  subsets: ["latin"],
  weight: ["900"],
  display: "swap",
});

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

// Site-wide social-share image (default for every route that doesn't
// ship a per-segment override). Replaces the Session 64 file-convention
// `src/app/opengraph-image.tsx` route — that file was DELETED in this
// commit because Next 16 MERGES file-convention images with metadata-
// declared images (rather than letting metadata override). Keeping the
// file would have left two og:image tags in the head: the auto-injected
// dynamic ImageResponse plus the Cloudinary URL below. WhatsApp /
// iMessage scrapers tend to pick the first og:image they see — which
// would have been the file-convention one — defeating this fix.
//
// Image shape:
//   • Cloudinary asset Mahmud uploaded for share previews.
//   • `c_fill,w_1200,h_630` — standard OG ratio + dimensions.
//   • `f_jpg` — force a static raster format. f_auto was previously
//     in use, which let Cloudinary serve WebP/AVIF based on the
//     scraper's Accept header. WhatsApp / iMessage often won't
//     render WebP/AVIF, leaving the placeholder; jpg is the most
//     universally-rendered format and verified image/jpeg above.
//   • `q_auto` — Cloudinary's content-aware compression.
// Content-Type verified image/jpeg (80 KB). The `.jpg` extension on
// the URL also matches the served Content-Type, so extension-vs-
// Content-Type cross-checking by strict scrapers is safe.
const OG_IMAGE_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/c_fill,w_1200,h_630,f_jpg,q_auto/v1778529921/_OrphanGive_CG_V2_25_khxro8.jpg";
const OG_IMAGE_ALT = "OrphanGive — Sponsor an orphan in Bangladesh";
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const OG_IMAGE_TYPE = "image/jpeg";

const DEFAULT_DESCRIPTION =
  "Sponsor a vulnerable or orphaned child in Bangladesh through verified profiles. Operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021).";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OrphanGive — Sponsor an orphan in Bangladesh",
    // %s receives the page-level title; nested pages override only
    // their own title and inherit the rest of this block.
    template: "%s · OrphanGive",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "OrphanGive",
  authors: [{ name: "Children's Heaven Trust" }],
  openGraph: {
    type: "website",
    siteName: "OrphanGive",
    locale: "en_US",
    url: SITE_URL,
    title: "OrphanGive — Sponsor an orphan in Bangladesh",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_URL,
        secureUrl: OG_IMAGE_URL,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        type: OG_IMAGE_TYPE,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrphanGive — Sponsor an orphan in Bangladesh",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
  robots: {
    // Crawler directives are also broadcast via /robots.txt; the
    // <meta> form is a belt-and-braces fallback for crawlers that
    // don't honour robots.txt on every fetch.
    index: true,
    follow: true,
  },
  // Session 16 FINAL Fix 2b — favicon points at the icon-only SVG
  // hosted on Cloudinary. Modern browsers + iOS home-screen icons
  // both honour the same SVG URL; we don't need separate PNG fall-
  // backs at this stage.
  icons: {
    icon:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_F_SVG_x0frxm.svg",
    apple:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_F_SVG_x0frxm.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FFFAF2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch donor at the top so SiteNav can render auth-aware UI.
  // SiteNav itself decides to skip rendering on /dashboard/* routes.
  const donor = await getCurrentDonor();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} ${caveat.variable} ${roboto.variable} h-full antialiased`}
    >
      <head>
        {/* Session 27 — perf hints. Cloudinary serves logos +
            child photos on every page so a full preconnect (DNS
            + TCP + TLS) earns the cost of the open connection.
            Stripe is only loaded on /checkout, so the cheaper
            dns-prefetch is sufficient — it primes the DNS cache
            without holding a connection open elsewhere.
            crossOrigin on the Cloudinary preconnect matters
            because next/image requests Cloudinary URLs as CORS-
            anonymous fetches; without it browsers won't reuse
            the warm connection. */}
        <link
          rel="preconnect"
          href="https://res.cloudinary.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://api.stripe.com" />
      </head>
      <body
        className="min-h-full flex flex-col bg-cream text-ink"
        suppressHydrationWarning={true}
      >
        {/* Session 28 — skip-to-main-content link. Hidden until
            focused via keyboard tab, then appears at the top-left
            with a high-contrast OG-orange pill. Lets screen-reader
            and keyboard-only users skip past the SiteNav directly
            to the page body. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-5 focus:py-2.5 focus:rounded-full focus:bg-orange-solid focus:text-ink focus:font-body focus:font-semibold focus:text-sm focus:shadow-warm focus:outline-none focus:ring-4 focus:ring-orange-pale"
        >
          Skip to main content
        </a>
        <SiteNav
          signedIn={!!donor}
          firstName={
            donor?.first_name?.trim() ||
            donor?.email?.split("@")[0] ||
            null
          }
        />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <SiteFooter />
        {/* GA4 — loads ONLY after explicit opt-in consent, child-route
            redacted, and never on /admin·/di·/dashboard. No-op without
            NEXT_PUBLIC_GA_ID. See components/analytics/Analytics.tsx. */}
        <Analytics />
        {/* Deny-by-default consent banner. Self-hides on staff/auth surfaces
            and once a choice is recorded. */}
        <ConsentBanner />
      </body>
    </html>
  );
}
