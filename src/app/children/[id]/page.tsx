import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { buildPageMetadata } from "@/lib/page-metadata";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { StorySection } from "@/components/profile/StorySection";
import { MomentsGallery } from "@/components/profile/MomentsGallery";
import { LockedFieldsBand } from "@/components/profile/LockedFieldsBand";
import { DocumentsBanner } from "@/components/profile/DocumentsBanner";
import { UpdatesSection } from "@/components/profile/UpdatesSection";
import { EducationSection } from "@/components/profile/EducationSection";
import { StoryTeaser } from "@/components/profile/StoryTeaser";
import { SponsorCTA } from "@/components/profile/SponsorCTA";
import { RelatedChildren } from "@/components/profile/RelatedChildren";
import { ChildSponsorBanner } from "@/components/children/ChildSponsorBanner";
// Session 52b — donor-facing intake photo gallery, placed between
// hero and story. Renders only when there are approved photos.
import { IntakePhotoGallery } from "@/components/profile/IntakePhotoGallery";
import {
  getApprovedIntakePhotosForChild,
  isSponsorOfChild,
} from "@/lib/donor-intake-photos";
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

// ─── PRIVACY RULE — "show only what's reviewed" (Session 49) ────────
//
// Donor-facing rendering rule for any DI-collectable content that
// goes through admin review: render ONLY rows whose status indicates
// admin approval. Pending/rejected/archived rows are invisible to
// donors. Missing approved content does NOT blank out other sections —
// render whatever IS approved and let the rest absent itself silently.
//
// Current implementations of this rule (audited in
// docs/session-49-donor-surface-audit.md):
//
//   ┌─────────────────────┬─────────────────────────┬──────────────────────┐
//   │ Surface             │ Status filter            │ Where                │
//   ├─────────────────────┼─────────────────────────┼──────────────────────┤
//   │ child_moment        │ status='published'       │ getChildMoments      │
//   │ child_update        │ status='published'       │ getChildUpdates      │
//   │ child_document      │ status='approved' (NEW)  │ getChildDocumentsStatus
//   │                     │ OR 'verified' (LEGACY).  │ → DocumentsBanner    │
//   │                     │ Session 50 reconciled    │                      │
//   │                     │ via document-normalize.ts│                      │
//   │ child_intake_photo  │ NOT YET RENDERED         │ —                    │
//   │ child (status)      │ status='active'          │ getChildById         │
//   └─────────────────────┴─────────────────────────┴──────────────────────┘
//
// Reference URLs Mahmud flagged for "what currently renders":
//   - /children/f6c4c677-46d0-4fd7-b08e-3ba6216245b6
//   - /children/da9a8c24-38d1-40fa-95f3-20edc878f1ff
//
// Documents per se (the file blobs) NEVER render on this page,
// regardless of review status — they're Tier 3 admin-only evidence,
// not donor content. The DocumentsBanner shows ONLY the verification
// status pills ("Birth certificate verified") to give donors
// confidence the profile was reviewed; the file is never linked.

// Privacy-preserving metadata. Title surfaces the child's
// donor-facing display name (it's already public on the page);
// description does NOT surface the child's story, district,
// guardian details, or anything else — those live behind the
// reveal-request flow and shouldn't leak into social previews or
// search engine snippets. OG image stays on the site default
// (no child photo in social cards — same privacy concern).
//
// Session 21 — full Metadata block (openGraph + twitter + canonical
// URL) via the shared `buildPageMetadata` helper, so social-share
// cards render with the right URL and image.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let name: string | null = null;
  try {
    // P1.3 — fetch at the PUBLIC tier so the returned display_name
    // is sourced from `first_name` only. The OG/twitter title is
    // a public surface — the metadata read should match the
    // privacy class of where it lands. (Previously fetched at
    // "admin" tier, which would have surfaced the internal
    // display_name once it diverged from first_name.)
    const child = await getChildById(id, "public");
    name = child?.display_name?.trim() ?? null;
  } catch {
    // Fall through to the generic metadata below.
  }

  const title = name
    ? `${name} — Sponsor a verified child`
    : "Sponsor a verified child";
  const description = name
    ? `Help ${name} in Bangladesh through monthly sponsorship. Profile verified by Children's Heaven Trust — name and photo published only with the guardian's consent.`
    : "Help a verified child in Bangladesh through monthly sponsorship. All profiles reviewed by Children's Heaven Trust before publication.";

  // P1.1 — child profile pages noindex'd (mirrors Lot 4's pattern on
  // admin/di/dashboard surfaces). See src/app/children/page.tsx for
  // the full rationale. Real-named child profiles must NEVER reach a
  // search-engine index. robots.ts + sitemap.ts also enforce.
  return {
    ...buildPageMetadata({
      path: `/children/${id}`,
      title,
      description,
    }),
    robots: { index: false, follow: false },
  };
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
  const [child, docs, updates, moments, related, queueDisplay, intakePhotos] =
    await Promise.all([
      getChildById(id, tier),
      getChildDocumentsStatus(id),
      getChildUpdates(id),
      getChildMoments(id),
      getRandomActiveChildren(id, 4),
      getQueueDisplayForChild(id),
      // Session 52b — approved intake photos. Empty array if none
      // are approved yet; gallery component renders null in that
      // case so an empty profile doesn't show a placeholder section.
      getApprovedIntakePhotosForChild(id),
    ]);

  if (!child) notFound();

  // Session 52b — sponsor-of-this-child check for the intake gallery
  // blur-overlay decision. Public viewers always see the blurred
  // form (no donor cookie). Authenticated donors without an active
  // sponsorship of THIS child also see blurred (encourages them to
  // sponsor THIS specific child rather than tunnel through profiles).
  // Admin tier bypasses entirely — they already see everything via
  // the admin surface.
  let isSponsor = false;
  if (tier === "admin") {
    isSponsor = true;
  } else if (tier === "donor") {
    const donorForSponsorCheck = await getCurrentDonor();
    isSponsor = await isSponsorOfChild(donorForSponsorCheck?.id ?? null, child.id);
  }

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
      <div className="px-6 pt-10 bg-cream max-md:pt-6">
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
      {/* Session 52b — Intake photo gallery, between hero/banner and
          story. Renders only when there are approved intake photos.
          Blur-overlay for non-sponsors handled inside the component. */}
      <IntakePhotoGallery
        childDisplayName={child.display_name}
        childId={child.id}
        photos={intakePhotos}
        isSponsor={isSponsor}
        isAuthenticated={tier !== "public"}
      />
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
      {/* Story teaser — "follow along" invitation. Wired to the
          existing tier signal + isSponsor check. Carries NO real
          gated data: public viewers see only the generic invitation
          + the first name. See StoryTeaser.tsx privacy posture. */}
      <StoryTeaser
        childId={child.id}
        childFirstName={child.display_name.split(" ")[0]!}
        tier={tier}
        isSponsor={isSponsor}
      />
      <SponsorCTA child={child} tier={tier} />
      <RelatedChildren items={related} />
    </>
  );
}
