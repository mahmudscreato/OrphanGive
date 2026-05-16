// Session 52d — Admin direct document upload (per-child workspace).
//
// Single-card UI: pick a document type, pick a file, submit. Lands
// the row as status='approved' immediately with uploaded_by = admin.
// Used on the per-child admin workspace (`/admin/reviews/intake-
// photos/[childId]`) so admin can fill in missing documents while
// they're already in the child's record.
//
// Allowed types come from DOCUMENT_TYPES (form-constants). The full
// set is shown — admin's authoritative, so the conditional
// parent-death-cert split that the DI form does is not enforced
// here (admin can record whatever matches the document on hand).

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Loader2 } from "lucide-react";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/lib/form-constants";

const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminDocumentDirectUpload({
  childId,
  childDisplayName,
}: {
  childId: string;
  childDisplayName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<DocumentType | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDocType("");
    setFile(null);
    setNotes("");
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
    if (!DOC_ALLOWED_TYPES.includes(f.type)) {
      setError("Unsupported file type — JPEG, PNG, WebP, or PDF only.");
      setFile(null);
      return;
    }
    if (f.size > DOC_MAX_BYTES) {
      setError(
        `Too large — ${formatBytes(f.size)} (max ${formatBytes(DOC_MAX_BYTES)}).`,
      );
      setFile(null);
      return;
    }
    setFile(f);
  }

  function onSubmit() {
    setError(null);
    setSuccess(null);
    if (!docType) {
      setError("Pick a document type.");
      return;
    }
    if (!file) {
      setError("Pick a file.");
      return;
    }
    startTransition(async () => {
      try {
        const form = new FormData();
        form.append("document", file);
        form.append("childId", childId);
        form.append("documentType", docType);
        if (notes.trim().length > 0) form.append("notes", notes.trim());
        const res = await fetch("/api/admin/documents", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          if (res.status === 413) {
            setError("File too large (max 10 MB).");
            return;
          }
          if (res.status === 415) {
            setError("Unsupported file type.");
            return;
          }
          if (res.status === 401) {
            setError("Session expired.");
            return;
          }
          setError("Upload failed. Try again.");
          return;
        }
        setSuccess(
          `Uploaded ${DOCUMENT_TYPE_LABELS[docType]} for ${childDisplayName}.`,
        );
        reset();
        router.refresh();
      } catch {
        setError("Network error. Try again.");
      }
    });
  }

  return (
    <section
      aria-label="Admin direct document upload"
      className="rounded-2xl bg-stone-50 border border-stone-200 p-4 md:p-5"
    >
      <h2 className="font-display text-[16px] text-ink leading-tight">
        Add a document directly
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-soft leading-relaxed">
        Lands as approved immediately (skips the review queue). Use
        for documents admin received out-of-band.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="admin-doc-type"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
          >
            Document type
          </label>
          <select
            id="admin-doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentType | "")}
            disabled={pending}
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          >
            <option value="">— Choose —</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="admin-doc-notes"
            className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
          >
            Notes (optional)
          </label>
          <input
            id="admin-doc-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={pending}
            maxLength={1000}
            placeholder="e.g. Received via email from district office"
            className="w-full rounded-xl border border-ink/[0.12] bg-white px-3 py-2 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all duration-150 disabled:opacity-60"
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
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
            <FilePlus className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
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
            disabled={pending || !docType || !file}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14px] hover:bg-tangerine-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            Upload document
          </button>
        </div>
      </div>
    </section>
  );
}
