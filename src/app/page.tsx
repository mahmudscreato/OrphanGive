import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { TrustBar } from "@/components/home/TrustBar";
import { StatsBand } from "@/components/home/StatsBand";
import { HowItWorks } from "@/components/home/HowItWorks";
import { FeaturedChildren } from "@/components/home/FeaturedChildren";
import { AboutSection } from "@/components/home/AboutSection";
import { ClosingCTA } from "@/components/home/ClosingCTA";
import {
  getFeaturedChildren,
  getHomepageStats,
} from "@/lib/homepage-data";

export const dynamic = "force-dynamic";

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
      "Monthly child sponsorship with verified profiles, guardian consent, and transparent field reports. Operated by Goodverse Foundation in partnership with Children's Heaven Trust (Reg. iv-98/2021).",
    url: "/",
    type: "website",
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
      "Verified child sponsorship in Bangladesh — operated by Goodverse Foundation in partnership with Children's Heaven Trust.",
    parentOrganization: {
      "@type": "NGO",
      name: "Goodverse Foundation",
      url: "https://www.goodverse.org",
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
      <AboutSection />
      <ClosingCTA />
    </>
  );
}
