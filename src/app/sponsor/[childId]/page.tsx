import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getChildById } from "@/lib/child-profile-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { readCart } from "@/lib/cart-data";
import { getActiveMonthlySponsorForChild } from "@/lib/sponsorship-data";
import { SponsorPageContent } from "./sponsor-page-content";

export const dynamic = "force-dynamic";

export default async function SponsorPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;

  // Charity-trust pattern: sponsoring requires a signed-in donor from
  // the very first step. Anonymous visitors browsing /children/[id]
  // who click "Sponsor a Child" land on /signin with this URL queued
  // as `next=`, so they return here after authenticating.
  const donor = await getCurrentDonor();
  if (!donor) {
    redirect(`/signin?next=/sponsor/${encodeURIComponent(childId)}`);
  }

  // Use admin tier for the fetch — sponsor page only displays public-safe
  // fields, but we want full reliability regardless of viewer role.
  const child = await getChildById(childId, "admin");
  if (!child) notFound();

  const donorState = getDonorState(donor);

  const cart = await readCart();
  const cartItemCount = cart?.items.length ?? 0;

  // Session 14.6: child-lock — at most one active monthly sponsor per
  // child. The flag is true unless the locked sponsor IS the current
  // donor (in which case they're the holder). Re-checked at
  // /api/checkout/init too as the race-condition guard.
  //
  // Same-donor exemption: when the active sponsor IS the viewing
  // donor, monthlyLocked is false AND we surface a friendly note on
  // the sponsor page that links them to /dashboard/sponsorship/[id]
  // for managing the existing commitment, while still allowing them
  // to add a one-time gift below.
  const activeMonthly = await getActiveMonthlySponsorForChild(child.id);
  const isOwnActiveMonthly = Boolean(
    activeMonthly && activeMonthly.donorId === donor.id,
  );
  const monthlyLocked = Boolean(activeMonthly) && !isOwnActiveMonthly;
  const selfActiveMonthly =
    isOwnActiveMonthly && activeMonthly
      ? {
          sponsorshipId: activeMonthly.sponsorshipId,
          scheduledEndDate: activeMonthly.scheduledEndDate,
        }
      : null;

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
        monthlyLocked={monthlyLocked}
        donorFirstName={donor.first_name ?? null}
        selfActiveMonthly={selfActiveMonthly}
      />
    </main>
  );
}
