import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("for-charities");
  return {
    title: page?.title
      ? `${page.title} — OrphanGive`
      : "For charities — OrphanGive",
    description:
      page?.meta_description ??
      "OrphanGive provides child profile management, donor administration, payment processing, and transparent reporting for charities operating in Bangladesh.",
  };
}

export default async function ForCharitiesPage() {
  const page = await getSitePage("for-charities");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "For charities",
        description:
          "OrphanGive provides the platform — child profiles, donor administration, payment processing, transparent reporting. Currently operated by Children's Heaven Trust. Partnership inquiries welcome.",
      }}
    />
  );
}
