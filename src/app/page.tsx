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

  return (
    <>
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
