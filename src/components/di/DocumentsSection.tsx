// Session 49 — DocumentsSection (client).
//
// Renders the four required Tier 3 verification documents (parent
// death cert, child birth cert, guardian NID, school recommendation)
// as one row per type. Per the brief:
//   - Each row shows: type label, current state (uploaded preview /
//     "Not uploaded yet"), upload button, optional notes field
//   - Status pill if uploaded (Pending / Approved / Rejected with reason)
//   - Replace button on uploaded docs (deletes pending, surfaces a
//     read-only state for approved/rejected/archived since DI can't
//     overwrite admin-reviewed rows)
//   - Tier 3 amber-left-border styling matching guardian phone fields
//
// Documents are OPTIONAL for both draft and submit. The parent form
// surfaces a soft warning above the submit button when any of the
// four types are missing — that warning logic lives in ChildForm
// (uses `missingTypes` prop emitted via onChange).
//
// CREATE-mode: child_document.child is NOT NULL at the schema layer.
// Same UX as IntakePhotoGrid — when childId is empty/null this
// renders a hint card explaining documents open up after admin
// approves the new profile. No upload UI shown.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
// Session 51.5 — documents accept PDFs in addition to images. The
// previous wiring reused PHOTO_LIMITS (images only), which caused
// every PDF upload to fail with a generic "Couldn't save that
// document" toast — both because the client allow-list rejected it
// and because the server /api/di/uploads/photo route gated on the
// photo allow-list too. Documents now uses DOCUMENT_LIMITS (+ PDF)
// and the sibling /api/di/uploads/document endpoint.
import { DOCUMENT_LIMITS } from "@/lib/di-photo-limits";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/form-constants";
import type { DocumentSummary } from "@/lib/di-documents";

export interface DocumentsSectionProps {
  childId: string | null;
  initial: DocumentSummary[];
  // Reports the current set of "missing" types up to the parent (a
  // type counts as missing when it has no pending or approved row).
  // The parent uses this to render the soft warning at submit time.
  onMissingChange?: (missing: DocumentType[]) => void;
}

interface SlotState {
  // For each document type, we render the most-recent non-archived
  // row if any. Status precedence for the visible row:
  //   1. pending (DI's most recent unsent)
  //   2. approved (verified)
  //   3. rejected (so DI sees the reason and can re-upload)
  visible: DocumentSummary | null;
  // Optimistic flags
  uploading: boolean;
  uploadError: string | null;
  // Notes draft (only relevant when visible is pending)
  notesDraft: string;
  notesSaving: boolean;
  notesError: string | null;
  confirmingDelete: boolean;
}

function blankSlot(): SlotState {
  return {
    visible: null,
    uploading: false,
    uploadError: null,
    notesDraft: "",
    notesSaving: false,
    notesError: null,
    confirmingDelete: false,
  };
}

