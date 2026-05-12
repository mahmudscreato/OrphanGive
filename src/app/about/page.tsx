import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("about");
  return buildPageMetadata({
    path: "/about",
    title: page?.title ?? "About OrphanGive",
    description:
      page?.meta_description ??
      "OrphanGive connects donors to orphan children in Bangladesh, operated by Children's Heaven Trust.",
  });
}

export default async function AboutPage() {
  const page = await getSitePage("about");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "About OrphanGive",
        description:
          "OrphanGive connects donors directly to orphan children in Bangladesh. Operated by Children's Heaven Trust, a registered charity, with transparent stewardship and a faith-conscious approach.",
      }}
    />
  );
}
