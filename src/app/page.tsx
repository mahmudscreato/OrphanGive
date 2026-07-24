import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { TrustBar } from "@/components/home/TrustBar";
import { StatsBand } from "@/components/home/StatsBand";
import { HowItWorks } from "@/components/home/HowItWorks";
import { FeaturedChildren } from "@/components/home/FeaturedChildren";
import { QuickDonateSection } from "@/components/home/QuickDonateSection";
import { AboutSection } from "@/components/home/AboutSection";
import { ClosingCTA } from "@/components/home/ClosingCTA";
import {
  getFeaturedChildren,
  getHomepageStats,
} from "@/lib/homepage-data";

export const dynamic = "force-dynamic";

// Site-wide 1200×630 share card (JPEG). Same asset the root layout
// and page-metadata helper use. It MUST be declared here because Next
// merges metadata SHALLOWLY: this page's own `openGraph` block REPLACES
// the layout's wholesale, so without an `images` key the homepage emits
// NO og:image — and WhatsApp/Facebook then fall back to scraping the
// first <img> on the page (the nav SVG logo), which they can't render
// as a share card. (Same shallow-merge gotcha documented in
// src/lib/page-metadata.ts and previously fixed for /faq.)
const OG_IMAGE_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/c_fill,w_1200,h_630,f_jpg,q_auto/v1778529921/_OrphanGive_CG_V2_25_khxro8.jpg";

// Lot 4 Job B — explicit homepage metadata. The root layout's
// metadataBase + title.default already cover the basics, but Next 16
// merges per-page metadata into the head; an explicit export here
// keeps the homepage's title/description/canonical/og overrideable
// without depending on root inheritance.
export const metadata: Metadata = {
  title: "Sponsor a verified orphan in Bangladesh",
  description:
    "Sponsor a verified child in Bangladesh through Children's Heaven Trust. Monthly support, transparent updates, guardian consent on every profile.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "OrphanGive — Sponsor a verified orphan in Bangladesh",
    description:
      "Monthly child sponsorship with verified profiles, guardian consent, and transparent field reports. Operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021).",
    url: "/",
    type: "website",
    // og:image (+ explicit dimensions/type) so scrapers don't fall back
    // to the nav SVG. JPEG — the most universally-rendered share format.
    images: [
      {
        url: OG_IMAGE_URL,
        secureUrl: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "OrphanGive",
      },
    ],
  },
  // Explicit twitter block (correctly named twitter:* tags — NOT
  // og:temporal:twitter:*). Without one, the homepage would lean on
  // layout inheritance; declaring it here keeps the most-shared URL
  // self-contained and guarantees a large-image card with the JPEG.
  twitter: {
    card: "summary_large_image",
    title: "OrphanGive — Sponsor a verified orphan in Bangladesh",
    description:
      "Monthly child sponsorship with verified profiles, guardian consent, and transparent field reports. Operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021).",
    images: [OG_IMAGE_URL],
  },
};

// Part 5.6 C.2 — Live Data moved BEFORE How It Works. Narrative:
// hero (why) → trust strip (pillars) → live data (scale of need
// + what we're doing) → how it works (process) → meet children
// (who) → about (us) → closing CTA.
//
// Final homepage flow:
//   Hero → TrustBar → StatsBand → HowItWorks → FeaturedChildren
//   → AboutSection → ClosingCTA
export default async function Home() {
  const [stats, featured] = await Promise.all([
    getHomepageStats(),
    getFeaturedChildren(),
  ]);

  // Lot 4 Job B — Schema.org NGO JSON-LD. Renders inline so social
  // and search crawlers can pick up the operator + partner attribution
  // (Goodverse Foundation operating in partnership with Children's
  // Heaven Trust, Reg. iv-98/2021) without depending on the footer
  // text alone. Tier-1 facts only — no donor data, no child data.
  const ngoJsonLd = {
    "@context": "https://schema.org",
    "@type": "NGO",
    name: "OrphanGive",
    url: "https://orphangive.org",
    logo: "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_F_SVG_x0frxm.svg",
    description:
      "Verified child sponsorship in Bangladesh — operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021).",
    parentOrganization: {
      "@type": "NGO",
      name: "Goodverse Foundation",
      url: "https://www.goodverse.org",
      identifier: "Reg. S-14837/2026",
    },
    memberOf: {
      "@type": "NGO",
      name: "Children's Heaven Trust",
      url: "https://childrensheaventrust.org/",
      identifier: "Reg. iv-98/2021",
    },
    areaServed: {
      "@type": "Country",
      name: "Bangladesh",
    },
    sameAs: [
      "https://www.goodverse.org",
      "https://childrensheaventrust.org/",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ngoJsonLd) }}
      />
      <Hero listedCount={stats.listed} />
      <TrustBar />
      <StatsBand stats={stats} />
      <HowItWorks />
      <FeaturedChildren children={featured} totalListed={stats.listed} />
      <QuickDonateSection />
      <AboutSection />
      <ClosingCTA />
    </>
  );
}
