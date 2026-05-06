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
import {
  getChildById,
  getChildDocumentsStatus,
  getChildMoments,
  getChildUpdates,
  getViewerTier,
} from "@/lib/child-profile-data";
import { getRandomActiveChildren } from "@/lib/children-data";

export const dynamic = "force-dynamic";

export default async function ChildProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Resolve viewer tier first; everything else keys off it.
  const { tier } = await getViewerTier();

  // Fetch in parallel — all server-side via the admin token client.
  const [child, docs, updates, moments, related] = await Promise.all([
    getChildById(id, tier),
    getChildDocumentsStatus(id),
    getChildUpdates(id),
    getChildMoments(id),
    getRandomActiveChildren(id, 4),
  ]);

  if (!child) notFound();

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
      <StorySection child={child} tier={tier} />
      <MomentsGallery childName={child.display_name} moments={moments} />
      <LockedFieldsBand child={child} tier={tier} />
      <DocumentsBanner docs={docs} />
      <UpdatesSection childName={child.display_name} updates={updates} />
      <EducationSection child={child} />
      <SponsorCTA child={child} tier={tier} />
      <RelatedChildren items={related} />
    </>
  );
}
