import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { StorySection } from "@/components/profile/StorySection";
import { MomentsGallery } from "@/components/profile/MomentsGallery";
import { LockedFieldsBand } from "@/components/profile/LockedFieldsBand";
import { DocumentsBanner } from "@/components/profile/DocumentsBanner";
import { UpdatesSection } from "@/components/profile/UpdatesSection";
import { EducationSection } from "@/components/profile/EducationSection";
import { SponsorCTA } from "@/components/profile/SponsorCTA";
import { RelatedChildren } from "@/components/profile/RelatedChildren";
import { ChildSponsorBanner } from "@/components/children/ChildSponsorBanner";
import {
  getChildById,
  getChildDocumentsStatus,
  getChildMoments,
  getChildUpdates,
  getViewerTier,
} from "@/lib/child-profile-data";
import { getRandomActiveChildren } from "@/lib/children-data";
import { getCurrentDonor, getDonorState } from "@/lib/donor-data";
import { getQueueDisplayForChild } from "@/lib/queue";
import {
  ALLOWED_REVEAL_FIELDS,
  fetchRevealedFieldValues,
  getActiveReveals,
  getDonorRevealsForChild,
  type AllowedRevealField,
} from "@/lib/reveal-data";

export const dynamic = "force-dynamic";

// Privacy-preserving metadata. Title surfaces the child's
// donor-facing display name (it's already public on the page);
// description does NOT surface the child's story, district,
// guardian details, or anything else — those live behind the
// reveal-request flow and shouldn't leak into social previews or
// search engine snippets. OG image inherits the site default (no
// child photo in social cards — same privacy concern).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const child = await getChildById(id, "admin");
    const name = child?.display_name?.trim() ?? null;
    return {
      title: name ? `Sponsor ${name}` : "Sponsor a child",
      description:
        "Help a child in Bangladesh through verified sponsorship. Operated by Children's Heaven Trust.",
    };
  } catch {
    return { title: "Sponsor a child" };
  }
}

export default async function ChildProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Resolve viewer tier first; everything else keys off it.
  const { tier } = await getViewerTier();

  // Fetch in parallel — all server-side via the admin token client.
  // Queue display (Sessions 14.6 + 14.7) drives the public banner
  // between hero and story. queueDisplay.active === null when the
  // child has no current monthly sponsor — banner is omitted in
  // that case.
  const [child, docs, updates, moments, related, queueDisplay] =
    await Promise.all([
      getChildById(id, tier),
      getChildDocumentsStatus(id),
      getChildUpdates(id),
      getChildMoments(id),
      getRandomActiveChildren(id, 4),
      getQueueDisplayForChild(id),
    ]);

  if (!child) notFound();

  // Reveal-aware enrichment for approved donors. Public/admin/pending donors
  // skip this entirely — admin already has child.encrypted, and other tiers
  // never request encrypted values.
  let activeReveals: ReadonlySet<AllowedRevealField> = new Set();
  let revealedValues: Partial<Record<AllowedRevealField, string | null>> = {};
  let revealedApprovedAt: Partial<Record<AllowedRevealField, string | null>> = {};

  if (tier === "donor") {
    const donor = await getCurrentDonor();
    if (donor && getDonorState(donor) === "approved") {
      activeReveals = await getActiveReveals(donor.id, child.id);
      if (activeReveals.size > 0) {
        const fieldList: AllowedRevealField[] = [];
        for (const f of activeReveals) fieldList.push(f);
        // For compound categories (guardian: name+contact), if either is
        // approved, fetch both — keeps the UX consistent.
        if (
          fieldList.includes("guardian_full_name_encrypted") ||
          fieldList.includes("guardian_contact_encrypted")
        ) {
          if (!fieldList.includes("guardian_full_name_encrypted"))
            fieldList.push("guardian_full_name_encrypted");
          if (!fieldList.includes("guardian_contact_encrypted"))
            fieldList.push("guardian_contact_encrypted");
        }
        const valuesMap = await fetchRevealedFieldValues(child.id, fieldList);
        for (const [k, v] of valuesMap) revealedValues[k] = v;

        // Look up approved_at timestamps for the approved + unexpired
        // requests. One lightweight query against reveal_request.
        const allReveals = await getDonorRevealsForChild(donor.id, child.id);
        for (const r of allReveals) {
          if (r.status === "approved" && r.field_name && r.decided_at) {
            const fn = r.field_name as AllowedRevealField;
            if ((ALLOWED_REVEAL_FIELDS as readonly string[]).includes(fn)) {
              revealedApprovedAt[fn] = r.decided_at;
            }
          }
        }
      }
    }
  }

  return (
    <>
      <div className="px-6 pt-32 bg-cream max-md:pt-28">
        <div className="max-w-[1320px] mx-auto">
          <Breadcrumb
            crumbs={[
              { href: "/", label: "Home" },
              { href: "/children", label: "Browse children" },
              { label: child.display_name },
            ]}
          />
        </div>
      </div>
      <ProfileHero child={child} tier={tier} />
      {queueDisplay.active ? (
        <section className="px-6 pt-8 pb-2 bg-cream max-md:pt-6">
          <div className="max-w-[760px] mx-auto">
            <ChildSponsorBanner
              childFirstName={child.display_name.split(" ")[0]}
              active={queueDisplay.active}
              queued={queueDisplay.queued}
              isFull={queueDisplay.isFull}
            />
          </div>
        </section>
      ) : null}
      <StorySection child={child} tier={tier} />
      <MomentsGallery childName={child.display_name} moments={moments} />
      <LockedFieldsBand
        child={child}
        tier={tier}
        activeReveals={activeReveals}
        revealedValues={revealedValues}
        revealedApprovedAt={revealedApprovedAt}
      />
      <DocumentsBanner docs={docs} />
      <UpdatesSection childName={child.display_name} updates={updates} />
      <EducationSection child={child} />
      <SponsorCTA child={child} tier={tier} />
      <RelatedChildren items={related} />
    </>
  );
}
