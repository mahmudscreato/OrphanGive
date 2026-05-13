import Link from "next/link";
import { ProtectedChildImage } from "@/components/ui/ProtectedChildImage";
import { directusAssetUrl } from "@/lib/homepage-data";
import { formatTimeAgo, type ChildMoment } from "@/lib/dashboard-data";

// Single moment in the recent-updates timeline. Caption is line-clamped
// to 3 lines; if the row links anywhere it's the child's profile.
export function MomentRow({ moment }: { moment: ChildMoment }) {
  const photoSrc = directusAssetUrl(moment.photo);
  const childPhotoSrc = directusAssetUrl(moment.child_photo);
  const childName = moment.child_name ?? "A child";
  const when = formatTimeAgo(moment.taken_at ?? moment.date_created);

  return (
    <li className="rounded-[16px] bg-white border border-ink/[0.06] p-4 flex items-start gap-4 max-md:flex-col max-md:gap-3">
      {photoSrc ? (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-tangerine-mist shrink-0">
          <ProtectedChildImage
            src={photoSrc}
            alt={`Update photo of ${childName}`}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        </div>
      ) : childPhotoSrc ? (
        // Fall back to the child's portrait if the moment has no photo,
        // so the row never appears as a faceless block of text.
        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-tangerine-mist shrink-0">
          <ProtectedChildImage
            src={childPhotoSrc}
            alt={childName}
            width={160}
            height={160}
            quality={85}
            className="w-full h-full object-cover"
          />
        </div>
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          {moment.child_id ? (
            <Link
              href={`/children/${moment.child_id}`}
              className="font-display text-[18px] text-ink leading-tight hover:text-tangerine-deeper transition-colors"
            >
              {childName}
            </Link>
          ) : (
            <span className="font-display text-[18px] text-ink leading-tight">
              {childName}
            </span>
          )}
          {when ? (
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-slate-soft">
              · {when}
            </span>
          ) : null}
        </div>
        {moment.caption ? (
          <p className="mt-1 text-[14px] text-ink/80 leading-snug line-clamp-3">
            {moment.caption}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-slate-soft italic">
            New moment shared.
          </p>
        )}
      </div>
    </li>
  );
}

export default MomentRow;
