// Session 44 — DI photo upload constraints.
//
// Lives in its own (non-`server-only`) module so both the client
// PhotoUploadField (for instant pre-network feedback on oversized /
// wrong-type files) AND the server upload helper share one source
// of truth. The server helper enforces independently — the client
// gate is purely UX.

export const PHOTO_LIMITS = {
  // 5 MB — chosen for Bangladesh mobile networks. Big enough for a
  // typical phone photo at ~70% JPEG quality; small enough that even
  // a slow 3G upload completes in under a minute.
  maxBytes: 5 * 1024 * 1024,
  allowedTypes: ["image/jpeg", "image/png", "image/webp"] as const,
} as const;

export type AllowedPhotoMime = (typeof PHOTO_LIMITS.allowedTypes)[number];
