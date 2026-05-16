// Session 48b — IntakePhotoGrid (client).
//
// Renders the 3-5 onboarding evidence photos for a child, with:
//   - Up to MAX_INTAKE_PHOTOS slots in a responsive grid
//   - Per-slot upload (POST /api/di/uploads/photo → POST /api/di/intake-photos)
//   - Per-slot caption input (PATCH on blur if changed)
//   - Per-slot remove (DELETE, with two-tap confirm)
//   - Native HTML5 drag-and-drop reorder (POST /reorder)
//   - Read-only display for approved/rejected/archived rows (DI can
//     only mutate own pending rows; admin's review is final)
//
// Why native HTML5 drag-and-drop instead of a library: keeps the
// dependency footprint flat for what is genuinely a small surface
// (max 5 items). Library candidates considered: dnd-kit (~30KB
// gz), react-dnd (~25KB gz). Both are overkill for a 5-slot grid.
//
// CREATE-mode caveat: child_intake_photo.child is NOT NULL at the
// schema layer. Create-mode child profiles don't have a child UUID
// until admin approves. When `childId` is empty/null this component
// renders a hint card explaining intake photos can be added after
// approval — no upload UI is shown.

"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  GripVertical,
  ImagePlus,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import { PHOTO_LIMITS } from "@/lib/di-photo-limits";
import type { IntakePhotoSummary } from "@/lib/di-intake-photos";

const MAX_INTAKE_PHOTOS = 5;
const RECOMMENDED_MIN = 3;

export interface IntakePhotoGridProps {
  childId: string | null;
  // Initial set rendered server-side (or fetched and hydrated by the
  // parent). The component manages its own copy after first render
  // so it can apply optimistic updates without round-tripping the
  // parent.
  initial: IntakePhotoSummary[];
}

interface DraftSlot extends IntakePhotoSummary {
  // Local, untracked caption-input state so we can debounce PATCH
  // until blur or explicit save.
  captionDraft: string;
  // Inline status indicators
  saving?: boolean;
  saveError?: string | null;
  // Two-tap confirm.
  confirmingDelete?: boolean;
}

