// Session 52b — Reviews index.
//
// Lists the three live review queues + pending counts. Replaces the
// Session 51 placeholder. Click-through routes into each queue's
// dedicated list page.

import Link from "next/link";
import { ChevronRight, Camera, FileText, ImagePlus } from "lucide-react";
import { directusServer } from "@/lib/directus";
import { readItems } from "@directus/sdk";
import { DOCUMENT_PENDING_STATUS_VALUES } from "@/lib/admin-documents";

export const dynamic = "force-dynamic";

async function safeCount(
  collection: string,
  filter: Record<string, unknown>,
): Promise<number | null> {
  try {
    const rows = (await directusServer().request(
      readItems(collection as never, {
        filter,
        fields: ["id"],
        limit: -1,
      } as never),
    )) as unknown as Array<{ id: string }> | undefined;
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    console.warn(
      `[admin-reviews] count failed for ${collection}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export default async function AdminReviewsIndexPage() {
  const [pendingDocs, pendingIntake, pendingMoments] = await Promise.all([
    // Documents — Session 52c imports the shared pending values
    // from admin-documents so this counter, the home tile counter
    // (admin-home-stats), and the queue list filter all agree.
    safeCount("child_document", {
      status: { _in: [...DOCUMENT_PENDING_STATUS_VALUES] },
    }),
    safeCount("child_intake_photo", { status: { _eq: "pending" } }),
    safeCount("child_moment", { status: { _eq: "pending" } }),
  ]);

  const queues = [
    {
      href: "/admin/reviews/documents",
      label: "Documents",
      icon: FileText,
      description:
        "Birth certificates, NIDs, school recommendations. Verification trail.",
      count: pendingDocs,
    },
    {
      href: "/admin/reviews/intake-photos",
      label: "Intake photos",
      icon: ImagePlus,
      description:
        "Initial-visit evidence photos, grouped by child. Batch-review one child at a time.",
      count: pendingIntake,
    },
    {
      href: "/admin/reviews/moments",
      label: "Timeline moments",
      icon: Camera,
      description:
        "Ongoing life-update photos. Donors see these once you publish.",
      count: pendingMoments,
    },
  ];

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Reviews
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Three queues — pick a flavour to start triaging.
        </p>
      </header>

      <ul className="space-y-3">
        {queues.map((q) => {
          const Icon = q.icon;
          const countLabel =
            q.count === null
              ? "—"
              : q.count === 0
                ? "All clear"
                : `${q.count} pending`;
          return (
            <li key={q.href}>
              <Link
                href={q.href}
                className="group flex items-start gap-4 rounded-2xl bg-white border border-stone-200 shadow-sm p-5 transition-colors hover:border-tangerine-soft"
              >
                <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
                  <Icon className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-[18px] text-ink leading-snug">
                      {q.label}
                    </p>
                    <span
                      className={`text-[12px] font-medium ${
                        q.count && q.count > 0
                          ? "text-tangerine-deeper"
                          : "text-ink-soft"
                      }`}
                    >
                      {countLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-soft leading-relaxed">
                    {q.description}
                  </p>
                </div>
                <ChevronRight
                  className="w-4 h-4 mt-1.5 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
