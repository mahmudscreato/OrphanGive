// Session 44 — Edit Child page.
//
// Server component. Pulls the editable snapshot for the child (with
// scope guard via getChildEditSnapshot) and pre-fills the shared
// ChildForm in 'edit' mode. The bd_division dropdown shows ALL eight
// divisions for edit (an existing child may already be in a division
// the DI isn't formally assigned to — we don't lock them out of
// fixing that record).
//
// 404s when the child is out of scope, via the route group's
// /di/(authed)/not-found.tsx (Session 43).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getBdDivisions, getChildEditSnapshot } from "@/lib/di-children";
import { ChildForm } from "@/components/di/ChildForm";

export const dynamic = "force-dynamic";

export default async function DiEditChildPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;

  const [child, divisions] = await Promise.all([
    getChildEditSnapshot(id, session.userId),
    getBdDivisions(),
  ]);
  if (!child) notFound();

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        href={`/di/children/${id}`}
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        {child.display_name || "Child"}
      </Link>

      {/* Header */}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          Edit profile
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Changes need admin approval before they go live.
        </p>
        <p className="mt-1 font-script italic text-[18px] text-tangerine-deeper">
          Take your time. Nothing changes until admin approves.
        </p>
      </header>

      <ChildForm mode="edit" divisions={divisions} existing={child} />
    </div>
  );
}
