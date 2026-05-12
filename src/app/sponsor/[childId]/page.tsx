import { notFound, redirect } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getChildById } from "@/lib/child-profile-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { readCart } from "@/lib/cart-data";
import { getActiveMonthlySponsorForChild } from "@/lib/sponsorship-data";
import {
  computeNextQueueSlot,
  getQueueForChild,
  QUEUE_DEPTH_LIMIT,
} from "@/lib/queue";
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

  // Session 14.6 + 14.7: child-lock branches. Three exclusive UI
  // states relative to the viewing donor:
  //
  //   selfActiveMonthly  — viewing donor IS the active monthly
  //                        sponsor. Friendly informational banner
  //                        with a link to /dashboard/sponsorship/[id].
  //                        Monthly tile enabled; same-donor exemption.
  //   queueJoin          — child has an active monthly sponsor (a
  //                        different donor) AND queue isn't full.
  //                        Monthly tile is enabled but renders
  //                        "Get in line" copy; queueJoin carries
  //                        position + estimated start date.
  //   monthlyLocked      — child has an active monthly sponsor AND
  //                        the queue is FULL (3 queued already).
  //                        Monthly tile disabled with "Queue is full
  //                        through [date]" copy.
  //
  // /api/checkout/init re-evaluates the queue depth at init time as
  // the race-condition guard (sponsor flow can render stale slot
  // info if the page was open while another donor checked out).
  const activeMonthly = await getActiveMonthlySponsorForChild(child.id);
  const isOwnActiveMonthly = Boolean(
    activeMonthly && activeMonthly.donorId === donor.id,
  );

  let monthlyLocked = false;
  let queueJoin: {
    position: number;
    estimatedStartsAt: string | null;
    activeEndDate: string | null;
    donorsAhead: number;
  } | null = null;
  let queueFullThrough: string | null = null;
  const selfActiveMonthly =
    isOwnActiveMonthly && activeMonthly
      ? {
          sponsorshipId: activeMonthly.sponsorshipId,
          scheduledEndDate: activeMonthly.scheduledEndDate,
        }
      : null;

  if (activeMonthly && !isOwnActiveMonthly) {
    const slot = await computeNextQueueSlot(child.id);
    if (slot.position > QUEUE_DEPTH_LIMIT) {
      // Queue full — render the locked state with the final queued
      // donor's end date as the "come back after" target.
      const { queued } = await getQueueForChild(child.id);
      const last = queued[queued.length - 1];
      queueFullThrough = last?.queued_ends_at ?? null;
      monthlyLocked = true;
    } else {
      // Queue join is available. donorsAhead = position - 1
      // (donors already in the queue PLUS the current active sponsor
      // ahead of you). For donor-facing copy we count "ahead of you"
      // inclusive of the active sponsor: position 1 → 1 donor ahead.
      queueJoin = {
        position: slot.position,
        estimatedStartsAt: slot.startsAt
          ? slot.startsAt.toISOString()
          : null,
        activeEndDate: slot.activeEndDate
          ? slot.activeEndDate.toISOString()
          : null,
        donorsAhead: slot.position,
      };
    }
  }

  return (
    <div className="bg-cream">
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
        queueJoin={queueJoin}
        queueFullThrough={queueFullThrough}
      />
    </div>
  );
}
