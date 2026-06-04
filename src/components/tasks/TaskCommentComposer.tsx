// Compose box for the internal task comment thread. Client component.
//
// Flow: pick optional image/PDF attachments → on send, upload each file
// to `uploadUrl` (returns a directus_files UUID), then POST the comment
// to `postUrl` with { body, fileUuids }, then router.refresh() so the
// server-rendered thread re-reads.
//
// Same upload mechanism + MIME/size limits as DI deliveries/documents
// (image/PDF only, 5 MB). Validated client-side for instant feedback;
// the upload route re-validates server-side.
//
// The author + role are derived server-side from the session — this
// composer never sends them.

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Send, X } from "lucide-react";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

export function TaskCommentComposer({
  postUrl,
  uploadUrl,
}: {
  postUrl: string;
  uploadUrl: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setError(null);
    const next: File[] = [...files];
    for (const f of Array.from(picked)) {
      if (!ALLOWED_MIME.has(f.type)) {
        setError(`"${f.name}" isn't an image or PDF.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`"${f.name}" is larger than 5 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadOne(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl, { method: "POST", body: fd });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 415) throw new Error(`"${file.name}" type not allowed.`);
      if (res.status === 413) throw new Error(`"${file.name}" is too large.`);
      throw new Error(data.error ?? `Upload failed for "${file.name}".`);
    }
    const data = (await res.json()) as { fileUuid?: string };
    if (!data.fileUuid) throw new Error(`Upload failed for "${file.name}".`);
    return data.fileUuid;
  }

  async function send() {
    const trimmed = body.trim();
    if (trimmed.length === 0 && files.length === 0) {
      setError("Write a note or attach a file.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      // 1. Upload attachments (sequential for clear per-file errors).
      const fileUuids: string[] = [];
      for (const f of files) {
        fileUuids.push(await uploadOne(f));
      }
      // 2. Post the comment.
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          fileUuids: fileUuids.length > 0 ? fileUuids : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.status === 503) {
          setError(
            "Comments aren't available yet — the comment table hasn't been set up.",
          );
        } else if (res.status === 401) {
          setError("Your session expired. Refresh and sign in.");
        } else if (res.status === 404) {
          setError("This task is no longer available to you.");
        } else {
          setError(data.message ?? data.error ?? "Couldn't post. Try again.");
        }
        setSending(false);
        return;
      }
      // Success — clear + refresh the server-rendered thread.
      setBody("");
      setFiles([]);
      setSending(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network issue. Try again.");
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder="Add an internal note for the team…"
        disabled={sending}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine focus:border-tangerine disabled:opacity-60"
      />

      {files.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-stone-200 pl-2.5 pr-1.5 py-1 text-[12px] text-ink"
            >
              <span className="max-w-[160px] truncate" title={f.name}>
                {f.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                disabled={sending}
                aria-label={`Remove ${f.name}`}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-ink-soft hover:bg-stone-100"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            disabled={sending}
            className="hidden"
            id="task-comment-file"
          />
          <label
            htmlFor="task-comment-file"
            className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-soft hover:bg-stone-100 cursor-pointer ${
              sending ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Paperclip className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            Attach image / PDF
          </label>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-full bg-tangerine-deep text-white px-4 py-1.5 text-[13px] font-medium hover:bg-tangerine-deeper transition-colors disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
          )}
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[12.5px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
