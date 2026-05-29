// P1.2 — strip EXIF / IPTC / XMP metadata from every uploaded image.
//
// WHY THIS EXISTS
// Phone-camera JPEGs carry GPS coordinates in their EXIF block. When a
// guardian-consented child photo is taken on a Bangladeshi field
// worker's phone and uploaded through OrphanGive, the GPS in EXIF
// would otherwise reveal the child's exact location to anyone who can
// fetch the raw asset bytes from `/api/assets/[id]` (currently an
// open proxy — see P1.5 of the safety-fix-plan for the asset-proxy
// gating decision, deliberately scoped separately).
//
// HOW IT WORKS
// We pass the upload buffer through sharp, which decodes the image,
// drops EVERY metadata block by default (sharp does not propagate
// EXIF/IPTC/XMP unless you explicitly call `.withMetadata()` — which
// we do NOT), and re-encodes in the same format. `.rotate()` is
// called BEFORE the encode so any EXIF `Orientation` tag (which we
// are about to throw away) is baked into the pixel data — without
// this, a portrait photo taken on a phone would render sideways
// after metadata removal.
//
// PDFs and any non-image MIME pass through unchanged. They have
// their own metadata concerns (PDF Author, Producer, etc.) that
// are out of scope for this lot.
//
// QUALITY CHOICES
// JPEG re-encode: quality 85 (sharp default 80, but child photos
// reproduce skin tone better at 85 with minimal size cost).
// WebP re-encode: quality 85.
// PNG re-encode: stays lossless; no quality knob applied.

import "server-only";

import sharp from "sharp";

const IMAGE_MIMES_HANDLED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Strip EXIF / IPTC / XMP from an uploaded image. Returns a new
 * `File` whose underlying bytes carry no metadata.
 *
 * - For supported image MIMEs (jpeg/png/webp): re-encodes through
 *   sharp; bakes EXIF orientation into pixels before dropping it.
 * - For unsupported / non-image MIMEs: returns the original file
 *   unchanged (e.g. PDFs through the document upload path).
 *
 * Throws no errors for unsupported formats; callers MUST gate MIME
 * upstream so we know what we're getting. If sharp itself fails
 * to parse a "jpeg" that isn't really a jpeg, we throw — the upload
 * helper turns that into a 415 invalid_type.
 */
export async function stripImageMetadata(file: File): Promise<File> {
  if (!IMAGE_MIMES_HANDLED.has(file.type)) {
    return file;
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // sharp() with no options reads the buffer; .rotate() with no
  // angle argument applies the EXIF Orientation tag (if any) before
  // we strip metadata. Withdrawing metadata is sharp's DEFAULT —
  // we explicitly avoid `.withMetadata()` and `.keepExif()` /
  // `.keepIccProfile()` etc. so no metadata block survives.
  let pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();

  if (file.type === "image/jpeg") {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  } else if (file.type === "image/webp") {
    pipeline = pipeline.webp({ quality: 85 });
  } else if (file.type === "image/png") {
    // Lossless. compressionLevel is the zlib level, NOT a quality
    // knob; default 6 is a fair size/cpu trade-off.
    pipeline = pipeline.png({ compressionLevel: 6 });
  }

  const cleanedBuffer = await pipeline.toBuffer();

  // Re-wrap into a File so the upload helper's existing
  // FormData.append("file", file) path is unchanged. Preserve
  // filename + MIME so the consumer sees the same shape.
  return new File([new Uint8Array(cleanedBuffer)], file.name, {
    type: file.type,
    lastModified: Date.now(),
  });
}
