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

  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (response.status === 404) {
    return new Response("Asset not found", { status: 404 });
  }
  if (response.status === 401 || response.status === 403) {
    return new Response("Asset forbidden", { status: 403 });
  }
  if (!response.ok || !response.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
