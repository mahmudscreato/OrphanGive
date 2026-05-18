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
import { SponsorCTA } from "@/components/profile/SponsorCTA";
import { RelatedChildren } from "@/components/profile/RelatedChildren";
import { ChildSponsorBanner } from "@/components/children/ChildSponsorBanner";
// Session 52b — donor-facing intake photo gallery, placed between
// hero and story. Renders only when there are approved photos.
import { IntakePhotoGallery } from "@/components/profile/IntakePhotoGallery";
// Session 57 — two new cards (family-narrative for sponsors,
// health & wellbeing conditional on health data) + a mobile
// sticky CTA that follows the user past the hero. All three are
// pure visual additions — the data they read was already on
// ChildProfile from prior sessions.
import { FamilyNarrativeCard } from "@/components/profile/FamilyNarrativeCard";
import { HealthWellbeingCard } from "@/components/profile/HealthWellbeingCard";
import { StickyMobileSponsorCTA } from "@/components/profile/StickyMobileSponsorCTA";
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
    const child = await getChildById(id, "admin");
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

  return buildPageMetadata({
    path: `/children/${id}`,
    title,
    description,
  });
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

  // Session 57 — section order rewritten to match the redesign
  // brief. Sequence (top → bottom):
  //   1. Breadcrumb (unchanged, top of warm canvas)
  //   2. Hero (rewritten ProfileHero)
  //   3. ChildSponsorBanner (queue display, conditional)
  //   4. Sticky mobile sponsor CTA sentinel (renders below hero,
  //      auto-pins to viewport bottom on small screens)
  //   5. Story card
  //   6. First-meeting card (IntakePhotoGallery, now WarmCard-
  //      wrapped internally)
  //   7. School & studies card
  //   8. Family situation card (new — narrative prose for sponsors,
  //      locked invitation for everyone else)
  //   9. Moments card (WarmCard-wrapped, with warm empty-state)
  //  10. Health & wellbeing card (new — only renders when health
  //      data is populated)
  //  11. LockedFieldsBand (existing reveal-request flow; out of
  //      scope to redesign per brief)
  //  12. Updates section (existing news/posts; out of scope)
  //  13. DocumentsBanner (existing verified-counts strip; out of
  //      scope)
  //  14. SponsorCTA — replaced with warm-tinted bottom band
  //  15. RelatedChildren (unchanged)
  const childFirstName = child.display_name.split(" ")[0] || child.display_name;

  return (
    <>
      {/* Session 57.1 — top padding trimmed from pt-28/pt-32 to
          pt-8/pt-12 per Mahmud's hotfix brief. The fixed site nav
          already establishes breathing room above; the prior
          padding was double-counting. */}
      <div className="px-4 md:px-6 pt-8 md:pt-12 bg-warmth-50">
        <div className="max-w-[1100px] mx-auto">
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
      <StickyMobileSponsorCTA
        childId={child.id}
        childFirstName={childFirstName}
        tier={tier}
      />
      {queueDisplay.active ? (
        <section className="px-4 md:px-6 pt-2 pb-2 bg-warmth-50">
          <div className="max-w-[760px] mx-auto">
            <ChildSponsorBanner
              childFirstName={childFirstName}
              active={queueDisplay.active}
              queued={queueDisplay.queued}
              isFull={queueDisplay.isFull}
            />
          </div>
        </section>
      ) : null}

      <StorySection child={child} tier={tier} />

      {/* First meeting — Session 52b intake gallery, now wrapped in
          a WarmCard internally. Renders null when no approved intake
          photos exist; non-sponsor blur-overlay handled inside. */}
      <IntakePhotoGallery
        childDisplayName={child.display_name}
        childId={child.id}
        photos={intakePhotos}
        isSponsor={isSponsor}
        isAuthenticated={tier !== "public"}
      />

      <EducationSection child={child} />

      <FamilyNarrativeCard
        child={child}
        isSponsor={isSponsor}
        isAuthenticated={tier !== "public"}
      />

      <MomentsGallery childName={child.display_name} moments={moments} />

      <HealthWellbeingCard child={child} />

      <LockedFieldsBand
        child={child}
        tier={tier}
        activeReveals={activeReveals}
        revealedValues={revealedValues}
        revealedApprovedAt={revealedApprovedAt}
      />

      <UpdatesSection childName={child.display_name} updates={updates} />
      <DocumentsBanner docs={docs} />
      <SponsorCTA child={child} tier={tier} />
      <RelatedChildren items={related} />
    </>
  );
}
