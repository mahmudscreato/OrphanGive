"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

/**
 * Session 16 FIX PASS — HandDrawnPhotoFrame.
 *
 * Two render modes share the same underlying clipping technique:
 * CSS `mask-image` with an inline SVG data URL. The mask is the
 * organic blob shape filled black on transparent background; the
 * SVG uses `preserveAspectRatio="none"` so the same mask scales
 * to both fixed-pixel (Hero) and responsive (FeaturedChildren)
 * containers.
 *
 * - `src` mode: caller passes `src/alt/width/height/caption`; we
 *   render `next/image fill` inside a masked `absolute inset-0`
 *   layer. Optional dark caption pill below.
 *
 * - `children` mode: caller passes arbitrary children (typically
 *   `ProtectedChildImage` for FeaturedChildren). Same masked
 *   `absolute inset-0` layer wraps them.
 *
 * Both modes paint a separate SVG stroke overlay on top using
 * the same normalized path and `vectorEffect="non-scaling-stroke"`
 * so the pencil-brown border stays a consistent thickness at any
 * container size.
 *
 * Switched away from `clip-path: path()` (Fix-pass spec) because
 * empirically the photo didn't render inside the clip — most
 * likely a positioning interaction with `next/image fill`. Mask-
 * image is the more bulletproof technique and scales to both
 * modes from a single path definition.
 */

const ORGANIC_PATH =
  "M 0.5 0.05 C 0.75 0.03, 0.95 0.2, 0.98 0.5 C 1 0.75, 0.88 0.95, 0.6 0.98 C 0.35 1, 0.12 0.88, 0.05 0.6 C 0.02 0.35, 0.18 0.12, 0.5 0.05 Z";

// Mask URL is a tiny SVG data URI: a black-filled shape on
// transparent background. Where the shape is opaque, the
// underlying photo passes through; where it's transparent, the
// photo is hidden. `preserveAspectRatio="none"` makes the path
// stretch with the container.
const MASK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><path d='${ORGANIC_PATH}' fill='black'/></svg>`;
const MASK_URL = `url("data:image/svg+xml;utf8,${MASK_SVG}")`;

const MASK_STYLES: CSSProperties = {
  maskImage: MASK_URL,
  maskSize: "100% 100%",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: MASK_URL,
  WebkitMaskSize: "100% 100%",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
};

type CommonProps = {
  className?: string;
  style?: CSSProperties;
};

type SrcProps = CommonProps & {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  caption?: string;
  children?: never;
};

type ChildrenProps = CommonProps & {
  children: ReactNode;
  src?: never;
};

type Props = SrcProps | ChildrenProps;

export function HandDrawnPhotoFrame(props: Props) {
  if ("src" in props && typeof props.src === "string") {
    return <SrcFrame {...props} />;
  }
  return <ChildrenFrame {...(props as ChildrenProps)} />;
}

function StrokeOverlay() {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <path
        d={ORGANIC_PATH}
        fill="none"
        stroke="#B07A3C"
        /* Part 2 Item 1c — bumped strokeWidth 2 → 12 + opacity
         * 0.5 → 0.7 so the photo frame's pencil edge reads as
         * a confident hand-drawn line, matching the new
         * OrganicCircle stroke. */
        strokeWidth="12"
        strokeOpacity="0.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SrcFrame({
  src,
  alt,
  width,
  height,
  priority = false,
  caption,
  className = "",
  style,
}: SrcProps) {
  return (
    <div
      className={`relative ${className}`}
      style={{ width, height, ...style }}
    >
      <div className="absolute inset-0" style={MASK_STYLES}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={`${width}px`}
          style={{ objectFit: "cover" }}
        />
      </div>
      <StrokeOverlay />
      {caption && (
        <div
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#3A3A3E]/85 px-3 py-1 rounded-md backdrop-blur-sm"
          style={{ whiteSpace: "nowrap" }}
        >
          <span className="font-mono text-xs text-white tracking-wide">
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}

function ChildrenFrame({ children, className = "", style }: ChildrenProps) {
  return (
    <div className={`relative ${className}`} style={style}>
      <div className="absolute inset-0" style={MASK_STYLES}>
        {children}
      </div>
      <StrokeOverlay />
    </div>
  );
}
