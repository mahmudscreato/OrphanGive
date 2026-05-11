import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("privacy");
  return {
    title: page?.title ? `${page.title} — OrphanGive` : "Privacy policy — OrphanGive",
    description:
      page?.meta_description ??
      "How OrphanGive collects, uses, and protects your personal information. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  };
}

export default async function PrivacyPage() {
  const page = await getSitePage("privacy");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "Privacy policy",
        description:
          "We're finalising our privacy policy with counsel. In the meantime, we collect only what's necessary to process your donation and send sponsorship updates. Questions? hello@orphangive.org.",
      }}
    />
  );
}
