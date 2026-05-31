import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { PhotoBlob as BrushPhotoBlob } from "@/components/decorations/PhotoBlob";

// ─── PhotoBlob — child photo in the organic blob shape ──────────────
//
// Ring treatment standardised on the WOBBLY HAND-PAINTED BRUSH ring —
// the same `@/components/decorations/PhotoBlob` (mask-image clip +
// feTurbulence/feDisplacement brush stroke) the homepage and /children
// cards use. One brush-ring component across every page (founder
// direction; reverses the earlier clean-stroke swap).
//
// PRIVACY / PIPELINE / RIGHT-CLICK (unchanged): rendered in CHILDREN
// mode so the photo is still the SAME ProtectedChildImage
// (Next/Image + onContextMenu→preventDefault right-click guard +
// error→placeholder). The brush blob only adds the mask + a
// pointer-events:none ring overlay, and its own onContextMenu guard on
// top. No new data exposure; right-click protection intact.

export function PhotoBlob({
  photoSrc,
  alt,
}: {
  photoSrc: string | null;
  alt: string;
}) {
  return (
    <BrushPhotoBlob pathKey="story1" ringColor="#ED8B3F" className="w-full h-full">
      {photoSrc ? (
        <ProtectedChildImage
          src={photoSrc}
          alt={alt}
          width={900}
          height={900}
          quality={85}
          className="w-full h-full object-cover"
          priority
        />
      ) : (
        <div className="child-photo-placeholder w-full h-full" aria-hidden="true" />
      )}
    </BrushPhotoBlob>
  );
}

export default PhotoBlob;