function pickVisibleForType(
  all: DocumentSummary[],
  type: DocumentType,
): DocumentSummary | null {
  const ofType = all.filter((d) => d.documentType === type);
  if (ofType.length === 0) return null;
  // Precedence: pending → approved → rejected → archived. Within a
  // status bucket, newest first.
  const priority: Record<DocumentStatus, number> = {
    pending: 0,
    approved: 1,
    rejected: 2,
    archived: 3,
  };
  return [...ofType].sort((a, b) => {
    const p = priority[a.status] - priority[b.status];
    if (p !== 0) return p;
    const ta = a.uploadedAt ?? "";
    const tb = b.uploadedAt ?? "";
    return tb.localeCompare(ta);
  })[0];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsSection({
  childId,
  initial,
  onMissingChange,
}: DocumentsSectionProps) {
  // One slot per document type, pre-filled from the initial server
  // payload.
  const [slots, setSlots] = useState<Record<DocumentType, SlotState>>(() => {
    const out = {} as Record<DocumentType, SlotState>;
    for (const t of DOCUMENT_TYPES) {
      const visible = pickVisibleForType(initial, t);
      out[t] = {
        ...blankSlot(),
        visible,
        notesDraft: visible?.notes ?? "",
      };
    }
    return out;
  });

  // Report missing types up to parent on mount + every change.
  // Wrapped in queueMicrotask to satisfy the
  // react-hooks/set-state-in-effect lint rule (no synchronous
  // setState/onChange inside an effect body).
  useEffect(() => {
    if (!onMissingChange) return;
    const missing = DOCUMENT_TYPES.filter((t) => {
      const v = slots[t].visible;
      if (!v) return true;
      // pending or approved counts as "present"; rejected/archived
      // counts as missing (DI needs to re-upload to satisfy admin).
      return v.status === "rejected" || v.status === "archived";
    });
    queueMicrotask(() => onMissingChange(missing));
  }, [slots, onMissingChange]);

  // Per-type file input refs.
  const fileRefs = useRef<Record<DocumentType, HTMLInputElement | null>>(
    {} as Record<DocumentType, HTMLInputElement | null>,
  );

  // ─── CREATE-mode hint ──
  if (!childId) {
    return (
      <div className="rounded-2xl bg-amber-50/60 border border-amber-200 p-5">
        <div className="flex items-start gap-3">
          <FileText
            className="w-5 h-5 text-amber-700 mt-0.5 shrink-0 stroke-[1.75]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[14px] text-amber-900 font-medium leading-snug">
              Documents open up after admin approves the new profile.
            </p>
            <p className="mt-1 text-[13px] text-amber-800 leading-relaxed">
              Submit this profile first. Once it&apos;s approved,
              you&apos;ll be able to upload the four verification
              documents from the child&apos;s edit page. Submitting
              without documents is fine — admin will follow up.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Upload helper ──
  async function handleUpload(type: DocumentType, file: File) {
    if (!childId) return;
    if (!(DOCUMENT_LIMITS.allowedTypes as readonly string[]).includes(file.type)) {
      setSlots((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          uploadError:
            "That file type isn't supported. Please use PDF, JPEG, PNG, or WebP.",
        },
      }));
      return;
    }
    if (file.size > DOCUMENT_LIMITS.maxBytes) {
      setSlots((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          uploadError: `That file is ${formatBytes(file.size)} — too large. Please use one under ${formatBytes(DOCUMENT_LIMITS.maxBytes)}.`,
        },
      }));
      return;
    }

    setSlots((prev) => ({
      ...prev,
      [type]: { ...prev[type], uploading: true, uploadError: null },
    }));

    try {
      // Step 1: push file bytes to directus_files via the document
      // upload route (accepts images + PDFs). The form field is
      // `file` here (not `photo`) — matches /api/di/uploads/document
      // semantics.
      const fileForm = new FormData();
      fileForm.append("file", file);
      const fileRes = await fetch("/api/di/uploads/document", {
        method: "POST",
        body: fileForm,
      });
      if (!fileRes.ok) {
        let msg = "Upload failed. Please try again.";
        if (fileRes.status === 413) msg = "That file is too large. Please use one under 5 MB.";
        else if (fileRes.status === 415) msg = "That file type isn't supported.";
        else if (fileRes.status === 401) msg = "Your session expired. Please sign in again.";
        setSlots((prev) => ({
          ...prev,
          [type]: { ...prev[type], uploading: false, uploadError: msg },
        }));
        return;
      }
      const fileBody = (await fileRes.json()) as { fileUuid?: string };
      const fileUuid = fileBody.fileUuid;
      if (!fileUuid) {
        setSlots((prev) => ({
          ...prev,
          [type]: {
            ...prev[type],
            uploading: false,
            uploadError: "Upload returned no file id.",
          },
        }));
        return;
      }

      // Step 2: register the document row.
      const createRes = await fetch("/api/di/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId,
          documentType: type,
          fileUuid,
        }),
      });
      if (!createRes.ok) {
        const msg =
          createRes.status === 404
            ? "This child is no longer in your scope."
            : "Couldn't save that document. Please try again.";
        setSlots((prev) => ({
          ...prev,
          [type]: { ...prev[type], uploading: false, uploadError: msg },
        }));
        return;
      }
      const created = (await createRes.json()) as { documentId?: string };
      if (!created.documentId) {
        setSlots((prev) => ({
          ...prev,
          [type]: {
            ...prev[type],
            uploading: false,
            uploadError: "Server returned no document id.",
          },
        }));
        return;
      }

      // Optimistic insert. Synthesize what we know.
      const optimistic: DocumentSummary = {
        id: created.documentId,
        childId,
        documentType: type,
        documentTypeLabel: DOCUMENT_TYPE_LABELS[type],
        fileUuid,
        fileUrl: `/api/assets/${fileUuid}`,
        notes: null,
        status: "pending",
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: null,
        isOwn: true,
        rejectionReason: null,
      };
      setSlots((prev) => ({
        ...prev,
        [type]: {
          ...blankSlot(),
          visible: optimistic,
          notesDraft: "",
        },
      }));
    } catch {
      setSlots((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          uploading: false,
          uploadError: "Upload failed. Please check your connection.",
        },
      }));
    }
  }

  // ─── Notes save (PATCH on blur) ──
  async function handleNotesBlur(type: DocumentType) {
    const slot = slots[type];
    const visible = slot.visible;
    if (!visible || visible.status !== "pending" || !visible.isOwn) return;
    const newNotes = slot.notesDraft.trim();
    const oldNotes = visible.notes?.trim() ?? "";
    if (newNotes === oldNotes) return;
    if (newNotes.length > 1000) {
      setSlots((prev) => ({
        ...prev,
        [type]: { ...prev[type], notesError: "Notes max 1000 characters." },
      }));
      return;
    }

    setSlots((prev) => ({
      ...prev,
      [type]: { ...prev[type], notesSaving: true, notesError: null },
    }));
    try {
      const res = await fetch(`/api/di/documents/${visible.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: newNotes || null }),
      });
      if (!res.ok) {
        setSlots((prev) => ({
          ...prev,
          [type]: { ...prev[type], notesSaving: false, notesError: "Save failed." },
        }));
        return;
      }
      setSlots((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          notesSaving: false,
          notesError: null,
          visible: { ...visible, notes: newNotes || null },
          notesDraft: newNotes,
        },
      }));
    } catch {
      setSlots((prev) => ({
        ...prev,
        [type]: { ...prev[type], notesSaving: false, notesError: "Save failed." },
      }));
    }
  }

  // ─── Delete (two-tap confirm; pending only) ──
  async function handleDelete(type: DocumentType) {
    const slot = slots[type];
    const visible = slot.visible;
    if (!visible || visible.status !== "pending" || !visible.isOwn) return;

    if (!slot.confirmingDelete) {
      setSlots((prev) => ({
        ...prev,
        [type]: { ...prev[type], confirmingDelete: true },
      }));
      window.setTimeout(() => {
        setSlots((prev) => ({
          ...prev,
          [type]: { ...prev[type], confirmingDelete: false },
        }));
      }, 4000);
      return;
    }

    setSlots((prev) => ({
      ...prev,
      [type]: { ...prev[type], notesSaving: true },
    }));
    try {
      const res = await fetch(`/api/di/documents/${visible.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setSlots((prev) => ({
          ...prev,
          [type]: { ...prev[type], notesSaving: false, notesError: "Delete failed." },
        }));
        return;
      }
      setSlots((prev) => ({ ...prev, [type]: blankSlot() }));
    } catch {
      setSlots((prev) => ({
        ...prev,
        [type]: { ...prev[type], notesSaving: false, notesError: "Delete failed." },
      }));
    }
  }

  // ─── Render ──
  return (
    <div className="space-y-3">
      {DOCUMENT_TYPES.map((type) => {
        const slot = slots[type];
        const visible = slot.visible;
        const editable =
          !!visible && visible.status === "pending" && visible.isOwn;
        return (
          <div
            key={type}
            className="relative pl-3 border-l-[3px] border-amber-300/70"
          >
            {/* Tier-3 banner pill — same treatment as guardian phone */}
            <div className="mb-1.5 flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Internal only
              </span>
              {visible ? (
                <StatusPill status={visible.status} />
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-600 border border-stone-200">
                  Not uploaded yet
                </span>
              )}
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-start gap-4">
                {/* Preview / placeholder */}
                <div className="shrink-0">
                  {visible?.fileUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={visible.fileUrl}
                      alt=""
                      className={`w-20 h-20 rounded-lg object-cover bg-stone-100 ${
                        slot.uploading || slot.notesSaving ? "opacity-60" : ""
                      }`}
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <FileText className="w-7 h-7 text-stone-400 stroke-[1.5]" />
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14.5px] text-ink leading-snug">
                    {DOCUMENT_TYPE_LABELS[type]}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-soft leading-relaxed">
                    {visible
                      ? visible.status === "rejected" && visible.rejectionReason
                        ? `Rejected: ${visible.rejectionReason}`
                        : visible.status === "approved"
                          ? "Verified by admin."
                          : visible.status === "archived"
                            ? "Archived by admin."
                            : "Awaiting admin review."
                      : "PDF, JPEG, PNG, or WebP. Up to 5 MB."}
                  </p>

                  {/* Upload / replace button */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {!visible || visible.status === "rejected" || visible.status === "archived" ? (
                      <button
                        type="button"
                        onClick={() => fileRefs.current[type]?.click()}
                        disabled={slot.uploading}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-tangerine text-tangerine-deeper bg-white text-[13px] font-medium hover:bg-tangerine-mist/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {slot.uploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Camera className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
                        )}
                        {slot.uploading
                          ? "Uploading…"
                          : visible
                            ? "Re-upload"
                            : "Upload"}
                      </button>
                    ) : null}
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(type)}
                        disabled={slot.notesSaving}
                        className={`inline-flex items-center gap-1 text-[12px] font-medium ${
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
                    ) : null}
                  </div>

                  {slot.uploadError ? (
                    <p className="mt-2 text-[12.5px] text-[#D04848]">
                      {slot.uploadError}
                    </p>
                  ) : null}

                  {/* Notes input — only when there's a pending row */}
                  {editable ? (
                    <div className="mt-3">
                      <label
                        className="block font-mono text-[10px] tracking-[0.14em] uppercase text-slate font-medium mb-1"
                        htmlFor={`notes-${type}`}
                      >
                        Notes for admin (optional)
                      </label>
                      <textarea
                        id={`notes-${type}`}
                        rows={2}
                        maxLength={1000}
                        value={slot.notesDraft}
                        onChange={(e) =>
                          setSlots((prev) => ({
                            ...prev,
                            [type]: {
                              ...prev[type],
                              notesDraft: e.target.value,
                              notesError: null,
                            },
                          }))
                        }
                        onBlur={() => void handleNotesBlur(type)}
                        placeholder="e.g. Mother's name printed on line 3."
                        className="w-full rounded-lg border border-ink/[0.10] bg-white px-3 py-2 text-[13px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-1 focus:ring-tangerine-soft transition-colors"
                      />
                      {slot.notesError ? (
                        <p className="mt-1 text-[12px] text-[#D04848]">
                          {slot.notesError}
                        </p>
                      ) : null}
                    </div>
                  ) : visible?.notes ? (
                    <p className="mt-2 text-[12.5px] text-ink-soft italic">
                      Notes: {visible.notes}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Hidden file input per type */}
            <input
              ref={(el) => {
                fileRefs.current[type] = el;
              }}
              type="file"
              // Session 51.5 — added application/pdf so the OS file
              // picker actually shows PDFs as selectable. Previously
              // the only options were the three image MIMEs, forcing
              // users to flip the picker to "All files" and discover
              // PDFs after a failed upload.
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUpload(type, file);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: DocumentStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-moss-soft text-moss-deep border border-moss-soft">
        <CheckCircle2 className="w-3 h-3 stroke-[2]" aria-hidden="true" />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FCE9E9] text-[#A02020] border border-[#F5C8C8]">
        <XCircle className="w-3 h-3 stroke-[2]" aria-hidden="true" />
        Rejected
      </span>
    );
  }
  if (status === "archived") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-stone-100 text-stone-600 border border-stone-200">
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      <AlertTriangle className="w-3 h-3 stroke-[2]" aria-hidden="true" />
      Pending review
    </span>
  );
}
