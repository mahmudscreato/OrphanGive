import type { MetadataRoute } from "next";

// Web app manifest — primarily for Android "Add to Home Screen" / installable
// PWA, which pulls its install icon from here (not from <link> tags). iOS uses
// src/app/apple-icon.png; desktop browser tabs use favicon.ico + icon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrphanGive",
    short_name: "OrphanGive",
    description:
      "Sponsor a vulnerable or orphaned child in Bangladesh through verified profiles.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFAF2",
    theme_color: "#FFFAF2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
