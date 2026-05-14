// Session 45 — single moment card.
//
// Server component. Renders an image (16:9 framed) or a video with
// native HTML5 controls; aspect-video preserves layout while loading.

import Image from "next/image";
import { StatusPill } from "./StatusPill";
import type { MomentSummary } from "@/lib/di-moments";

function formatLongDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function MomentCard({ moment }: { moment: MomentSummary }) {
  const taken = formatLongDate(moment.takenAt);

  return (
    <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden mb-3">
      {/* Media */}
      <div className="relative aspect-video bg-stone-900">
        {moment.mediaType === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={moment.mediaUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        ) : (
          <Image
            src={moment.mediaUrl}
            alt={moment.caption ?? "Moment"}
            fill
            unoptimized
            className="object-contain"
          />
        )}
        {moment.mediaType === "video" && moment.durationSeconds !== null ? (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11.5px] font-mono">
            {Math.round(moment.durationSeconds)}s
          </div>
        ) : null}
      </div>

      {/* Caption + meta */}
      <div className="p-4 space-y-2">
        {moment.caption ? (
          <p className="text-[15px] text-ink leading-relaxed">{moment.caption}</p>
        ) : (
          <p className="text-[14px] italic text-ink-soft">No caption.</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
          {taken ? <span>{taken}</span> : null}
          <span aria-hidden="true">·</span>
          <span>{moment.uploadedByName}</span>
          {moment.status !== "published" ? (
            <span className="ml-auto">
              <StatusPill kind={moment.status} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
