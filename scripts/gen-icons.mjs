// Session 40 — one-off icon generator. Reads the source OG-branded
// favicon (centered logo on a tall canvas) and produces the three
// Next.js 16 App Router icon files at the conventional paths.
//
// Square crop strategy: sharp's `fit: "cover"` centers the source
// inside the target box and trims the longer dimension equally. The
// source is 1356x1918 (taller than wide), so 281px gets trimmed off
// the top + bottom — the logo art is centered in the canvas, so the
// trim removes vertical padding only.

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFile } from "node:fs/promises";

const SRC = "/tmp/og-favicon-source.png";
const APP_DIR = process.argv[2];
if (!APP_DIR) {
  console.error("usage: node gen-icons.mjs <app-dir>");
  process.exit(1);
}

async function makeSquarePng(size, outPath) {
  // `fit: "cover"` + `position: "center"` (default) → centered square crop.
  // `kernel: "lanczos3"` → highest-quality downsample sharp ships.
  await sharp(SRC)
    .resize(size, size, { fit: "cover", position: "center", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ✓ ${outPath} (${size}×${size})`);
}

async function makeIco(sizes, outPath) {
  // png-to-ico takes an array of PNG buffers, one per size. We render
  // each size from the source through sharp's lanczos3 downsample so
  // every entry in the multi-resolution .ico is sharp at its size,
  // not a downscaled-from-512 blur.
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(SRC)
        .resize(s, s, { fit: "cover", position: "center", kernel: "lanczos3" })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await pngToIco(buffers);
  await writeFile(outPath, ico);
  console.log(`  ✓ ${outPath} (sizes: ${sizes.join(", ")})`);
}

console.log("Generating icons from", SRC, "→", APP_DIR);
await makeSquarePng(512, `${APP_DIR}/icon.png`);
await makeSquarePng(180, `${APP_DIR}/apple-icon.png`);
await makeIco([16, 32, 48], `${APP_DIR}/favicon.ico`);
console.log("Done.");
