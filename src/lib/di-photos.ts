// Session 44 — DI photo upload helper.
//
// Production `child.Photo` is M2O to directus_files. To avoid a
// second Cloudinary pipeline (and orphaned assets when proposals get
// rejected), DI uploads land in Directus directly via the admin
// token. The `child_proposal.Photo` column then references the new
// directus_files UUID; on approval, admin's flow copies the UUID
// onto the live `child.Photo` column.
//
// Folder placement:
//   - If env var DIRECTUS_DI_PENDING_FOLDER_ID is set, uploads land
//     in that folder. Recommended in production so the cleanup job
//     (deferred to Session 46) has a clear scope.
//   - If not set, uploads land at the directus_files root. Acceptable
//     for local dev where there are few files in the system.
//
// Validation:
//   - File type allowlist: image/jpeg, image/png, image/webp
//   - Size limit: 5 MB (chosen for Bangladesh mobile networks — avoids
//     long uploads on weaker connections; large enough for a typical
//     phone photo without compression). Server re-checks even though
//     the client gates first.

import "server-only";
import { DOCUMENT_LIMITS, PHOTO_LIMITS } from "./di-photo-limits";
import { VIDEO_LIMITS } from "./di-video-limits";

// Widen to ReadonlySet<string> so File.type (which is a generic
// string) can be has()-checked without a TS error.
const ALLOWED_TYPES: ReadonlySet<string> = new Set<string>(
  PHOTO_LIMITS.allowedTypes,
);
const MAX_BYTES = PHOTO_LIMITS.maxBytes;
const ALLOWED_VIDEO_TYPES: ReadonlySet<string> = new Set<string>(
  VIDEO_LIMITS.allowedTypes,
);
const MAX_VIDEO_BYTES = VIDEO_LIMITS.maxBytes;
const MAX_VIDEO_DURATION = VIDEO_LIMITS.maxDurationSeconds;
// Session 51.5 — Documents accept the photo allow-list PLUS PDF.
const ALLOWED_DOCUMENT_TYPES: ReadonlySet<string> = new Set<string>(
  DOCUMENT_LIMITS.allowedTypes,
);
const MAX_DOCUMENT_BYTES = DOCUMENT_LIMITS.maxBytes;

export class InvalidFileTypeError extends Error {
  readonly code = "invalid_file_type" as const;
  constructor(public readonly mime: string) {
    super(`Unsupported file type: ${mime}`);
    this.name = "InvalidFileTypeError";
  }
}

export class FileTooLargeError extends Error {
  readonly code = "file_too_large" as const;
  constructor(
    public readonly bytes: number,
    public readonly limitBytes: number = MAX_BYTES,
  ) {
    super(`File too large: ${bytes} bytes (max ${limitBytes})`);
    this.name = "FileTooLargeError";
  }
}

// Session 45 — video-specific error for the > 60s case. Distinct
// from FileTooLargeError so the route handler can map it to a
// friendlier "Videos must be 60 seconds or shorter" message.
export class VideoTooLongError extends Error {
  readonly code = "video_too_long" as const;
  constructor(
    public readonly seconds: number,
    public readonly limitSeconds: number = MAX_VIDEO_DURATION,
  ) {
    super(`Video too long: ${seconds}s (max ${limitSeconds}s)`);
    this.name = "VideoTooLongError";
  }
}

export class UploadFailedError extends Error {
  readonly code = "upload_failed" as const;
  constructor(public readonly cause?: unknown) {
    super(
      cause instanceof Error
        ? `Directus upload failed: ${cause.message}`
        : "Directus upload failed",
    );
    this.name = "UploadFailedError";
  }
}

function getDirectusUrl(): string {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!url) throw new Error("NEXT_PUBLIC_DIRECTUS_URL is not defined");
  return url;
}

function getAdminToken(): string {
  const token = process.env.DIRECTUS_SERVER_TOKEN;
  if (!token) throw new Error("DIRECTUS_SERVER_TOKEN is not defined");
  return token;
}

/**
 * Uploads a single image to Directus. Returns the directus_files UUID
 * suitable for storing on `child_proposal.Photo`.
 *
 * `uploadedByUserId` is captured in the file's `title` for traceability
 * but not enforced as ownership — admin can still review and re-assign.
 *
 * Implementation note: we use raw fetch + FormData rather than the SDK's
 * `uploadFiles` because in the App Router runtime FormData round-tripping
 * through the SDK's transport layer has had edge cases with file
 * boundaries; the raw `/files` endpoint is well-documented and stable.
 */
