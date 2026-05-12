import { getSitePage } from "@/lib/site-page";
import { SitePageRenderer } from "@/components/site-page/SitePageRenderer";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const page = await getSitePage("terms");
  return buildPageMetadata({
    path: "/terms",
    title: page?.title ?? "Terms of use",
    description:
      page?.meta_description ??
      "The rules and expectations governing your use of OrphanGive. Operated by Children's Heaven Trust (Reg. iv-98/2021), Bangladesh.",
  });
}

export default async function TermsPage() {
  const page = await getSitePage("terms");
  return (
    <SitePageRenderer
      page={page}
      fallback={{
        title: "Terms of use",
        description:
          "We're finalising our terms of use with counsel. By using OrphanGive you agree to act in good faith, respect the children's privacy, and abide by Bangladesh law. The full terms will be published shortly.",
      }}
    />
  );
}
