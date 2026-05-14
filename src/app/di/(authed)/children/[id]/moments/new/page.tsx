// Session 45 — Upload moment page.
//
// Server component. Scope-guards via getDiChildById; 404s through the
// route group's not-found.tsx if the child isn't in the DI's care.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById } from "@/lib/di-children";
import { MomentForm } from "@/components/di/MomentForm";

export const dynamic = "force-dynamic";

export default async function DiNewMomentPage({
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
          Upload moment
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Photos or short videos from your visits. Admin reviews before
          donors see them.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          A small window into their day.
        </p>
      </header>

      <MomentForm childId={id} />
    </div>
  );
}