export async function uploadPhotoToDirectus(
  file: File,
  uploadedByUserId: string,
  // Session 52d — admin direct uploads land via the same Directus
  // endpoint; the title prefix changes so file titles read
  // "Admin upload by …" rather than the DI default.
  opts?: { titlePrefix?: string },
): Promise<{ fileUuid: string }> {
  // Type / size gates.
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new InvalidFileTypeError(file.type);
  }
  if (file.size > MAX_BYTES) {
    throw new FileTooLargeError(file.size);
  }

  const folderId = process.env.DIRECTUS_DI_PENDING_FOLDER_ID?.trim() || null;

  const form = new FormData();
  // Optional metadata fields go BEFORE the file so Directus's
  // multipart parser pulls them into the file row's attributes.
  if (folderId) form.append("folder", folderId);
  const titlePrefix = opts?.titlePrefix?.trim() || "DI upload by";
  form.append(
    "title",
    `${titlePrefix} ${uploadedByUserId} on ${new Date().toISOString()}`,
  );
  // The file field MUST be named "file" — Directus's REST contract.
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${getDirectusUrl()}/files`, {
      method: "POST",
      headers: {
        // No Content-Type header — fetch sets it with the right
        // boundary when given a FormData body.
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: form,
    });
  } catch (err) {
    throw new UploadFailedError(err);
  }

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = (await res.text()).slice(0, 500);
    } catch {
      // ignore
    }
    throw new UploadFailedError(
      new Error(`HTTP ${res.status}: ${errBody || res.statusText}`),
    );
  }

  let body: { data?: { id?: string } } = {};
  try {
    body = (await res.json()) as { data?: { id?: string } };
  } catch (err) {
    throw new UploadFailedError(err);
  }

  const fileUuid = body.data?.id;
  if (!fileUuid) {
    throw new UploadFailedError(new Error("No file id returned"));
  }
  return { fileUuid };
}

/**
 * Session 45 — uploads a single video clip to Directus. Same path as
 * uploadPhotoToDirectus (POST /files with admin token + optional
 * folder), with stricter type / size gates and an explicit duration
 * gate (the upload route handler has already read the duration from
 * the multipart query string and passed it in here).
 *
 * The stored file lives in directus_files alongside images. Distinction
 * lives at the consuming row's `media_type` column (child_moment).
 */
export async function uploadVideoToDirectus(
  file: File,
  uploadedByUserId: string,
  durationSeconds: number,
): Promise<{ fileUuid: string }> {
  // Type / size / duration gates. Server-authoritative — the client
  // VideoUploadField gates first for instant UX, but a malicious
  // client could bypass it by hitting the route directly.
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    throw new InvalidFileTypeError(file.type);
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new FileTooLargeError(file.size, MAX_VIDEO_BYTES);
  }
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > MAX_VIDEO_DURATION
  ) {
    throw new VideoTooLongError(durationSeconds);
  }

  const folderId = process.env.DIRECTUS_DI_PENDING_FOLDER_ID?.trim() || null;

  const form = new FormData();
  if (folderId) form.append("folder", folderId);
  form.append(
    "title",
    `DI video upload by ${uploadedByUserId} on ${new Date().toISOString()} (${Math.round(
      durationSeconds,
    )}s)`,
  );
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${getDirectusUrl()}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: form,
    });
  } catch (err) {
    throw new UploadFailedError(err);
  }

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = (await res.text()).slice(0, 500);
    } catch {
      // ignore
    }
    throw new UploadFailedError(
      new Error(`HTTP ${res.status}: ${errBody || res.statusText}`),
    );
  }

  let body: { data?: { id?: string } } = {};
  try {
    body = (await res.json()) as { data?: { id?: string } };
  } catch (err) {
    throw new UploadFailedError(err);
  }

  const fileUuid = body.data?.id;
  if (!fileUuid) {
    throw new UploadFailedError(new Error("No file id returned"));
  }
  return { fileUuid };
}

/**
 * Session 51.5 — uploads a single document file (image OR PDF) to
 * Directus. Mirror of uploadPhotoToDirectus with a wider MIME
 * allow-list (DOCUMENT_LIMITS.allowedTypes). Same folder routing,
 * same admin-token auth, same FormData shape.
 *
 * Why a separate function instead of a `mime allowlist` param on
 * uploadPhotoToDirectus: keeping the photo path strictly image-only
 * surfaces in error messaging ("not a photo" reads as a hard
 * intent) and means the intake-photos / moments / child-photo paths
 * can't accidentally accept a PDF via a forgotten parameter.
 */
export async function uploadDocumentToDirectus(
  file: File,
  uploadedByUserId: string,
  // Session 52d — see uploadPhotoToDirectus for rationale.
  opts?: { titlePrefix?: string },
): Promise<{ fileUuid: string }> {
  if (!ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    throw new InvalidFileTypeError(file.type);
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new FileTooLargeError(file.size, MAX_DOCUMENT_BYTES);
  }

  const folderId = process.env.DIRECTUS_DI_PENDING_FOLDER_ID?.trim() || null;

  const form = new FormData();
  if (folderId) form.append("folder", folderId);
  const titlePrefix = opts?.titlePrefix?.trim() || "DI document upload by";
  form.append(
    "title",
    `${titlePrefix} ${uploadedByUserId} on ${new Date().toISOString()}`,
  );
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${getDirectusUrl()}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAdminToken()}`,
      },
      body: form,
    });
  } catch (err) {
    throw new UploadFailedError(err);
  }

  if (!res.ok) {
    let errBody = "";
    try {
      errBody = (await res.text()).slice(0, 500);
    } catch {
      // ignore
    }
    throw new UploadFailedError(
      new Error(`HTTP ${res.status}: ${errBody || res.statusText}`),
    );
  }

  let body: { data?: { id?: string } } = {};
  try {
    body = (await res.json()) as { data?: { id?: string } };
  } catch (err) {
    throw new UploadFailedError(err);
  }

  const fileUuid = body.data?.id;
  if (!fileUuid) {
    throw new UploadFailedError(new Error("No file id returned"));
  }
  return { fileUuid };
}
