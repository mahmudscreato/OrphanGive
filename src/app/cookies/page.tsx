import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("cookies");
  return buildPageMetadata({
    path: "/cookies",
    title: page?.title ?? "Cookie policy",
    description:
      page?.meta_description ??
      "How OrphanGive uses cookies and similar technologies. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  });
}

export default async function CookiesPage() {
  const page = await getSitePage("cookies");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "Cookie policy",
        description:
          "We use only the cookies necessary to keep you signed in and process your donation. No third-party advertising cookies. The full policy will be published with our legal review.",
      }}
    />
  );
}
