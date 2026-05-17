// Session 45 — Video upload field (client).
//
// Mirrors PhotoUploadField, but with three extra UX/safety steps:
//
//   1. Read the picked file's duration via a hidden <video> element
//      and the loadedmetadata event. This lets us reject too-long
//      clips BEFORE wasting bandwidth uploading them.
//   2. Pre-validate type + size + duration client-side.
//   3. POST to /api/di/uploads/video?duration=<seconds> so the route
//      can fast-fail on duration before parsing the multipart body.
//
// On success: lifts BOTH `fileUuid` and `durationSeconds` to the
// parent form (the form needs both for the moment payload).

"use client";

import { useRef, useState } from "react";
import { Loader2, Video, VideoOff } from "lucide-react";
import { VIDEO_LIMITS } from "@/lib/di-video-limits";

export interface VideoUploadFieldProps {
  onChange: (info: { fileUuid: string; durationSeconds: number } | null) => void;
  required?: boolean;
  externalError?: string | null;
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Reads <video> metadata to extract the duration. Resolves null if
// the browser can't decode (e.g. unsupported codec).
function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      v.src = "";
    };
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : null;
      cleanup();
      resolve(d);
    };
    v.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}

export function VideoUploadField({
  onChange,
  required = false,
  externalError = null,
}: VideoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileUuid, setUploadedFileUuid] = useState<string | null>(null);

  function pick() {
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // re-pick the same file later if needed
    if (!file) return;

    setUploadError(null);

    // Type + size gates first.
    if (!(VIDEO_LIMITS.allowedTypes as readonly string[]).includes(file.type)) {
      setUploadError(
        "That file type isn't supported. Please use MP4, WebM, or MOV.",
      );
      return;
    }
    if (file.size > VIDEO_LIMITS.maxBytes) {
      setUploadError(
        `That clip is ${formatBytes(file.size)} — too large. Please use one under ${formatBytes(VIDEO_LIMITS.maxBytes)}.`,
      );
      return;
    }

    // Read duration via metadata.
    setUploading(true);
    const duration = await readVideoDuration(file);
    if (duration === null) {
      setUploading(false);
      setUploadError(
        "Couldn't read this video's duration. Try a different format (MP4 works best).",
      );
      return;
    }
    if (duration > VIDEO_LIMITS.maxDurationSeconds) {
      setUploading(false);
      setUploadError(
        `Videos must be ${VIDEO_LIMITS.maxDurationSeconds} seconds or shorter. This clip is ${Math.round(
          duration,
        )}s. Please trim and try again.`,
      );
      return;
    }

    // Show preview immediately while we upload.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setPreviewDuration(duration);

    // Upload.
    try {
      const form = new FormData();
      form.append("video", file);
      const res = await fetch(
        `/api/di/uploads/video?duration=${encodeURIComponent(duration.toFixed(2))}`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        if (res.status === 413) {
          setUploadError("That video is too large. Maximum 50 MB.");
        } else if (res.status === 415) {
          setUploadError(
            "That file type isn't supported. Please use MP4, WebM, or MOV.",
          );
        } else if (res.status === 400) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (body.error === "video_too_long") {
            setUploadError(
              `Videos must be ${VIDEO_LIMITS.maxDurationSeconds} seconds or shorter.`,
            );
          } else {
            setUploadError("Upload failed validation. Please try again.");
          }
        } else if (res.status === 401) {
          setUploadError("Your session expired. Please sign in again.");
        } else {
          setUploadError("Upload failed. Please check your connection.");
        }
        return;
      }
      const body = (await res.json()) as {
        fileUuid?: string;
        durationSeconds?: number;
      };
      if (!body.fileUuid) {
        setUploadError("Upload returned no file id. Please try again.");
        return;
      }
      setUploadedFileUuid(body.fileUuid);
      onChange({
        fileUuid: body.fileUuid,
        durationSeconds: body.durationSeconds ?? duration,
      });
    } catch {
      setUploadError("Upload failed. Please check your connection.");
    } finally {
      setUploading(false);
    }
  }

  const visibleError = uploadError || externalError;

  return (
    <div>
      <div className="space-y-3">
        {previewUrl ? (
          <div className="relative aspect-video w-full bg-stone-900 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={previewUrl}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
            {uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            ) : null}
            {previewDuration !== null ? (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11.5px] font-mono">
                {Math.round(previewDuration)}s
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="aspect-video w-full rounded-xl bg-tangerine-mist flex flex-col items-center justify-center text-tangerine-deeper"
            aria-hidden="true"
          >
            <VideoOff className="w-12 h-12 stroke-[1.25]" />
            <span className="mt-2 text-[13px]">No video selected</span>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[14px] font-medium hover:bg-tangerine-mist/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Video className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            {uploading
              ? "Uploading…"
              : uploadedFileUuid
                ? "Replace video"
                : "Choose video"}
          </button>
          <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
            MP4, WebM, or MOV. Up to 60 seconds, 50 MB.
            {uploading ? (
              <span className="block mt-1 text-tangerine-deeper">
                Uploading… this can take 30–60s on slow networks.
              </span>
            ) : null}
            {required && !uploadedFileUuid ? (
              <span className="block text-[#D04848] mt-1">
                A video is required.
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={onFile}
        className="hidden"
        aria-hidden="true"
      />

      {visibleError ? (
        <p className="mt-2 text-[13px] text-[#D04848]">{visibleError}</p>
      ) : null}
    </div>
  );
}
