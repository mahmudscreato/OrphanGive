// P1.5 — asset proxy classifier.
//
// The `/api/assets/[uuid]` proxy fronts Directus's file store. Pre-
// P1.5 it served every UUID openly, which leaked private documents
// (birth certificates, NIDs uploaded as PDF or scanned images) to
// anyone who could obtain a UUID (e.g. shoulder-surfing an admin
// screen). Per founder decision D4, public child photos STAY open
// (Tier-1, guardian-consented, EXIF-stripped) — but private documents
// must be gated.
//
// This module is the policy:
//   - Tells the route handler whether a UUID is PUBLIC (serve openly)
//     or PRIVATE (require admin/DI session).
//   - Caches the classification per UUID for 5 minutes so we don't
//     hit Directus on every asset request once a UUID is hot.
//
// CLASSIFICATION RULES (priority order):
//   1. file.title contains "document upload"
//      → PRIVATE. Catches both PDF documents and image-format scanned
//        documents (birth certificates uploaded as PNG). The title
//        prefix is set by uploadDocumentToDirectus in
//        src/lib/di-photos.ts; it's the most reliable signal because
//        MIME alone can't distinguish a scanned birth cert (PNG)
//        from a child profile photo (also PNG).
//   2. MIME starts with `image/` or `video/`
//      → PUBLIC. Matches D4: photos / child moments stay open.
//   3. Anything else (PDF without doc-title prefix, octet-stream,
//      audio, etc.)
//      → PRIVATE. Defensive: PDF isn't a legitimate public-asset
//        format on this surface; the only PDFs we expect are docs.
//   4. Metadata fetch fails
//      → PRIVATE (fail-closed). Better to wrongly gate a public
//        asset (visible at the next cache miss after the upstream
//        recovers) than wrongly serve a private one.

import "server-only";

export type AssetClassification = "public" | "private";

export interface AssetClassifierResult {
  classification: AssetClassification;
  /** Reason — surfaced in logs / debug, not in the HTTP response. */
  reason: string;
  /** Upstream metadata snapshot if the lookup succeeded. */
  metadata?: { type: string | null; title: string | null };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache: Map<string, { result: AssetClassifierResult; expires: number }> =
  new Map();

interface DirectusFileMeta {
  id: string;
  type?: string | null;
  title?: string | null;
}

function classifyFromMeta(meta: DirectusFileMeta): AssetClassifierResult {
  const title = (meta.title ?? "").toLowerCase();
  const type = (meta.type ?? "").toLowerCase();

  if (title.includes("document upload")) {
    return {
      classification: "private",
      reason: "title-marked-document",
      metadata: { type: meta.type ?? null, title: meta.title ?? null },
    };
  }
  if (type.startsWith("image/") || type.startsWith("video/")) {
    return {
      classification: "public",
      reason: type.startsWith("image/") ? "image-mime" : "video-mime",
      metadata: { type: meta.type ?? null, title: meta.title ?? null },
    };
  }
  return {
    classification: "private",
    reason: `non-image-mime:${type || "unknown"}`,
    metadata: { type: meta.type ?? null, title: meta.title ?? null },
  };
}

/**
 * Look up a Directus file by UUID and classify it as PUBLIC or PRIVATE
 * per the rules at the top of this file.
 *
 * In-memory cached for {@link CACHE_TTL_MS}. On Directus error, fails
 * closed (private) so a transient outage doesn't leak documents.
 *
 * Caller is responsible for:
 *   - validating the UUID format BEFORE calling (this function does
 *     no input validation — it forwards whatever it gets);
 *   - handling the auth check when the result is private.
 */
export async function classifyAssetById(
  uuid: string,
): Promise<AssetClassifierResult> {
  // Cache hit?
  const now = Date.now();
  const hit = cache.get(uuid);
  if (hit && hit.expires > now) {
    return hit.result;
  }

  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!base || !token) {
    return {
      classification: "private",
      reason: "directus-not-configured",
    };
  }

  let result: AssetClassifierResult;
  try {
    const url = `${base.replace(/\/$/, "")}/files/${encodeURIComponent(uuid)}?fields=id,type,title`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      // Caller will hit the same 404 from the asset upstream — we
      // can safely mark this as private here so even if the route
      // never reaches the upstream the answer is fail-closed.
      result = {
        classification: "private",
        reason: "not-found",
      };
    } else if (!res.ok) {
      result = {
        classification: "private",
        reason: `lookup-failed-${res.status}`,
      };
    } else {
      const body = (await res.json().catch(() => null)) as {
        data?: DirectusFileMeta;
      } | null;
      const meta = body?.data;
      result = meta
        ? classifyFromMeta(meta)
        : { classification: "private", reason: "lookup-empty-body" };
    }
  } catch (err) {
    result = {
      classification: "private",
      reason: `lookup-threw:${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  cache.set(uuid, { result, expires: now + CACHE_TTL_MS });
  return result;
}

/**
 * Test helper — clears the in-memory cache. Production code should
 * never need to call this; the 5-minute TTL covers normal staleness.
 */
export function _clearAssetClassificationCache(): void {
  cache.clear();
}
