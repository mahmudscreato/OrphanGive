import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("privacy");
  return buildPageMetadata({
    path: "/privacy",
    title: page?.title ?? "Privacy policy",
    description:
      page?.meta_description ??
      "How OrphanGive collects, uses, and protects your personal information. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  });
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