function toDraftSlot(p: IntakePhotoSummary): DraftSlot {
  return { ...p, captionDraft: p.caption ?? "" };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function IntakePhotoGrid({ childId, initial }: IntakePhotoGridProps) {
  const [slots, setSlots] = useState<DraftSlot[]>(() =>
    // Sort once at init by displayOrder. After init, every mutation
    // (upload, reorder) maintains the order itself, so no derived
    // sort effect is needed.
    [...initial]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(toDraftSlot),
  );
  // Session 51.5 — inflight uploads. Each entry renders as a
  // placeholder card in the grid (showing the file name + spinner /
  // error). Cleared as each upload completes. We track per-file
  // status so a multi-file selection where one file fails (e.g.
  // a single PDF dropped into the JPEG-only intake-photo path)
  // shows the failed file by name without nuking the rest.
  type InflightUpload = {
    localId: string;
    fileName: string;
    error: string | null;
  };
  const [inflight, setInflight] = useState<InflightUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Drag-and-drop tracking. Holds the index of the slot currently
  // being dragged (for reorder); drop target reorders and clears.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Session 51.5 — file-drop tracking. Distinct from the reorder
  // dragIndex above because the source is the OS (dataTransfer.files
  // populated) rather than another slot card. We render the grid
  // container with a tangerine ring while dragOver to give visual
  // feedback that a drop will trigger upload.
  const [fileDragOver, setFileDragOver] = useState(false);

  // ─── CREATE-mode hint ──
  if (!childId) {
    return (
      <div className="rounded-2xl bg-amber-50/60 border border-amber-200 p-5">
        <div className="flex items-start gap-3">
          <ImagePlus
            className="w-5 h-5 text-amber-700 mt-0.5 shrink-0 stroke-[1.75]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[14px] text-amber-900 font-medium leading-snug">
              Intake photos open up after admin approves the new
              profile.
            </p>
            <p className="mt-1 text-[13px] text-amber-800 leading-relaxed">
              Submit this profile first. Once it&apos;s approved,
              you&apos;ll be able to upload 3–5 evidence photos from
              your initial visit on the child&apos;s edit page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Helpers ──
  const usedSlots = slots.length;
  const inflightCount = inflight.length;
  const totalSlots = usedSlots + inflightCount;
  const remainingCapacity = Math.max(0, MAX_INTAKE_PHOTOS - totalSlots);
  const canUploadMore = remainingCapacity > 0;
  const isUploading = inflightCount > 0;

  function pickFile() {
    fileInputRef.current?.click();
  }

  // Session 51.5 — per-file upload returning a result so the batch
  // can settle independently. Pre-allocates display_order so two
  // parallel uploads don't both append at the same slot index.
  async function uploadSingleAndRegister(
    file: File,
    localId: string,
    displayOrder: number,
  ): Promise<
    | { ok: true; photoId: string; fileUuid: string }
    | { ok: false; error: string }
  > {
    if (!childId) return { ok: false, error: "No child to attach to." };
    if (!(PHOTO_LIMITS.allowedTypes as readonly string[]).includes(file.type)) {
      return {
        ok: false,
        error: "Unsupported file type — JPEG, PNG, or WebP only.",
      };
    }
    if (file.size > PHOTO_LIMITS.maxBytes) {
      return {
        ok: false,
        error: `Too large — ${formatBytes(file.size)} (max ${formatBytes(PHOTO_LIMITS.maxBytes)}).`,
      };
    }

    // Step 1: file blob upload.
    let fileUuid: string;
    try {
      const fileForm = new FormData();
      fileForm.append("photo", file);
      const fileRes = await fetch("/api/di/uploads/photo", {
        method: "POST",
        body: fileForm,
      });
      if (!fileRes.ok) {
        if (fileRes.status === 413) return { ok: false, error: "Too large (max 5 MB)." };
        if (fileRes.status === 415) return { ok: false, error: "Unsupported file type." };
        if (fileRes.status === 401) return { ok: false, error: "Session expired." };
        return { ok: false, error: "Upload failed." };
      }
      const fileBody = (await fileRes.json()) as { fileUuid?: string };
      if (!fileBody.fileUuid) return { ok: false, error: "Server returned no file id." };
      fileUuid = fileBody.fileUuid;
    } catch {
      return { ok: false, error: "Network error during upload." };
    }

    // Step 2: register the intake-photo row.
    try {
      const createRes = await fetch("/api/di/intake-photos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId,
          photoUuid: fileUuid,
          displayOrder,
        }),
      });
      if (!createRes.ok) {
        if (createRes.status === 404) {
          return { ok: false, error: "This child is no longer in your scope." };
        }
        return { ok: false, error: "Couldn't save that photo." };
      }
      const created = (await createRes.json()) as { photoId?: string };
      if (!created.photoId) {
        return { ok: false, error: "Server returned no photo id." };
      }

      // On success: drop the inflight placeholder and append the
      // real slot. (Caller uses these returns to drive state.)
      setSlots((prev) => [
        ...prev,
        toDraftSlot({
          id: created.photoId!,
          childId,
          photoUrl: `/api/assets/${fileUuid}`,
          photoUuid: fileUuid,
          caption: null,
          displayOrder,
          status: "pending",
          uploadedAt: new Date().toISOString(),
          uploadedByUserId: null,
          isOwn: true,
          rejectionReason: null,
        }),
      ]);
      setInflight((prev) => prev.filter((u) => u.localId !== localId));
      return { ok: true, photoId: created.photoId, fileUuid };
    } catch {
      return { ok: false, error: "Network error saving the photo." };
    }
  }

  /**
   * Session 51.5 — multi-file batch upload. Used by both the file
   * picker (with `<input multiple>`) and drag-and-drop from the OS.
   * Pre-allocates display_orders, fans out via Promise.all, surfaces
   * a "max N reached" toast if the user selected more files than
   * remaining capacity allows.
   */
  async function handleUploadMany(files: File[]) {
    if (!childId || files.length === 0) return;
    setUploadError(null);

    // Capacity check: drop excess files past MAX_INTAKE_PHOTOS.
    const capacity = Math.max(
      0,
      MAX_INTAKE_PHOTOS - slots.length - inflight.length,
    );
    if (capacity === 0) {
      setUploadError(`Maximum ${MAX_INTAKE_PHOTOS} intake photos per child.`);
      return;
    }
    const accepted = files.slice(0, capacity);
    const rejectedCount = files.length - accepted.length;
    if (rejectedCount > 0) {
      setUploadError(
        `Maximum ${MAX_INTAKE_PHOTOS} intake photos per child — uploaded the first ${accepted.length}, skipped ${rejectedCount}.`,
      );
    }

    // Pre-allocate display orders so parallel inserts don't collide.
    const startOrder =
      slots.length > 0
        ? Math.max(...slots.map((s) => s.displayOrder)) + 1
        : 0;

    // Stage all inflight placeholders in one render.
    const stamped = accepted.map((file, i) => ({
      file,
      localId: `inflight-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      displayOrder: startOrder + i,
    }));
    setInflight((prev) => [
      ...prev,
      ...stamped.map(({ localId, file }) => ({
        localId,
        fileName: file.name || "photo",
        error: null,
      })),
    ]);

    // Fan out uploads in parallel. Each call mutates state on success
    // (drops the placeholder, appends a real slot) or on failure
    // (marks the placeholder with an error message for visibility).
    const results = await Promise.all(
      stamped.map(({ file, localId, displayOrder }) =>
        uploadSingleAndRegister(file, localId, displayOrder).then((r) => ({
          localId,
          fileName: file.name,
          ...r,
        })),
      ),
    );

    // For any failures, leave the placeholder with the error text;
    // the user dismisses by re-trying (which uploads a fresh entry).
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      setInflight((prev) =>
        prev.map((u) => {
          const fail = failures.find((f) => f.localId === u.localId);
          if (!fail) return u;
          return { ...u, error: fail.ok ? null : fail.error };
        }),
      );
    }
  }

  function dismissFailedInflight(localId: string) {
    setInflight((prev) => prev.filter((u) => u.localId !== localId));
  }

  async function handleCaptionBlur(slot: DraftSlot) {
    const newCaption = slot.captionDraft.trim();
    const oldCaption = slot.caption?.trim() ?? "";
    if (newCaption === oldCaption) return;
    if (newCaption.length > 200) {
      // Reject locally — server will reject too but instant feedback
      // matters here.
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? { ...s, saveError: "Caption max 200 characters." }
            : s,
        ),
      );
      return;
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id ? { ...s, saving: true, saveError: null } : s,
      ),
    );
    try {
      const res = await fetch(`/api/di/intake-photos/${slot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caption: newCaption || null }),
      });
      if (!res.ok) {
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id
              ? { ...s, saving: false, saveError: "Save failed." }
              : s,
          ),
        );
        return;
      }
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? {
                ...s,
                saving: false,
                saveError: null,
                caption: newCaption || null,
                captionDraft: newCaption,
              }
            : s,
        ),
      );
    } catch {
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? { ...s, saving: false, saveError: "Save failed." }
            : s,
        ),
      );
    }
  }

  async function handleDelete(slot: DraftSlot) {
    // Two-tap confirm.
    if (!slot.confirmingDelete) {
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id ? { ...s, confirmingDelete: true } : s,
        ),
      );
      window.setTimeout(() => {
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id ? { ...s, confirmingDelete: false } : s,
          ),
        );
      }, 4000);
      return;
    }
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slot.id ? { ...s, saving: true } : s,
      ),
    );
    try {
      const res = await fetch(`/api/di/intake-photos/${slot.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id
              ? { ...s, saving: false, saveError: "Delete failed." }
              : s,
          ),
        );
        return;
      }
      setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    } catch {
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slot.id
            ? { ...s, saving: false, saveError: "Delete failed." }
            : s,
        ),
      );
    }
  }

  // ─── File-drop from OS (Session 51.5) ──
  // Distinct from the slot-card reorder drag below: file drops have
  // `dataTransfer.files.length > 0`. The grid wrapper handles these;
  // slot cards handle the in-grid reorder. The two coexist because
  // their drop targets and dataTransfer shapes don't collide.
  function onGridDragOver(e: React.DragEvent) {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    setFileDragOver(true);
  }
  function onGridDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setFileDragOver(false);
  }
  function onGridDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setFileDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void handleUploadMany(files);
  }

  // ─── Reorder ──
  function onDragStart(idx: number) {
    setDragIndex(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setDragOverIndex(idx);
  }

  function onDragLeave() {
    setDragOverIndex(null);
  }

  async function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (from === null || from === idx) return;

    // Reorder the local array.
    const reordered = [...slots];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(idx, 0, moved);
    // Re-stamp displayOrder by index; only own/pending rows will
    // accept the change server-side, so we filter to those for the
    // POST body.
    const stamped = reordered.map((s, i) => ({ ...s, displayOrder: i }));
    setSlots(stamped);

    const eligible = stamped.filter((s) => s.isOwn && s.status === "pending");
    if (eligible.length === 0) return;
    try {
      await fetch("/api/di/intake-photos/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ordered: eligible.map((s) => ({
            id: s.id,
            displayOrder: s.displayOrder,
          })),
        }),
      });
      // We don't surface a specific error UI for reorder fails; the
      // visible order will diverge from server, but it self-corrects
      // on next page load. Silent retry would be nicer but not in
      // scope for V1.
    } catch {
      // Same — silent. Captured in console below.
      console.warn("[IntakePhotoGrid] reorder POST failed");
    }
  }

  // ─── Render ──
  return (
    <div>
      {/* Header strip with count + add button */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          {usedSlots} of {MAX_INTAKE_PHOTOS} added
          {usedSlots < RECOMMENDED_MIN ? (
            <span className="text-amber-700 font-medium">
              {" "}
              · we recommend at least {RECOMMENDED_MIN}
            </span>
          ) : null}
        </p>
        {canUploadMore ? (
          <button
            type="button"
            onClick={pickFile}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[13px] font-medium hover:bg-tangerine-mist/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            )}
            {isUploading
              ? `Uploading ${inflightCount}…`
              : remainingCapacity === MAX_INTAKE_PHOTOS
                ? "Add photos"
                : `Add up to ${remainingCapacity} more`}
          </button>
        ) : null}
      </div>

      {uploadError ? (
        <p className="mb-3 text-[13px] text-amber-800">{uploadError}</p>
      ) : null}

      {/* Hidden file input — `multiple` enables OS-level multi-pick.
          Session 51.5: previously a single-file picker; now the user
          can shift-click / cmd-click a batch and we fan out uploads
          via Promise.all up to the remaining capacity. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = ""; // allow re-pick of same files later
          if (files.length > 0) void handleUploadMany(files);
        }}
      />

      {/* Grid wrapper accepts OS file-drops (Session 51.5). The
          `fileDragOver` state gives a tangerine ring around the
          drop target so the user sees the affordance. Per-slot drag
          handlers inside still drive reorder — see the file-drop vs
          reorder distinction in onGridDragOver. */}
      {slots.length === 0 && inflight.length === 0 ? (
        <div
          onDragOver={onGridDragOver}
          onDragLeave={onGridDragLeave}
          onDrop={onGridDrop}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            fileDragOver
              ? "border-tangerine bg-tangerine-mist/30"
              : "border-stone-300"
          }`}
        >
          <ImagePlus
            className="w-10 h-10 text-stone-400 mx-auto mb-3 stroke-[1.5]"
            aria-hidden="true"
          />
          <p className="text-[14px] text-ink-soft leading-relaxed">
            No intake photos yet. Add 3–5 photos from your first visit
            so admin can verify the profile.
          </p>
          <p className="mt-2 text-[12px] text-ink-soft italic">
            Tap &quot;Add photos&quot; above, or drop files here.
          </p>
        </div>
      ) : (
        <div
          onDragOver={onGridDragOver}
          onDragLeave={onGridDragLeave}
          onDrop={onGridDrop}
          className={`grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl transition-colors ${
            fileDragOver ? "outline outline-2 outline-tangerine outline-offset-4" : ""
          }`}
        >
          {slots.map((slot, idx) => {
            const editable = slot.isOwn && slot.status === "pending";
            const isDragOver = dragOverIndex === idx;
            return (
              <div
                key={slot.id}
                draggable={editable}
                onDragStart={() => editable && onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, idx)}
                className={`relative rounded-2xl bg-white border ${
                  isDragOver
                    ? "border-tangerine ring-2 ring-tangerine-soft"
                    : "border-stone-200"
                } shadow-sm overflow-hidden flex flex-col`}
              >
                {/* Drag handle (only for editable rows) */}
                {editable ? (
                  <div
                    className="absolute top-2 left-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/85 backdrop-blur text-stone-500 cursor-grab active:cursor-grabbing"
                    aria-label="Drag to reorder"
                  >
                    <GripVertical
                      className="w-4 h-4 stroke-[1.75]"
                      aria-hidden="true"
                    />
                  </div>
                ) : null}

                {/* Status pill for non-pending */}
                {slot.status !== "pending" ? (
                  <div
                    className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                      slot.status === "approved"
                        ? "bg-moss-soft text-moss-deep"
                        : slot.status === "rejected"
                          ? "bg-[#FCE9E9] text-[#A02020]"
                          : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {slot.status === "approved" ? (
                      <CheckCircle2
                        className="w-3 h-3 stroke-[2]"
                        aria-hidden="true"
                      />
                    ) : slot.status === "rejected" ? (
                      <XCircle
                        className="w-3 h-3 stroke-[2]"
                        aria-hidden="true"
                      />
                    ) : null}
                    {slot.status}
                  </div>
                ) : null}

                {/* Photo */}
                <div className="relative aspect-square bg-tangerine-mist">
                  <Image
                    src={slot.photoUrl}
                    alt={slot.caption ?? "Intake photo"}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    unoptimized
                    className={`object-cover ${slot.saving ? "opacity-60" : ""}`}
                  />
                  {slot.saving ? (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Loader2 className="w-7 h-7 text-tangerine-deeper animate-spin" />
                    </div>
                  ) : null}
                </div>

                {/* Caption + remove */}
                <div className="p-2.5 space-y-1.5">
                  {editable ? (
                    <input
                      type="text"
                      value={slot.captionDraft}
                      onChange={(e) =>
                        setSlots((prev) =>
                          prev.map((s) =>
                            s.id === slot.id
                              ? {
                                  ...s,
                                  captionDraft: e.target.value,
                                  saveError: null,
                                }
                              : s,
                          ),
                        )
                      }
                      onBlur={() => void handleCaptionBlur(slot)}
                      maxLength={200}
                      placeholder="Short caption (optional)"
                      className="w-full rounded-lg border border-ink/[0.10] bg-white px-2.5 py-1.5 text-[12.5px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-1 focus:ring-tangerine-soft transition-colors"
                    />
                  ) : (
                    <p className="text-[12.5px] text-ink-soft leading-snug min-h-[20px]">
                      {slot.caption ?? <span className="italic">No caption</span>}
                    </p>
                  )}
                  {slot.saveError ? (
                    <p className="text-[11px] text-[#D04848]">
                      {slot.saveError}
                    </p>
                  ) : null}

                  {editable ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(slot)}
                      disabled={slot.saving}
                      className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${
                        slot.confirmingDelete
                          ? "text-[#D04848]"
                          : "text-stone-500 hover:text-[#D04848]"
                      } transition-colors disabled:opacity-50`}
                    >
                      <Trash2
                        className="w-3.5 h-3.5 stroke-[1.75]"
                        aria-hidden="true"
                      />
                      {slot.confirmingDelete ? "Tap again to remove" : "Remove"}
                    </button>
                  ) : slot.status === "rejected" && slot.rejectionReason ? (
                    <p className="text-[11.5px] text-[#A02020] leading-snug">
                      {slot.rejectionReason}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Session 51.5 — inflight upload placeholder cards. Each
              entry renders a dashed-border card with the file name
              and a spinner; on failure it shows the error + a
              dismiss button. Successful uploads have already moved
              themselves out of `inflight` and into `slots` by the
              time we render. */}
          {inflight.map((up) => (
            <div
              key={up.localId}
              className={`relative rounded-2xl border-2 border-dashed ${
                up.error
                  ? "border-[#F5C8C8] bg-[#FCE9E9]/60"
                  : "border-tangerine-soft bg-tangerine-mist/30"
              } overflow-hidden flex flex-col items-center justify-center aspect-square p-3 text-center`}
            >
              {up.error ? (
                <>
                  <p className="text-[12px] font-medium text-[#A02020] leading-snug break-words">
                    {up.fileName}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#A02020]/80 leading-snug">
                    {up.error}
                  </p>
                  <button
                    type="button"
                    onClick={() => dismissFailedInflight(up.localId)}
                    className="mt-2 text-[11px] font-medium text-[#A02020] hover:underline"
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <Loader2
                    className="w-7 h-7 text-tangerine-deeper animate-spin mb-2"
                    aria-hidden="true"
                  />
                  <p className="text-[12px] text-tangerine-deeper font-medium leading-snug break-words">
                    {up.fileName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tangerine-deeper/80">
                    Uploading…
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
