import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getChildById, getViewerTier } from "@/lib/child-profile-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { readCart } from "@/lib/cart-data";
import { SponsorPageContent } from "./sponsor-page-content";

export const dynamic = "force-dynamic";

export default async function SponsorPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;

  // Use admin tier for the fetch — sponsor page only displays public-safe
  // fields, but we want full reliability regardless of viewer role.
  const child = await getChildById(childId, "admin");
  if (!child) notFound();

  const { tier } = await getViewerTier();
  const donor = tier === "donor" || tier === "admin" ? await getCurrentDonor() : null;
  const donorState = donor ? getDonorState(donor) : "unauthenticated";

  const cart = await readCart();
  const cartItemCount = cart?.items.length ?? 0;

  return (
    <main className="bg-cream">
      <div className="px-6 pt-32 max-md:pt-28">
        <div className="max-w-[1100px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { href: "/children", label: "Browse children" },
              { href: `/children/${child.id}`, label: child.display_name },
              { label: "Sponsor" },
            ]}
          />
        </div>
      </div>
      <SponsorPageContent
        child={{
          id: child.id,
          display_name: child.display_name,
          age: child.age,
          district: child.district,
          photo: child.photo,
          story: child.story,
          story_truncated: child.story_truncated,
        }}
        signedIn={Boolean(donor)}
        donorState={donorState}
        initialCartItemCount={cartItemCount}
      />
    </main>
  );
}
