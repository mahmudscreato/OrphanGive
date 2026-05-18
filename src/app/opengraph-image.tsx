// Session 64 — Root-segment dynamic OG image.
//
// Why this exists, in three layers:
//   1. WhatsApp / iMessage / Facebook / Twitter reject SVG og:image
//      and fall back to the triangle placeholder. The original layout
//      pointed `icons.icon` at an SVG and (in earlier sessions)
//      `openGraph.images` too.
//   2. Session 39 swapped openGraph.images to a Cloudinary URL ending
//      `.png`. But the URL carries `f_auto`, so Cloudinary serves
//      different Content-Types based on the requester's Accept
//      header — verified locally: curl receives image/jpeg from a
//      .png URL. Some scrapers cross-check the extension against
//      the response header and silently drop the preview.
//   3. This file uses Next.js's `opengraph-image` route convention.
//      Next auto-wires it to og:image + twitter:image meta tags
//      for every route under /app (unless a deeper segment ships
//      its own opengraph-image), and serves a deterministic
//      image/png with predictable Content-Length + cache headers.
//      No Cloudinary indirection, no f_auto surprise.
//
// The image: cream background, "OrphanGive" wordmark in serif,
// tagline below in body sans, "orphangive.org" footer mark, soft
// tangerine arcs as gentle brand decoration. Renders entirely from
// inline JSX + system-fallback fonts — no external fetches at render
// time, so cold starts are quick and we don't break if a font CDN is
// transiently unreachable.
//
// Per-route override: any /app/<segment>/opengraph-image.tsx replaces
// this file for that route. Per-child OG (e.g. "Sponsor Fahim's
// education") is filed as Session 64-followup — needs a Tier-1-only
// data path off the child record and a privacy review on what's safe
// to render into a public OG image (no real names per privacy spec).

import { ImageResponse } from "next/og";

// `alt` and `size` are read by Next's metadata pipeline. `contentType`
// makes the Content-Type explicit (image/png) so scrapers that
// content-sniff don't get confused.
export const alt = "OrphanGive — Sponsor an orphan in Bangladesh";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Brand tokens lifted from globals.css. Hex literals because the
// satori renderer behind ImageResponse doesn't see Tailwind theme
// variables.
const COLORS = {
  cream: "#FFFAF2",
  ink: "#2A2A2C",
  inkSoft: "#5C5C60",
  tangerine: "#F39322",
  tangerineDeep: "#D97A0F",
  tangerineDeeper: "#A85808",
  tangerineMist: "#FFF4E6",
  tangerineSoft: "#FFE4C4",
};

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.cream,
          position: "relative",
          fontFamily: "serif",
        }}
      >
        {/* Decorative arc — top-left. Two stacked partial rings give
            a subtle "warm sunrise" hint without leaning into anything
            too on-the-nose. Pure CSS, no external SVG to fetch. */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            width: 360,
            height: 360,
            borderRadius: "50%",
            border: `2px dashed ${COLORS.tangerineSoft}`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -60,
            left: -60,
            width: 220,
            height: 220,
            borderRadius: "50%",
            border: `2px solid ${COLORS.tangerineMist}`,
          }}
        />

        {/* Decorative dot grid — bottom-right. Just enough texture to
            stop the cream background from looking like a placeholder
            itself when an OG preview crops or zooms. */}
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -100,
            width: 320,
            height: 320,
            borderRadius: "50%",
            border: `2px dashed ${COLORS.tangerineSoft}`,
          }}
        />

        {/* Top accent — small tangerine pill above the wordmark.
            Acts as a visual anchor and previews the brand color
            even when the wordmark itself is rendered in dark ink. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 28,
            padding: "10px 22px",
            backgroundColor: COLORS.tangerineMist,
            border: `1px solid ${COLORS.tangerineSoft}`,
            borderRadius: 999,
            color: COLORS.tangerineDeeper,
            fontFamily: "system-ui, sans-serif",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Verified sponsorships
        </div>

        {/* Wordmark. Serif fallback (satori uses a built-in Noto Serif
            by default) reads as warm + considered; matches Fraunces's
            general personality even though we're not loading Fraunces
            here. */}
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: -3,
            lineHeight: 1,
            marginBottom: 24,
          }}
        >
          Orphan<span style={{ color: COLORS.tangerineDeep }}>Give</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 38,
            color: COLORS.inkSoft,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 400,
            textAlign: "center",
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          Sponsor a vulnerable child in Bangladesh.
        </div>

        {/* Footer mark — domain + a thin dividing line above. Helps
            the share preview read as "official site link" rather than
            "stock image". */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 60,
              height: 2,
              backgroundColor: COLORS.tangerineDeep,
              borderRadius: 1,
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: "system-ui, sans-serif",
              fontSize: 22,
              color: COLORS.tangerineDeeper,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            orphangive.org
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
