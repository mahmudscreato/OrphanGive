// Hand-drawn decorative SVG primitives (Session 16 phase 1).
//
// Design philosophy: subtle imperfection, not chaotic. Each path
// is a single intentional curve with rounded caps — "human, not
// algorithmic". Keep usage sparse: one or two per section, never
// a wall of doodles. The aesthetic North Star is the OrphanGive
// logo (brushed orange figure, warm grey wordmark).
//
// All components accept className for positioning + sizing. The
// stroke color defaults to currentColor so callers can recolor
// via Tailwind text-* utilities.

import type { ReactNode } from "react";

type SVGComponentProps = {
  className?: string;
  // Stroke width override; defaults sized for the element.
  strokeWidth?: number;
  // ARIA: these are decorative — title only when the visual
  // carries meaning the surrounding text doesn't.
  title?: string;
};

// ─── SketchArrow ────────────────────────────────────────────────────
// Hand-drawn arrow. Subtle wobble in the shaft via a single quadratic
// Bezier control point; arrowhead is two short strokes meeting at a
// point. Direction prop rotates via CSS transform — the path itself
// is always horizontal, pointing right.
export function SketchArrow({
  className = "",
  strokeWidth = 2,
  direction = "right",
  title,
}: SVGComponentProps & {
  direction?: "right" | "left" | "down" | "down-right" | "down-left";
}) {
  const rotation = {
    right: 0,
    left: 180,
    down: 90,
    "down-right": 35,
    "down-left": 145,
  }[direction];
  return (
    <svg
      viewBox="0 0 100 30"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={{
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }}
    >
      {/* Shaft: gently dipping curve, looks penciled */}
      <path
        d="M 4 15 Q 30 11 55 16 T 92 14"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead — two short strokes converging at (92, 14) */}
      <path
        d="M 82 8 L 92 14 L 84 22"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── BrushedUnderline ───────────────────────────────────────────────
// Sits behind a word as a textured highlight. Two slightly offset
// strokes give the painterly feel — single stroke reads too clean.
// Sized to fit beneath a word; the parent should position it
// absolutely with -bottom-1 left-0 right-0.
export function BrushedUnderline({
  className = "",
  title,
}: SVGComponentProps) {
  return (
    <svg
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      {/* Primary stroke — thicker, slightly translucent */}
      <path
        d="M 4 12 Q 50 5 100 9 T 196 7"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.35"
        fill="none"
      />
      {/* Secondary stroke — thinner, offset for texture */}
      <path
        d="M 6 14 Q 60 10 110 13 T 194 11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
        fill="none"
      />
    </svg>
  );
}

// ─── SketchDivider ──────────────────────────────────────────────────
// Full-width gentle squiggle. Used as a section break — replaces
// the standard hr rule with something less mechanical. Stays well
// short of "doodle" — one curve, rounded caps.
export function SketchDivider({
  className = "",
  strokeWidth = 1.5,
  title,
}: SVGComponentProps) {
  return (
    <svg
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <path
        d="M 4 6 Q 80 2 160 6 T 320 6 T 396 5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.4"
        fill="none"
      />
    </svg>
  );
}

// ─── ScribbleAccent ─────────────────────────────────────────────────
// Tiny corner doodle. A 4-petal flower-ish scribble or a small spark.
// Intended as a "doodled in the margin" accent on cards. Two
// variants:
//   - 'spark' → a small star/burst of three crossing strokes
//   - 'swirl' → a small spiral
export function ScribbleAccent({
  className = "",
  variant = "spark",
  title,
}: SVGComponentProps & { variant?: "spark" | "swirl" }) {
  if (variant === "swirl") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        role={title ? "img" : "presentation"}
        aria-hidden={title ? undefined : true}
        className={className}
      >
        <path
          d="M 12 4 Q 18 6 18 12 Q 18 18 12 18 Q 8 18 8 14 Q 8 11 11 11 Q 13 11 13 13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <path d="M 12 4 L 12 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <path d="M 4 12 L 20 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <path d="M 6 6 L 18 18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      <path d="M 6 18 L 18 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

// ─── HeartDoodle ────────────────────────────────────────────────────
// Small hand-drawn heart for the CTA trust-badge row. Single
// continuous stroke (no fill), looks like it was sketched in a
// margin.
export function HeartDoodle({
  className = "",
  strokeWidth = 1.8,
  title,
}: SVGComponentProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <path
        d="M 12 20 C 9 17 4 14 4 9 Q 4 5 8 5 Q 11 5 12 8 Q 13 5 16 5 Q 20 5 20 9 C 20 14 15 17 12 20 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.75"
      />
    </svg>
  );
}

// ─── PolaroidFrame ──────────────────────────────────────────────────
// Wraps a photo in a Polaroid-style white frame: thin border on
// top/sides, thicker on bottom (the "label" space). Each instance
// gets a small fixed rotation passed in via the `tilt` prop
// (degrees, defaults to 0). On hover the frame settles to 0deg
// via the .polaroid-frame CSS class.
//
// Tilt is intentionally a prop, not random — random per-render
// would shift on hydration. Callers pass per-instance values to
// vary the look across a grid.
export function PolaroidFrame({
  children,
  tilt = 0,
  className = "",
}: {
  children: ReactNode;
  tilt?: number;
  className?: string;
}) {
  return (
    <div
      className={`polaroid-frame ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {children}
    </div>
  );
}
