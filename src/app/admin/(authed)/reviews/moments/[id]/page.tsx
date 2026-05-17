// Session 52b — Admin moment review detail.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, User2 } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getAdminMomentDetail } from "@/lib/admin-moments";
import { recordAuditEvent } from "@/lib/di-audit";
import { ReviewActionBar } from "@/components/admin/ReviewActionBar";

export const dynamic = "force-dynamic";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function AdminMomentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { id } = await params;
  if (!id) notFound();

  const moment = await getAdminMomentDetail(id);
  if (!moment) notFound();

  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_moment",
    collection: "child_moment",
    recordId: moment.id,
    metadata: {
      ...(moment.childId ? { childId: moment.childId } : {}),
      mediaType: moment.mediaType,
    },
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <Link
        href="/admin/reviews/moments?filter=pending"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All moments
      </Link>

      <header className="mb-6 md:mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6">
        <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight mb-2">
          Moment for {moment.childDisplayName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft mb-3">
          <span className="inline-flex items-center gap-1">
            <User2 className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            {moment.uploadedByName}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 stroke-[1.75]" aria-hidden="true" />
            Uploaded {formatTimestamp(moment.uploadedAt)}
          </span>
          {moment.takenAt ? (
            <span>Taken {formatDate(moment.takenAt)}</span>
          ) : null}
        </div>
        {moment.caption ? (
          <p className="text-[14.5px] text-ink leading-relaxed">
            {moment.caption}
          </p>
        ) : (
          <p className="text-[14.5px] italic text-ink-soft leading-relaxed">
            No caption.
          </p>
        )}
        {moment.status === "rejected" && moment.rejectionReason ? (
          <div className="mt-3 rounded-xl border border-[#A02B2B]/20 bg-[#FCE9E9] p-3 text-[13px] text-[#A02020]">
            <span className="font-semibold">Your prior rejection note:</span>{" "}
            {moment.rejectionReason}
          </div>
        ) : null}
      </header>

      <section
        className="mb-8 rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden"
        aria-label="Moment media"
      >
        {moment.fileUrl ? (
          moment.mediaType === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={moment.fileUrl}
              alt={moment.caption ?? "Moment photo"}
              className="w-full h-auto bg-stone-100"
            />
          ) : (
            <video
              src={moment.fileUrl}
              controls
              className="w-full h-auto bg-black"
            />
          )
        ) : (
          <div className="p-10 text-center text-[14px] text-ink-soft">
            This moment has no media attached.
          </div>
        )}
      </section>

      <ReviewActionBar
        approveUrl={`/api/admin/moments/${moment.id}/approve`}
        rejectUrl={`/api/admin/moments/${moment.id}/reject`}
        redirectTo="/admin/reviews/moments?filter=pending"
        entityNoun="moment"
        disabled={moment.status !== "pending"}
        disabledStatusLabel={moment.status}
      />
    </div>
  );
}
