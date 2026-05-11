"use client";

type Props = {
  size?: number;
  fill?: string;
  innerFill?: string;
  strokeColor?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function OrganicCircle({
  size = 300,
  fill = "#ED8B3F",
  innerFill = "#F5B07A",
  strokeColor = "#B07A3C",
  className = "",
  style,
}: Props) {
  // Generate unique hatch pattern ID per instance to avoid collisions
  const id = `hatch-${Math.abs((fill + size).split('').reduce((a, c) => a + c.charCodeAt(0), 0))}`;

  // Slightly imperfect circle - intentionally organic, not geometric
  const outerPath =
    "M150,15 C210,12 275,50 285,115 C295,175 275,235 215,265 C155,295 85,285 35,235 C-5,180 5,105 50,55 C90,20 120,18 150,15 Z";
  const innerCirclePath =
    "M150,80 C180,80 220,100 220,140 C220,175 195,200 155,200 C115,200 85,175 85,140 C85,105 120,80 150,80 Z";

  return (
    <svg
      viewBox="0 0 300 300"
      width={size}
      height={size}
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id={id}
          patternUnits="userSpaceOnUse"
          width="10"
          height="10"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="10" stroke="white" strokeWidth="2" opacity="0.35" />
        </pattern>
      </defs>

      {/* Outer blob - solid fill */}
      <path d={outerPath} fill={fill} />

      {/* Hatching overlay on outer blob */}
      <path d={outerPath} fill={`url(#${id})`} />

      {/* Hand-drawn pencil border. Part 2 Item 1c — strokeWidth
          bumped 2.5 → 12 + opacity 0.5 → 0.7 so the brushed
          outline reads as a deliberate hand-drawn line, not a
          hairline. */}
      <path
        d={outerPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="12"
        strokeOpacity="0.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner smaller circle (lighter shade) */}
      <path d={innerCirclePath} fill={innerFill} opacity="0.8" />
    </svg>
  );
}
