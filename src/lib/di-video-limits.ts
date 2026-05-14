// Session 45 — DI video upload constraints.
//
// Lives in its own (non-`server-only`) module so both the client
// VideoUploadField (for instant pre-network feedback) AND the server
// upload helper share one source of truth. The server helper enforces
// independently — the client gate is purely UX.

export const VIDEO_LIMITS = {
  // 50 MB. Big enough for 60s of decent-quality phone video; small
  // enough that a 3G upload finishes within 2-3 minutes. Server will
  // reject anything over.
  maxBytes: 50 * 1024 * 1024,
  // 60 seconds — moments are clips, not full videos. Donors browse
  // many; long videos kill the rhythm of the timeline.
  maxDurationSeconds: 60,
  allowedTypes: ["video/mp4", "video/webm", "video/quicktime"] as const,
} as const;

export type AllowedVideoMime = (typeof VIDEO_LIMITS.allowedTypes)[number];
