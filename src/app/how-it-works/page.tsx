import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("how-it-works");
  return {
    title: page?.title
      ? `${page.title} — OrphanGive`
      : "How it works — OrphanGive",
    description:
      page?.meta_description ??
      "How sponsorship works on OrphanGive — from browsing children to your first welcome update.",
  };
}

export default async function HowItWorksPage() {
  const page = await getSitePage("how-it-works");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "How it works",
        description:
          "Browse children awaiting sponsors, choose how you'd like to give (monthly, prepaid, or one-time), and complete checkout. You'll receive a welcome confirmation and ongoing updates from your sponsored child.",
      }}
    />
  );
}
