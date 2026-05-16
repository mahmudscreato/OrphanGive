// Session 52b — Per-child intake-photo batch detail page.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminUser } from "@/lib/admin-auth";
import { getIntakePhotosForChild } from "@/lib/admin-intake-photos";
import { recordAuditEvent } from "@/lib/di-audit";
import { IntakePhotoBatchReview } from "@/components/admin/IntakePhotoBatchReview";
import { readItems } from "@directus/sdk";
import { directusServer } from "@/lib/directus";

export const dynamic = "force-dynamic";

async function fetchChildDisplayName(childId: string): Promise<string | null> {
  try {
    const rows = (await directusServer().request(
      readItems("child" as never, {
        filter: { id: { _eq: childId } },
        fields: ["display_name"],
        limit: 1,
      } as never),
    )) as unknown as Array<{ display_name: string | null }> | undefined;
    return rows?.[0]?.display_name?.trim() ?? null;
  } catch {
    return null;
  }
}

export default async function AdminIntakePhotoBatchPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const session = await requireAdminUser();
  if (!session) notFound();
  const { childId } = await params;
  if (!childId) notFound();

  const [photos, childDisplayName] = await Promise.all([
    getIntakePhotosForChild(childId),
    fetchChildDisplayName(childId),
  ]);

  // No photos at all → 404. (If admin manually navigates after the
  // photos have been archived, this lands them in the not-found
  // path rather than an empty mystery page.)
  if (photos.length === 0) notFound();

  await recordAuditEvent({
    actorUserId: session.userId,
    actorRole: "admin",
    action: "admin_viewed_intake_photo_batch",
    collection: "child_intake_photo",
    recordId: childId, // batch-level: record_id = child id, not photo id
    metadata: { childId, photoCount: photos.length },
  });

  const label = childDisplayName ?? "Child";

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-4xl mx-auto">
      <Link
        href="/admin/reviews/intake-photos"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All intake-photo queues
      </Link>

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[24px] md:text-[28px] text-ink leading-tight tracking-tight">
          {label}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-soft leading-relaxed">
          Approve or reject each photo individually, then submit the
          batch. Per-photo notifications fire on submit.
        </p>
      </header>

      <IntakePhotoBatchReview
        childDisplayName={label}
        photos={photos}
      />
    </div>
  );
}
