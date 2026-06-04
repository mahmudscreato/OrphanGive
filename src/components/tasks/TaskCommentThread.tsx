// Internal task comment thread — shared by the admin + DI task detail
// pages. Server component: renders the chronological messages + their
// attachments. The composer (TaskCommentComposer) is a sibling client
// component the detail page renders below this.
//
// Attachments are served through the /api/assets/[uuid] proxy, which
// session-gates private files (comment attachments are uploaded with a
// "document upload" title marker → private). Image → inline thumbnail;
// PDF/other → file icon + filename. Each has Open + Download.
//
// INTERNAL: never rendered on any donor surface.

import { FileText, Paperclip } from "lucide-react";
import type {
  TaskCommentAttachmentView,
  TaskCommentView,
} from "@/lib/task-comments";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function assetHref(fileUuid: string): string {
  return `/api/assets/${fileUuid}`;
}

function Attachment({ a }: { a: TaskCommentAttachmentView }) {
  const href = assetHref(a.fileUuid);
  const label = a.filename || (a.isPdf ? "Document.pdf" : "Attachment");
  return (
    <div className="inline-flex flex-col gap-1.5 rounded-lg border border-stone-200 bg-white p-2 w-[140px]">
      {a.isImage ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={label}
            className="w-full h-24 object-cover rounded-md bg-stone-100"
          />
        </a>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-md border border-stone-200 bg-stone-50"
        >
          <FileText className="w-7 h-7 text-stone-400 stroke-[1.5]" aria-hidden="true" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-stone-400">
            {a.isPdf ? "PDF" : "File"}
          </span>
        </a>
      )}
      <span className="truncate text-[11px] text-ink-soft" title={label}>
        {label}
      </span>
      <div className="flex items-center gap-2 text-[11px]">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-tangerine-deeper hover:underline"
        >
          Open
        </a>
        <a
          href={href}
          download={a.filename || undefined}
          className="text-ink-soft hover:underline"
        >
          Download
        </a>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  currentUserId,
}: {
  comment: TaskCommentView;
  currentUserId?: string;
}) {
  const isAdmin = comment.authorRole === "admin";
  const isOwn =
    currentUserId != null && comment.authorId === currentUserId;
  const accent = isAdmin ? "border-l-tangerine" : "border-l-moss";
  const roleBadge = isAdmin
    ? "bg-tangerine-mist text-tangerine-deeper"
    : "bg-moss-soft text-moss-deep";
  return (
    <li
      className={`rounded-xl border border-stone-200 border-l-[3px] ${accent} bg-white p-3.5`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[13.5px] font-medium text-ink">
          {isOwn ? "You" : comment.authorName}
        </span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${roleBadge}`}
        >
          {isAdmin ? "Admin" : "DI"}
        </span>
        <span className="text-[11.5px] text-ink-soft">
          {formatWhen(comment.createdAt)}
        </span>
      </div>
      {comment.body ? (
        <p className="text-[14px] text-ink leading-relaxed whitespace-pre-line">
          {comment.body}
        </p>
      ) : null}
      {comment.attachments.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {comment.attachments.map((a) => (
            <Attachment key={a.id} a={a} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function TaskCommentThread({
  comments,
  currentUserId,
}: {
  comments: TaskCommentView[];
  currentUserId?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Paperclip
          className="w-4 h-4 text-ink-soft stroke-[1.75]"
          aria-hidden="true"
        />
        <h2 className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
          Internal notes ({comments.length})
        </h2>
      </div>
      <p className="text-[12px] text-ink-soft leading-relaxed mb-3">
        Private admin ↔ Data Inputter thread for this task. Not visible to
        donors.
      </p>
      {comments.length === 0 ? (
        <p className="text-[13px] italic text-ink-soft mb-3">
          No notes yet. Start the conversation below.
        </p>
      ) : (
        <ul className="space-y-2.5 mb-3">
          {comments.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
