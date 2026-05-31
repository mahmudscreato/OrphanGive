"use client";

import Image from "next/image";
import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * Session 16 Part 3 Item 2 — PhotoBlob.
 *
 * The inspiration's photo container: an organic-blob silhouette
 * (NOT a clean circle or rounded rect) with a brushed double-
 * stroke ring drawn around its edge. Used wherever a photo
 * needs to feel hand-cut into the page, primarily in the new
 * hero collage, the About section, and ClosingCTA.
 *
 * Technique:
 *   - CSS `mask-image` with an inline SVG data URL clips the
 *     photo to the blob path. `mask-size: 100% 100%` +
 *     `preserveAspectRatio="none"` lets the mask scale to any
 *     container without recomputing coordinates.
 *   - A second SVG layered on top draws the visible brush ring
 *     along the exact same path. Two strokes are stacked (a
 *     thicker faint outer + a thinner solid inner) to give the
 *     ring a layered hand-drawn quality.
 *   - An SVG turbulence filter (feTurbulence + feDisplacement-
 *     Map) wraps the stroke group so the ring's edge wobbles
 *     organically rather than reading as a clean geometric
 *     stroke.
 *
 * Each instance gets a unique filter id via React's useId so
 * multiple blobs on the same page don't share filter defs.
 */

// Blob paths — viewBox 0 0 400 400 — exact paths from the spec.
// `editorial` (Part 5.5 Fix A) is a tall soft-rounded rectangle
// with subtly asymmetric corners — a lighter, more magazine-cover
// frame than the heavy organic blobs above. Stretched via
// preserveAspectRatio="none", the asymmetry reads natural.
const blobPaths = {
  hero1:
    "M 200 30 C 285 30 360 85 365 175 C 370 250 335 320 270 355 C 200 390 110 380 60 320 C 15 265 25 165 70 100 C 110 50 150 30 200 30 Z",
  hero2:
    "M 200 25 C 290 35 355 110 350 195 C 345 280 280 350 195 355 C 110 360 45 295 35 210 C 25 120 105 30 200 25 Z",
  hero3:
    "M 200 30 C 280 25 360 75 360 165 C 360 245 320 335 230 355 C 145 375 70 330 45 250 C 20 165 65 80 130 50 C 155 38 180 32 200 30 Z",
  about:
    "M 200 28 C 290 22 360 90 365 180 C 370 265 320 345 230 360 C 140 375 55 320 35 235 C 15 145 75 60 145 38 C 170 30 185 28 200 28 Z",
  story1:
    "M 200 32 C 285 28 355 90 350 180 C 345 270 280 350 195 355 C 115 360 50 285 45 200 C 40 115 110 38 200 32 Z",
  story2:
    "M 200 30 C 290 30 360 100 355 195 C 350 290 270 360 175 350 C 90 340 35 255 50 165 C 65 80 135 30 200 30 Z",
  story3:
    "M 200 35 C 280 28 355 80 360 175 C 365 260 305 345 215 360 C 130 375 60 320 40 230 C 22 145 90 50 200 35 Z",
  editorial:
    "M 70 22 Q 28 22 26 64 L 22 338 Q 26 378 66 380 L 334 376 Q 376 378 378 334 L 376 62 Q 372 24 330 22 Z",
  // Part 5.6 Fix A.1 — deliberately broken / hand-drawn frame.
  // Asymmetric corners (top-left rounder than top-right, left
  // side bulges where right is straighter), tall portrait. The
  // turbulence filter on top adds further wobble — total effect
  // reads as "drawn by hand", not pulled from a shape library.
  broken:
    "M 80 32 Q 35 30 25 78 L 22 195 Q 12 260 28 320 Q 36 372 90 376 L 320 372 Q 376 370 374 320 L 372 100 Q 374 50 348 30 Q 320 24 280 28 L 92 30 Q 82 28 80 32 Z",
  // Part 5.6 Fix D.3 — slightly tilted oval, different shape
  // family from `broken` (oval-blob vs rect-derived). Used by
  // AboutSection so the page reads as cohesive without two
  // sections sharing the literal same path.
  tilted:
    "M 200 28 C 285 20 360 65 365 165 C 370 250 330 340 235 360 C 140 380 55 325 38 240 C 22 155 85 55 175 32 Z",
} as const;

