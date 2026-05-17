// Session 44 — Photo upload field (client).
//
// Renders a preview + button. On file pick:
//   1. Client-side type/size check (instant feedback)
//   2. POST to /api/di/uploads/photo as multipart FormData
//   3. On 200, lift the new directus_files UUID via onUuidChange
//   4. Update preview to point at the new asset (via /api/assets/[uuid])
//
// The server re-validates type/size independently; this client check
// is purely UX — saves the user a wasted upload round-trip.

"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, Loader2, UserCircle2 } from "lucide-react";
import { PHOTO_LIMITS } from "@/lib/di-photo-limits";

export interface PhotoUploadFieldProps {
  currentPhotoUuid: string | null;
  onUuidChange: (uuid: string) => void;
  required?: boolean;
  // Optional inline error string surfaced from the parent form's
  // submit-time validation (separate from upload errors handled here).
  externalError?: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoUploadField({
  currentPhotoUuid,
  onUuidChange,
  required = false,
  externalError = null,
}: PhotoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUuid, setPreviewUuid] = useState<string | null>(
    currentPhotoUuid,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const previewUrl = previewUuid ? `/api/assets/${previewUuid}` : null;
  const hasPhoto = previewUrl !== null;

  function pick() {
    inputRef.current?.click();
  }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;

    // Client-side gates.
    if (!(PHOTO_LIMITS.allowedTypes as readonly string[]).includes(file.type)) {
      setUploadError(
        "That file type isn't supported. Please use JPEG, PNG, or WebP.",
      );
      return;
    }
    if (file.size > PHOTO_LIMITS.maxBytes) {
      setUploadError(
        `That image is ${formatBytes(file.size)} — too large. Please use one under ${formatBytes(
          PHOTO_LIMITS.maxBytes,
        )}.`,
      );
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/di/uploads/photo", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        // Friendly mapping from server status codes.
        if (res.status === 413) {
          setUploadError("That image is too large. Please use one under 5 MB.");
        } else if (res.status === 415) {
          setUploadError(
            "That file type isn't supported. Please use JPEG, PNG, or WebP.",
          );
        } else if (res.status === 401) {
          setUploadError("Your session expired. Please sign in again.");
        } else {
          setUploadError(
            "Upload failed. Please check your connection and try again.",
          );
        }
        return;
      }
      const body = (await res.json()) as { fileUuid?: string };
      if (!body.fileUuid) {
        setUploadError("Upload returned no file id. Please try again.");
        return;
      }
      setPreviewUuid(body.fileUuid);
      onUuidChange(body.fileUuid);
    } catch {
      setUploadError(
        "Upload failed. Please check your connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  const buttonLabel = hasPhoto ? "Change photo" : "Upload photo";
  const visibleError = uploadError || externalError;

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="shrink-0">
          {previewUrl ? (
            <div className="relative">
              <Image
                src={previewUrl}
                alt=""
                width={112}
                height={112}
                unoptimized
                className={`w-28 h-28 rounded-xl object-cover bg-tangerine-mist ${
                  uploading ? "opacity-60" : ""
                }`}
              />
              {uploading ? (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Loader2 className="w-8 h-8 text-tangerine-deeper animate-spin" />
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className="w-28 h-28 rounded-xl bg-tangerine-mist flex items-center justify-center text-tangerine-deeper"
              aria-hidden="true"
            >
              <UserCircle2 className="w-14 h-14 stroke-[1.25]" />
            </div>
          )}
        </div>

        {/* Action + helper */}
        <div className="flex-1 min-w-0 pt-1">
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[14px] font-medium hover:bg-tangerine-mist/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Camera className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            {uploading ? "Uploading…" : buttonLabel}
          </button>
          <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
            JPEG, PNG, or WebP. Up to 5&nbsp;MB.
            {required && !hasPhoto ? (
              <span className="block text-[#D04848] mt-1">
                A photo is required.
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        className="hidden"
        aria-hidden="true"
      />

      {visibleError ? (
        <p className="mt-2 text-[13px] text-[#D04848]">{visibleError}</p>
      ) : null}
    </div>
  );
}
