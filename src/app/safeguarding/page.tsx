import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("safeguarding");
  return {
    title: page?.title ? `${page.title} — OrphanGive` : "Safeguarding — OrphanGive",
    description:
      page?.meta_description ??
      "How we protect the children represented on OrphanGive. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  };
}

export default async function SafeguardingPage() {
  const page = await getSitePage("safeguarding");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "Safeguarding",
        description:
          "Protecting the children represented on OrphanGive is non-negotiable. Reveal of personal details is gated by donor approval and 90-day expiry. Concerns? Email hello@orphangive.org — the full safeguarding policy will be published shortly.",
      }}
    />
  );
}
