import { Hero } from "@/components/home/Hero";
import { StatsBand } from "@/components/home/StatsBand";
import { Promise as PromiseSection } from "@/components/home/Promise";
import { HowItWorks } from "@/components/home/HowItWorks";
import { FeaturedChildren } from "@/components/home/FeaturedChildren";
import { StorySpread } from "@/components/home/StorySpread";
import { FaithSection } from "@/components/home/FaithSection";
import { CharitiesBand } from "@/components/home/CharitiesBand";
import { ClosingCTA } from "@/components/home/ClosingCTA";
import {
  getFeaturedChildren,
  getHomepageStats,
} from "@/lib/homepage-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, featured] = await Promise.all([
    getHomepageStats(),
    getFeaturedChildren(),
  ]);

  return (
    <>
      <Hero listedCount={stats.listed} />
      <StatsBand stats={stats} />
      <PromiseSection />
      <HowItWorks />
      <FeaturedChildren children={featured} totalListed={stats.listed} />
      <StorySpread />
      <FaithSection />
      <CharitiesBand />
      <ClosingCTA />
    </>
  );
}
