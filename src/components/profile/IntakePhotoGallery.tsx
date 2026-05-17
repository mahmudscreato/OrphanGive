// Session 52b — Donor-facing intake photo gallery.
// Session 52c — privacy hardening: replaces the CSS-only blur
// from 52b with server-rendered blurred variants. The Directus
// `intake-locked` storage preset (registered in
// migrations/session-52c/001-register-fields.sh) returns a
// downscaled (240×240) + blur(25) JPEG variant. Non-sponsor views
// fetch the variant via `?key=intake-locked`; the underlying
// full-resolution image never reaches the browser, so right-click
// → Save Image As + DevTools network inspection both retrieve only
// the locked variant. Casual-save deterrents (CSS user-select,
// contextmenu suppression) sit on top of the server-side gate as
// extra friction.
//
// Three viewer tiers handled here:
//   1. Public (no auth): main photo full-resolution; photos 2-5
//      fetched via ?key=intake-locked (server-blurred) with a
//      lock icon overlay + click-to-sponsor modal.
//   2. Authenticated donor without an active sponsorship of THIS
//      child: same treatment as Public.
//   3. Sponsoring donor (active or paused sponsorship): all photos
//      full-resolution.
//
// Remaining attack vector: a non-sponsor can guess the
// /api/assets/{uuid} URL without ?key — but per the donor surface
// rule (status='approved' only), all photos surfaced are already
// Tier 1 approved-for-public. The blur is identity-protection
// editorial-choice for non-sponsors, not a leak prevention against
// the underlying file. The actual privacy gate is the admin's
// approval decision; the variant URL adds save-friction.

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
              // Session 52c — copy update with privacy framing
              // ("for {Name}'s safety") so the trust ask reads as a
              // protection, not a paywall.
              <div className="mt-4 max-w-[480px] mx-auto text-center">
                <p className="text-[13.5px] text-ink leading-relaxed">
                  <Lock
                    className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5 stroke-[2]"
                    aria-hidden="true"
                  />
                  {thumbs.length} more{" "}
                  {thumbs.length === 1 ? "photo" : "photos"} visible to
                  sponsors of {firstName}.
                </p>
                <p className="mt-1 text-[12.5px] text-ink-soft italic leading-relaxed">
                  For {firstName}&apos;s safety, we only share these with
                  verified sponsors.
                </p>
                <p className="mt-3 text-[13px] text-ink-soft">
                  {isAuthenticated ? (
                    <Link
                      href={`/sponsor/${childId}`}
                      className="text-tangerine-deeper hover:underline font-medium"
                    >
                      Sponsor {firstName} to see all →
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
                      to see all.
                    </>
                  )}
                </p>
              </div>
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
  // Non-sponsor: fetch the server-blurred variant via Directus's
  // `intake-locked` storage preset (registered in
  // migrations/session-52c/001-register-fields.sh). The browser
  // never touches the full-resolution image; right-click → Save
  // grabs the blurred variant (downscaled to 240×240, blur radius
  // 25, JPEG quality 60). Saving the locked variant is intentional
  // — it has no identifying detail to leak.
  //
  // Session 52d defensive belt-and-suspenders: we pass explicit
  // size + format params ALONGSIDE the preset key. If the preset
  // didn't register (which happened in 52c — see migrations/
  // session-52d/001-register-fields.sh header for the script
  // robustness story), Directus falls back to applying the
  // explicit query params and still serves a small downscaled
  // JPEG. The image won't be blurred without the preset, but it
  // will at least be small (240px) so the right-click save grabs
  // less identifiable data while the preset gets fixed. With the
  // preset registered (the normal case post-52d), Directus's
  // preset definitions take precedence over individual query
  // params and the blur is applied.
  const lockedUrl =
    `${photo.photoUrl}?key=intake-locked&width=240&height=240&fit=contain&quality=60&format=jpg`;
  return (
    <BlurredPhotoModalTrigger
      photoUrl={lockedUrl}
      alt={photo.caption ?? `Photo of ${childFirstName}`}
      childFirstName={childFirstName}
      childId={childId}
      isAuthenticated={isAuthenticated}
    />
  );
}
