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

// Part 5.7 Fix D.2 — four near-circle path variants for the
// homepage child cards so the 4-card row reads as four
// hand-cut shapes instead of four identical ones. Each is a
// gently irregular near-circle (NOT a clean ellipse) in
// normalized 0..1 coordinates. The asymmetry sits in a
// different spot per variant — A has a softer top-left, B
// pinches bottom-right, C stretches vertically, D leans wider.
const CIRCLE_PATHS = {
  circleA:
    "M 0.5 0.06 C 0.78 0.06, 0.95 0.24, 0.95 0.52 C 0.95 0.78, 0.78 0.95, 0.5 0.95 C 0.22 0.95, 0.05 0.78, 0.05 0.5 C 0.05 0.22, 0.22 0.06, 0.5 0.06 Z",
  circleB:
    "M 0.52 0.05 C 0.78 0.05, 0.96 0.22, 0.95 0.5 C 0.94 0.78, 0.75 0.95, 0.5 0.95 C 0.24 0.95, 0.07 0.76, 0.06 0.5 C 0.05 0.24, 0.26 0.07, 0.52 0.05 Z",
  circleC:
    "M 0.5 0.04 C 0.76 0.04, 0.96 0.22, 0.96 0.5 C 0.96 0.78, 0.78 0.97, 0.5 0.97 C 0.22 0.97, 0.04 0.78, 0.04 0.5 C 0.04 0.22, 0.24 0.04, 0.5 0.04 Z",
  circleD:
    "M 0.5 0.07 C 0.78 0.06, 0.94 0.24, 0.94 0.5 C 0.94 0.78, 0.78 0.94, 0.5 0.94 C 0.22 0.94, 0.06 0.78, 0.06 0.52 C 0.06 0.24, 0.22 0.08, 0.5 0.07 Z",
} as const;

export type FramePathKey = keyof typeof CIRCLE_PATHS;

function buildMaskUrl(path: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><path d='${path}' fill='black'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg}")`;
}

function maskStylesFor(path: string): CSSProperties {
  const url = buildMaskUrl(path);
  return {
    maskImage: url,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskImage: url,
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
  };
}

const MASK_STYLES = maskStylesFor(ORGANIC_PATH);

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
  /** Part 5.7 Fix D.2 — optional pathKey to vary the silhouette
   * across multiple cards on the same page. Defaults to the
   * original `ORGANIC_PATH` for back-compat. */
  pathKey?: FramePathKey;
};

type Props = SrcProps | ChildrenProps;

export function HandDrawnPhotoFrame(props: Props) {
  if ("src" in props && typeof props.src === "string") {
    return <SrcFrame {...props} />;
  }
  return <ChildrenFrame {...(props as ChildrenProps)} />;
}

function StrokeOverlay({ path = ORGANIC_PATH }: { path?: string }) {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="#ED8B3F"
        strokeWidth="12"
        strokeOpacity="0.85"
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

function ChildrenFrame({
  children,
  className = "",
  style,
  pathKey,
}: ChildrenProps) {
  const path = pathKey ? CIRCLE_PATHS[pathKey] : ORGANIC_PATH;
  const styles = pathKey ? maskStylesFor(path) : MASK_STYLES;
  return (
    <div className={`relative ${className}`} style={style}>
      <div className="absolute inset-0" style={styles}>
        {children}
      </div>
      <StrokeOverlay path={path} />
    </div>
  );
}
