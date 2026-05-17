import type { NextRequest } from "next/server";

const TRANSFORM_PARAMS = ["width", "height", "quality", "format", "fit"] as const;
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

  const upstream = new URL(`${base.replace(/\/$/, "")}/assets/${id}`);
  for (const key of TRANSFORM_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) upstream.searchParams.set(key, value);
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
  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
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