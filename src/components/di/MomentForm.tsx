// Session 45 — Upload moment form (client).
//
// Pill toggle for media type at top: Photo | Video. The body swaps
// between PhotoUploadField and VideoUploadField. Submit assembles the
// payload and POSTs to /api/di/moments.
//
// On success: navigates back to the child detail page; the Moments
// tab's server fetch picks up the new pending row on reload.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";
import { Camera, Loader2, Video } from "lucide-react";
import { PhotoUploadField } from "./PhotoUploadField";
import { VideoUploadField } from "./VideoUploadField";

const inputClass =
  "w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60";
const textareaClass = `${inputClass} min-h-[100px] resize-y leading-relaxed`;
const labelClass =
  "block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5";
const helperClass = "mt-1.5 text-[12.5px] text-ink-soft leading-relaxed";
const errorClass = "mt-1.5 text-[12.5px] text-[#D04848]";

type MediaType = "image" | "video";

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function MomentForm({ childId }: { childId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [photoUuid, setPhotoUuid] = useState<string | null>(null);
  const [videoUuid, setVideoUuid] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [takenAt, setTakenAt] = useState(todayIso());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const captionLen = caption.length;

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (mediaType === "image" && !photoUuid) {
      e.media = "A photo is required.";
    }
    if (mediaType === "video" && (!videoUuid || videoDuration === null)) {
      e.media = "A video is required.";
    }
    if (!caption.trim()) e.caption = "Required.";
    if (caption.length > 200) e.caption = "Max 200 characters.";
    if (!takenAt) e.takenAt = "Required.";
    return e;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      try {
        const fileUuid = mediaType === "image" ? photoUuid! : videoUuid!;
        const body = {
          childId,
          caption: caption.trim(),
          takenAt,
          mediaType,
          fileUuid,
          ...(mediaType === "video"
            ? { durationSeconds: Math.round(videoDuration!) }
            : {}),
        };
        const res = await fetch("/api/di/moments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
            field?: string;
            message?: string;
          };
          if (errBody.error === "not_found") {
            setServerError(
              "This child isn't in your care anymore. Refresh and try again.",
            );
          } else if (errBody.error === "invalid_input" && errBody.field) {
            setErrors((e) => ({
              ...e,
              [errBody.field as string]: errBody.message ?? "Invalid value.",
            }));
          } else {
            setServerError(
              "Submission failed. Please try again in a moment.",
            );
          }
          return;
        }
        router.push(`/di/children/${childId}` as Route);
        router.refresh();
      } catch {
        setServerError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Media type tabs */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-4">
        <div role="tablist" aria-label="Media type" className="flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={mediaType === "image"}
            onClick={() => setMediaType("image")}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13.5px] font-medium transition-colors ${
              mediaType === "image"
                ? "bg-tangerine text-white"
                : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
            }`}
          >
            <Camera className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Photo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mediaType === "video"}
            onClick={() => setMediaType("video")}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13.5px] font-medium transition-colors ${
              mediaType === "video"
                ? "bg-tangerine text-white"
                : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
            }`}
          >
            <Video className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
            Video
          </button>
        </div>

        {mediaType === "image" ? (
          <PhotoUploadField
            currentPhotoUuid={photoUuid}
            onUuidChange={(uuid) => {
              setPhotoUuid(uuid);
              setErrors((e) => {
                const next = { ...e };
                delete next.media;
                return next;
              });
            }}
            required
            externalError={errors.media ?? null}
          />
        ) : (
          <VideoUploadField
            onChange={(info) => {
              if (info) {
                setVideoUuid(info.fileUuid);
                setVideoDuration(info.durationSeconds);
                setErrors((e) => {
                  const next = { ...e };
                  delete next.media;
                  return next;
                });
              } else {
                setVideoUuid(null);
                setVideoDuration(null);
              }
            }}
            required
            externalError={errors.media ?? null}
          />
        )}
      </div>

      {/* Caption + date */}
      <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5">
        <div>
          <label className={labelClass} htmlFor="caption">
            Caption
          </label>
          <textarea
            id="caption"
            className={textareaClass}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="A short line about this moment."
            disabled={pending}
            rows={3}
          />
          <p className={helperClass}>
            {captionLen}/200 characters.
          </p>
          {errors.caption ? (
            <p className={errorClass}>{errors.caption}</p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="takenAt">
            When was this taken?
          </label>
          <input
            id="takenAt"
            type="date"
            className={inputClass}
            value={takenAt}
            onChange={(e) => setTakenAt(e.target.value)}
            max={todayIso()}
            disabled={pending}
          />
          {errors.takenAt ? (
            <p className={errorClass}>{errors.takenAt}</p>
          ) : null}
        </div>
      </div>

      {serverError ? (
        <div className="rounded-xl border border-[#D04848]/30 bg-[#D04848]/[0.06] px-4 py-3 text-[13.5px] text-[#9A2424]">
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3 pt-2">
        <a
          href={`/di/children/${childId}`}
          className="text-center md:text-left text-[14px] text-slate hover:text-tangerine-deeper transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : null}
          Submit moment for approval
        </button>
      </div>
    </form>
  );
}
