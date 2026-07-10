// Admin direct intake-photo upload (per-child detail page).
//
// Single-card UI: pick a file, optional caption, submit. Posts to the
// EXISTING POST /api/admin/intake-photos (uploadDirectIntakePhoto),
// which lands the row as status='approved' with uploaded_by = admin
// and skips the DI review queue. Mirrors AdminDocumentDirectUpload's
// pattern (same file-handling / error UX), differing only in the
// image-only limits + the intake-photo slot cap.
//
// Slot cap: the DI IntakePhotoGrid enforces a soft client-side cap of
// MAX_INTAKE_PHOTOS = 5 per child (the server endpoint enforces none).
// We mirror that cap here so admin direct-upload can't push a child
// past the same ceiling — `currentCount` is the number of photos
// already on file (any status), matching how the DI grid counts all
// seeded slots.

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { PHOTO_LIMITS } from "@/lib/di-photo-limits";

// Mirrors MAX_INTAKE_PHOTOS in components/di/IntakePhotoGrid.tsx (that
// const is module-local there, not exported — kept in sync by hand).
const MAX_INTAKE_PHOTOS = 5;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminIntakePhotoDirectUpload({
  childId,
  childDisplayName,
  currentCount,
}: {
  childId: string;
  childDisplayName: string;
  currentCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, MAX_INTAKE_PHOTOS - currentCount);
  const atCapacity = remaining <= 0;

  function reset() {
    setFile(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    if (!(PHOTO_LIMITS.allowedTypes as readonly string[]).includes(f.type)) {
      setError("Unsupported file type — JPEG, PNG, or WebP only.");
      setFile(null);
      return;
    }
    if (f.size > PHOTO_LIMITS.maxBytes) {
      setError(
        `Too large — ${formatBytes(f.size)} (max ${formatBytes(PHOTO_LIMITS.maxBytes)}).`,
      );
      setFile(null);
      return;
    }
    setFile(f);
  }

  function onSubmit() {
    setError(null);
    setSuccess(null);
    if (atCapacity) {
      setError(`Maximum ${MAX_INTAKE_PHOTOS} intake photos per child.`);
      return;
    }
    if (!file) {
      setError("Pick a file.");
      return;
    }
    startTransition(async () => {
      try {
        const form = new FormData();
        form.append("photo", file);
        form.append("childId", childId);
        if (caption.trim().length > 0) form.append("caption", caption.trim());
        const res = await fetch("/api/admin/intake-photos", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          if (res.status === 413) {
            setError("File too large (max 5 MB).");
            return;
          }
          if (res.status === 415) {
            setError("Unsupported file type — JPEG, PNG, or WebP only.");
            return;
          }
          if (res.status === 401) {
            setError("Session expired.");
            return;
          }
          setError("Upload failed. Try again.");
          return;
        }
        setSuccess(`Uploaded intake photo for ${childDisplayName}.`);
        reset();
        router.refresh();
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  return (
    <section
      aria-label="Admin direct intake-photo upload"
      className="rounded-2xl bg-stone-50 border border-stone-200 p-4 md:p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[16px] text-ink leading-tight">
          Add an intake photo directly
        </h3>
        <span className="text-[12px] text-ink-soft shrink-0">
          {currentCount} of {MAX_INTAKE_PHOTOS} used
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
        Lands as approved immediately (skips the review queue). Use for
        site-visit photos admin took or received out-of-band.
      </p>

      {atCapacity ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
          This child already has the maximum of {MAX_INTAKE_PHOTOS} intake
          photos. Remove or request re-upload of an existing one to add
          another.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="admin-intake-caption"
              className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
            >
              Caption (optional)
            </label>
            <input
              id="admin-intake-caption"
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={pending}
              maxLength={200}
              placeholder="e.g. Home visit — March 2026"
              className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-hidden="true"
            onChange={onFileChange}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={pickFile}
              disabled={pending}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-stone-300 bg-white text-[13px] font-medium text-slate hover:border-tangerine hover:text-tangerine-deeper disabled:opacity-60 transition-colors"
            >
              <ImagePlus
                className="w-3.5 h-3.5 stroke-[1.75]"
                aria-hidden="true"
              />
              {file ? "Change file" : "Choose file"}
            </button>
            {file ? (
              <span className="text-[12.5px] text-ink-soft truncate">
                {file.name} · {formatBytes(file.size)}
              </span>
            ) : (
              <span className="text-[12.5px] text-ink-soft italic">
                No file chosen
              </span>
            )}
          </div>

          {error ? (
            <p className="text-[12.5px] text-[#A02020]" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-[12.5px] text-moss-deep" role="status">
              {success}
            </p>
          ) : null}

          <div className="pt-1">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !file}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Upload photo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
