// Session 52b — Donor-facing intake photo gallery.
//
// Three viewer tiers handled here:
//   1. Public (no auth): main photo (display_order=0) full, photos
//      2-5 CSS-blurred with a lock + click-to-sponsor modal.
//   2. Authenticated donor without an active sponsorship of THIS
//      child: same treatment as Public — CTA encourages them to
//      sponsor this specific child.
//   3. Sponsoring donor (active or paused sponsorship): all photos
//      unblurred.
//
// Privacy tradeoff note (documented in W4 brief): even for non-
// sponsors, the underlying image URL is loaded; the blur is purely
// CSS. A DevTools-savvy visitor could lift the URL out and view the
// raw image. This is fine for V1 because the photos are already
// approved-for-public per Tier 1. Future hardening: have Directus
// (or a thin proxy) serve a pre-blurred image variant for
// non-sponsors, served from a separate URL the client can't bypass.
// Tracked in the W4 ship report.

import Link from "next/link";
import { Lock } from "lucide-react";
import { BlurredPhotoModalTrigger } from "./BlurredPhotoModalTrigger";
import type { DonorIntakePhoto } from "@/lib/donor-intake-photos";

export interface IntakePhotoGalleryProps {
  childDisplayName: string;
  childId: string;
  photos: DonorIntakePhoto[];
  isSponsor: boolean;
  isAuthenticated: boolean;
}

export function IntakePhotoGallery({
  childDisplayName,
  childId,
  photos,
  isSponsor,
  isAuthenticated,
}: IntakePhotoGalleryProps) {
  if (photos.length === 0) return null;

  const firstName = childDisplayName.split(" ")[0] || childDisplayName;
  const [main, ...rest] = photos;
  const thumbs = rest.slice(0, 4);

  return (
    <section className="px-6 pt-12 pb-16 bg-cream max-md:pt-8 max-md:pb-12">
      <div className="max-w-[1100px] mx-auto">
        <div className="eyebrow-tag mb-3">First meeting</div>
        <h2 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(1.5rem,2.5vw,2rem)] mb-1.5">
          A few moments from when we met {firstName}.
        </h2>
        <p className="text-[14.5px] text-ink-soft leading-relaxed mb-8 max-w-[640px]">
          Photos from our field team&apos;s initial visit. The story
          starts here.
        </p>

        {/* Main photo */}
        <div className="rounded-[24px] overflow-hidden bg-linen border border-ink/[0.05] mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main.photoUrl}
            alt={main.caption ?? `First-meeting photo of ${firstName}`}
            className="w-full h-auto block"
            style={{ aspectRatio: "3 / 2", objectFit: "cover" }}
          />
          {main.caption ? (
            <div className="px-5 py-3 bg-white border-t border-ink/[0.05]">
              <p className="text-[13.5px] text-ink-soft italic leading-relaxed">
                {main.caption}
              </p>
            </div>
          ) : null}
        </div>

        {/* Thumbnail strip */}
        {thumbs.length > 0 ? (
          <div>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {thumbs.map((p) => (
                <ThumbnailTile
                  key={p.id}
                  photo={p}
                  isSponsor={isSponsor}
                  childFirstName={firstName}
                  childId={childId}
                  isAuthenticated={isAuthenticated}
                />
              ))}
            </div>
            {!isSponsor ? (
              <p className="mt-4 text-center text-[13px] text-ink-soft">
                <Lock
                  className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 stroke-[2]"
                  aria-hidden="true"
                />
                {thumbs.length} more {thumbs.length === 1 ? "photo" : "photos"}{" "}
                visible to sponsors of {firstName}.{" "}
                {isAuthenticated ? (
                  <Link
                    href={`/sponsor/${childId}`}
                    className="text-tangerine-deeper hover:underline font-medium"
                  >
                    Become {firstName}&apos;s sponsor →
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/signin?from=/children/${childId}`}
                      className="text-tangerine-deeper hover:underline font-medium"
                    >
                      Sign in
                    </Link>{" "}
                    or{" "}
                    <Link
                      href={`/sponsor/${childId}`}
                      className="text-tangerine-deeper hover:underline font-medium"
                    >
                      sponsor {firstName}
                    </Link>{" "}
                    to see more.
                  </>
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ThumbnailTile({
  photo,
  isSponsor,
  childFirstName,
  childId,
  isAuthenticated,
}: {
  photo: DonorIntakePhoto;
  isSponsor: boolean;
  childFirstName: string;
  childId: string;
  isAuthenticated: boolean;
}) {
  if (isSponsor) {
    return (
      <div className="rounded-2xl overflow-hidden bg-linen border border-ink/[0.05]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.photoUrl}
          alt={photo.caption ?? `Photo of ${childFirstName}`}
          className="w-full h-auto block"
          style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
        />
      </div>
    );
  }
  // Non-sponsor: blurred + click → modal (client island).
  return (
    <BlurredPhotoModalTrigger
      photoUrl={photo.photoUrl}
      alt={photo.caption ?? `Photo of ${childFirstName}`}
      childFirstName={childFirstName}
      childId={childId}
      isAuthenticated={isAuthenticated}
    />
  );
}
