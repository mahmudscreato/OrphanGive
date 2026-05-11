import { Hero } from "@/components/home/Hero";
import { TrustBar } from "@/components/home/TrustBar";
import { Promise as PromiseSection } from "@/components/home/Promise";
import { HowItWorks } from "@/components/home/HowItWorks";
import { FeaturedChildren } from "@/components/home/FeaturedChildren";
import { DignityPromise } from "@/components/home/DignityPromise";
import { AboutSection } from "@/components/home/AboutSection";
import { ClosingCTA } from "@/components/home/ClosingCTA";
import {
  getFeaturedChildren,
  getHomepageStats,
} from "@/lib/homepage-data";

export const dynamic = "force-dynamic";

// Session 16 FIX 4 — FaithSection (Zakat & Sadaqah quote) and
// CharitiesBand (dark For Charities CTA) removed from the
// homepage. Both component files stay on disk for potential
// reuse elsewhere; they're just no longer surfaced here.
//
// Session 16 REDO — StatsBand and StorySpread also previously
// removed for the same reason.
//
// Final homepage flow:
//   Hero → TrustBar → Promise → HowItWorks → FeaturedChildren → ClosingCTA
export default async function Home() {
  const [stats, featured] = await Promise.all([
    getHomepageStats(),
    getFeaturedChildren(),
  ]);

  return (
    <>
      <Hero listedCount={stats.listed} />
      <TrustBar />
      <PromiseSection />
      <HowItWorks />
      <FeaturedChildren children={featured} totalListed={stats.listed} />
      <DignityPromise />
      <AboutSection />
      <ClosingCTA />
    </>
  );
}
