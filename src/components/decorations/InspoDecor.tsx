import type { CSSProperties } from "react";

/**
 * Session 16 Part 3 Item 1 — InspoDecor.
 *
 * Hand-drawn decorative SVG primitives ported from the homepage
 * inspiration. All components share an Excalidraw-style
 * aesthetic: intentional curves, slight asymmetry, round caps,
 * never geometric perfection.
 *
 * All `aria-hidden="true"` — purely decorative.
 *
 * Replaces `Doodles.tsx`. Direct mapping of the old →  new:
 *   HeartSketch    → HeartOutline
 *   StarSparkle    → SunHeart
 *   DottedTrail    → DottedArc
 *   BrushUnderline → PenSwoosh
 *   SunDoodle      → SunHeart
 *   CrayonCircle   → (no equivalent — drop)
 *   ScribbleFrame  → (no equivalent — drop)
 *   SmileMark      → HeartOutline (small)
 */

// ─── HeartOutline ────────────────────────────────────────────────
type HeartOutlineProps = {
  size?: number;
  color?: string;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
};

export function HeartOutline({
  size = 24,
  color = "#E57373",
  stroke = 2.5,
  className,
  style,
}: HeartOutlineProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M 12 21 Q 3 14 4 8 Q 5 3 9 4 Q 11 4 12 8 Q 13 4 15 4 Q 19 3 20 8 Q 21 14 12 21 Z"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── DottedArc ───────────────────────────────────────────────────
type DottedArcProps = {
  size?: number;
  color?: string;
  dots?: number;
  className?: string;
  style?: CSSProperties;
};

export function DottedArc({
  size = 80,
  color = "#F5B07A",
  dots = 8,
  className,
  style,
}: DottedArcProps) {
  // Positions along a quadratic bezier from (10,70) through
  // (50,8) to (90,70). Deterministic — no Math.random so SSR
  // and CSR render identically.
  const positions = Array.from({ length: dots }, (_, i) => {
    const t = dots === 1 ? 0.5 : i / (dots - 1);
    const u = 1 - t;
    const x = u * u * 10 + 2 * u * t * 50 + t * t * 90;
    const y = u * u * 70 + 2 * u * t * 8 + t * t * 70;
    return { x, y };
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {positions.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.6" fill={color} />
      ))}
    </svg>
  );
}

// ─── OliveSprig ──────────────────────────────────────────────────
type OliveSprigProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

export function OliveSprig({
  size = 80,
  color = "#7BB342",
  className,
  style,
}: OliveSprigProps) {
  // Aspect 0.6:1 (taller than wide). Stem runs vertically;
  // four leaves alternate left/right with a slight imperfect
  // wobble.
  return (
    <svg
      width={size * 0.6}
      height={size}
      viewBox="0 0 60 100"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M 30 8 Q 30 50 30 92"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 30 20 Q 10 14 8 26 Q 18 30 30 24 Z"
        fill={color}
        opacity="0.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M 30 38 Q 52 32 54 44 Q 44 48 30 42 Z"
        fill={color}
        opacity="0.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M 30 56 Q 10 50 8 62 Q 18 66 30 60 Z"
        fill={color}
        opacity="0.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M 30 74 Q 52 68 54 80 Q 44 84 30 78 Z"
        fill={color}
        opacity="0.7"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── PenSwoosh ───────────────────────────────────────────────────
type PenSwooshProps = {
  width?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

export function PenSwoosh({
  width = 200,
  color = "#ED8B3F",
  className,
  style,
}: PenSwooshProps) {
  return (
    <svg
      width={width}
      height={width * 0.2}
      viewBox="0 0 200 40"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M 10 30 Q 50 6 100 18 Q 150 30 190 12"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}

// ─── ConfettiDots ────────────────────────────────────────────────
type ConfettiDotsProps = {
  count?: number;
  area?: [number, number];
  className?: string;
  style?: CSSProperties;
};

// Part 4 Fix 11 — palette aligned with OG brand oranges.
// Keeps a single sage green for visual variety without
// veering into a non-brand red.
const CONFETTI_PALETTE = ["#ED8B3F", "#F5B07A", "#D97A0F", "#7BB342"];

export function ConfettiDots({
  count = 10,
  area = [200, 100],
  className,
  style,
}: ConfettiDotsProps) {
  const [w, h] = area;
  // Deterministic pseudo-positions via LCG-ish seeded ints —
  // no Math.random, so SSR/CSR match. Each dot picks a colour
  // from the palette, a radius 2–4, and an opacity 0.5–0.9.
  const dots = Array.from({ length: count }, (_, i) => {
    const seedX = (i * 113 + 17) % 1000;
    const seedY = (i * 191 + 41) % 1000;
    return {
      cx: (seedX / 1000) * w,
      cy: (seedY / 1000) * h,
      r: 2 + ((i * 7) % 3),
      color: CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]!,
      opacity: 0.5 + (((i * 13) % 5) / 10),
    };
  });
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          fill={d.color}
          opacity={d.opacity}
        />
      ))}
    </svg>
  );
}

// ─── SunHeart ────────────────────────────────────────────────────
type SunHeartProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function SunHeart({ size = 32, className, style }: SunHeartProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <g stroke="#F4A574" strokeWidth="2" strokeLinecap="round">
        <path d="M 20 4 L 20 8" />
        <path d="M 20 32 L 20 36" />
        <path d="M 4 20 L 8 20" />
        <path d="M 32 20 L 36 20" />
        <path d="M 8 8 L 11 11" />
        <path d="M 29 29 L 32 32" />
        <path d="M 32 8 L 29 11" />
        <path d="M 8 32 L 11 29" />
      </g>
      <path
        d="M 20 29 Q 11 22 12 16 Q 13 12 17 13 Q 19 13 20 16 Q 21 13 23 13 Q 27 12 28 16 Q 29 22 20 29 Z"
        fill="#E57373"
      />
    </svg>
  );
}

// ─── BrushWash ───────────────────────────────────────────────────
type BrushWashProps = {
  color?: string;
  className?: string;
  style?: CSSProperties;
};

export function BrushWash({
  color = "#FCE4D0",
  className,
  style,
}: BrushWashProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d="M 40 60 Q 18 200 60 340 Q 200 380 340 360 Q 380 200 350 50 Q 200 30 40 60 Z"
        fill={color}
      />
    </svg>
  );
}