export type BlobPathKey = keyof typeof blobPaths;

type PhotoBlobProps = {
  pathKey: BlobPathKey;
  /** Photo source. If omitted, renders the fallback gradient. */
  src?: string;
  /** Children mode — when provided, these render inside the blob mask
   *  instead of the built-in <Image> (e.g. a ProtectedChildImage for
   *  real child photos, which carries its own right-click guard +
   *  error→placeholder). The brush ring is drawn the same way. */
  children?: ReactNode;
  alt?: string;
  /** Brush ring color. */
  ringColor?: string;
  /** Gradient stops used when `src` is omitted. */
  fallbackGrad?: [string, string];
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  sizes?: string;
  /** `object-position` for the inner photo (next/image fill). Use
   * to bias the crop, e.g. `"center 15%"` to lift faces into
   * the visible area of the blob. */
  objectPosition?: string;
  /** Outer brush stroke width (Part 5.5 Fix A — defaults to 14 to
   * preserve previous look; the Hero's `editorial` shape passes
   * a thinner value so the ring doesn't overpower the photo). */
  outerStrokeWidth?: number;
  /** Inner brush stroke width (defaults to 8). */
  innerStrokeWidth?: number;
};

function buildMaskUrl(path: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' preserveAspectRatio='none'><path d='${path}' fill='black'/></svg>`;
  // # is technically invalid in unencoded data URIs across some
  // browsers; the SVG paths here have none, but encoding defensively
  // costs nothing.
  return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, "%23")}")`;
}

export function PhotoBlob({
  pathKey,
  src,
  children,
  alt = "",
  ringColor = "#ED8B3F",
  fallbackGrad,
  className = "",
  style,
  priority = false,
  sizes,
  objectPosition,
  outerStrokeWidth = 14,
  innerStrokeWidth = 8,
}: PhotoBlobProps) {
  const rawId = useId();
  const filterId = `pb-rough-${rawId.replace(/:/g, "")}`;
  const path = blobPaths[pathKey];
  const maskUrl = buildMaskUrl(path);

  const maskStyles: CSSProperties = {
    maskImage: maskUrl,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskImage: maskUrl,
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
  };

  return (
    <div
      className={`relative ${className}`}
      style={style}
      // Casual right-click/drag guard for the photo. The contextmenu
      // event bubbles from the inner <Image>/children up to here and
      // preventDefault() suppresses the browser's "Save Image As" menu
      // entirely. (Same proven mechanism ProtectedChildImage uses.)
      // Children-mode photos (ProtectedChildImage) also carry their own
      // guard; this is belt-and-suspenders and protects src-mode too.
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Photo (children, image, or gradient fallback), clipped to the
          blob shape via CSS mask-image. */}
      <div className="absolute inset-0" style={maskStyles}>
        {children ? (
          children
        ) : src ? (
          <Image
            src={src}
            alt={alt}
            fill
            draggable={false}
            priority={priority}
            sizes={sizes ?? "(max-width: 768px) 100vw, 400px"}
            className="child-photo-protect"
            style={{
              objectFit: "cover",
              ...(objectPosition ? { objectPosition } : null),
            }}
          />
        ) : fallbackGrad ? (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${fallbackGrad[0]} 0%, ${fallbackGrad[1]} 100%)`,
            }}
          />
        ) : null}
      </div>

      {/* Brush-stroke ring overlay. Two strokes layered for depth;
          turbulence filter wobbles the edge so the ring reads as
          painted rather than vector-clean. vectorEffect keeps the
          stroke width constant regardless of container scale. */}
      <svg
        viewBox="0 0 400 400"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves="2"
              seed="2"
            />
            <feDisplacementMap in="SourceGraphic" scale="4" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
          {/* Part 4 Fix 4b — outer ring opacity 0.45 → 0.6, inner
              0.85 → 1.0 so the brush color stays vivid through
              the turbulence filter. Part 5.5 Fix A — stroke
              widths are props now so the Hero's `editorial`
              shape can request a thinner ring (10 outer / 6
              inner) without overpowering the photo. */}
          <path
            d={path}
            fill="none"
            stroke={ringColor}
            strokeWidth={outerStrokeWidth}
            strokeOpacity="0.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={ringColor}
            strokeWidth={innerStrokeWidth}
            strokeOpacity="1"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>
  );
}

export default PhotoBlob;
