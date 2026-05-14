// Session 45 — Mark delivery page.
//
// Server component. In addition to the child scope check, fetches
// the active sponsorships via the redacted Session 43 path so the
// form can render the optional "link to sponsorship" dropdown without
// any donor PII leaking to the client.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import { getDiChildById, getDiChildSponsorships } from "@/lib/di-children";
import { DeliveryForm } from "@/components/di/DeliveryForm";

export const dynamic = "force-dynamic";

export default async function DiNewDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireDiUser();
  const { id } = await params;
  const child = await getDiChildById(id, session.userId);
  if (!child) notFound();

  const allSponsorships = (await getDiChildSponsorships(id, session.userId)) ?? [];
  // Only active sponsorships are linkable — paused/cancelled don't make
  // sense as "this delivery was funded by …".
  const activeSponsorships = allSponsorships.filter((s) => s.status === "active");

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
          Mark delivery
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Aid handed to the family. Photo evidence required. Admin
          verifies before it appears on donor receipts.
        </p>
      </header>

      <DeliveryForm
        childId={id}
        childName={child.display_name || "this child"}
        activeSponsorships={activeSponsorships}
      />
    </div>
  );
}
