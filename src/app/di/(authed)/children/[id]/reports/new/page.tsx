// Session 45 — Submit report page.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById } from "@/lib/di-children";
import { ReportForm } from "@/components/di/ReportForm";

export const dynamic = "force-dynamic";

export default async function DiNewReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;
  const child = await getDiChildById(id, session.userId);
  if (!child) notFound();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href={`/di/children/${id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {child.display_name || "Child"}
      </Link>

      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Submit report
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          A note about how {child.display_name} is doing. Donors see this
          after admin approval.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Donors look forward to these.
        </p>
      </header>

      <ReportForm
        childId={id}
        childName={child.display_name || "this child"}
      />
    </div>
  );
}
