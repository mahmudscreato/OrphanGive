import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("refund");
  return buildPageMetadata({
    path: "/refund",
    title: page?.title ?? "Refund policy",
    description:
      page?.meta_description ??
      "When and how donations can be refunded. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  });
}

export default async function RefundPage() {
  const page = await getSitePage("refund");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "Refund policy",
        description:
          "We process refunds for queued sponsorships before activation and on a case-by-case basis after. Reach out to hello@orphangive.org if you need a refund — the full written policy will be published with our legal review.",
      }}
    />
  );
}
