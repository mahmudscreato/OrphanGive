import type { NextRequest } from "next/server";
import { classifyAssetById } from "@/lib/asset-classifier";
import { getAdminSession } from "@/lib/admin-auth";
import { getDirectusSession } from "@/lib/di-auth";

// Session 52c — added `key` so registered Directus storage presets
// (`directus_settings.storage_asset_presets`) can be invoked through
// the proxy. The donor intake-photo gallery uses
// `?key=intake-locked` to fetch a server-blurred + downscaled
// variant for non-sponsor views (replaces Session 52b's CSS-only
// blur which leaked the original image via right-click → Save As).
// Without this allow-list entry the param would be stripped and
// the upstream would serve the raw full-resolution image.
const TRANSFORM_PARAMS = [
  "width",
  "height",
  "quality",
  "format",
  "fit",
  "key",
] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !ID_PATTERN.test(id)) {
    return new Response("Invalid asset id", { status: 403 });
  }

  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!base || !token) {
    return new Response("Asset proxy not configured", { status: 500 });
  }

  // P1.5 — classify the asset BEFORE forwarding to upstream. Public
  // photos and child-moment videos serve openly (D4). Private
  // documents (PDFs / scanned-image birth certificates etc.) require
  // an admin or DI session — they MUST NOT be reachable by anyone
  // who happens to have the UUID. See src/lib/asset-classifier.ts
  // for the classification rules.
  const classification = await classifyAssetById(id);
  if (classification.classification === "private") {
    // Non-throwing lookups — neither helper redirects.
    const [adminSession, diSession] = await Promise.all([
      getAdminSession(),
      getDirectusSession(),
    ]);
    if (!adminSession && !diSession) {
      // 401 (not 403) so a client trying to display a thumbnail can
      // distinguish "asset doesn't exist" from "needs auth". Body
      // text is generic — never expose the classifier's reason.
      return new Response("Authentication required", { status: 401 });
    }
  }

  const upstream = new URL(`${base.replace(/\/$/, "")}/assets/${id}`);
  // Track whether we forwarded any transform param. If yes, the
  // response is preset/transform-driven and may CHANGE between
  // deployments (e.g., a preset definition changes) — so we must
  // NOT mark it `immutable`. See cache-policy block below.
  let hasTransform = false;
  for (const key of TRANSFORM_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) {
      upstream.searchParams.set(key, value);
      hasTransform = true;
    }
  }

  // Forward the browser's Range header so videos can stream and seek.
  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const range = request.headers.get("range");
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  let response: Response;
  try {
    response = await fetch(upstream, { headers: upstreamHeaders });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (response.status === 404) {
    return new Response("Asset not found", { status: 404 });
  }
  if (response.status === 401 || response.status === 403) {
    return new Response("Asset forbidden", { status: 403 });
  }
  if (!response.ok && response.status !== 206) {
    return new Response("Upstream error", { status: 502 });
  }
  if (!response.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";

  // Build response headers: keep cache directives, surface range support.
  //
  // Session 52e — split cache policy by transform vs raw.
  //
  // Raw assets (no query params) are content-addressed by UUID and
  // truly never change, so `immutable, max-age=1y` is correct and
  // saves bandwidth.
  //
  // Transformed assets (?key=intake-locked, ?width=…, ?quality=…,
  // ?format=…, ?fit=…) depend on Directus's storage preset
  // definitions and global storage_asset_transform settings —
  // those CAN change between deployments. Pre-52d the
  // `intake-locked` preset wasn't registered so requests with
  // ?key=intake-locked returned the raw full-resolution image;
  // those responses got cached as `immutable` for a year. After
  // 52d registered the preset, the SAME URL now returns the
  // 1.6KB blurred variant, but the browser refuses to re-fetch
  // because of the immutable header. We've poisoned our own
  // cache. The fix:
  //   - drop `immutable` for transformed responses
  //   - shorten max-age so the browser revalidates within a day
  //   - keep raw-asset immutability as-is
  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": hasTransform
      ? "public, max-age=300, must-revalidate"
      : "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  // Forward content-length and content-range when present so the player
  // knows the total size and which byte slice it received.
  const contentLength = response.headers.get("content-length");
  if (contentLength) responseHeaders["Content-Length"] = contentLength;

  const contentRange = response.headers.get("content-range");
  if (contentRange) responseHeaders["Content-Range"] = contentRange;

  return new Response(response.body, {
    status: response.status === 206 ? 206 : 200,
    headers: responseHeaders,
  });
}