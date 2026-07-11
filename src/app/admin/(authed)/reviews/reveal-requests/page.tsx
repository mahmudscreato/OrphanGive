// fix/reveal-decision-loop — admin reveal-request review queue.
//
// Lists every PENDING donor information-access (reveal) request and lets
// any admin approve/deny each with a required reason. The (authed)
// layout already gates admin access. Shows WHICH field was requested —
// never the child's actual private value.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { listPendingRevealRequests } from "@/lib/reveal-data";
import {
  RevealRequestQueue,
  type RevealQueueItem,
} from "@/components/admin/RevealRequestQueue";

export const dynamic = "force-dynamic";

export default async function AdminRevealRequestsPage() {
  const pending = await listPendingRevealRequests();
  const items: RevealQueueItem[] = pending.map((r) => ({
    id: r.id,
    donorName: r.donorName,
    donorEmail: r.donorEmail,
    childName: r.childName,
    fieldLabel: r.fieldLabel,
    donorReason: r.donorReason,
    requestedAt: r.requestedAt,
  }));

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <Link
        href="/admin/reviews"
        className="inline-flex items-center gap-1 text-[14px] text-slate hover:text-tangerine-deeper transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
        All reviews
      </Link>

      <AdminPageHeader
        title="Information-access requests"
        subtitle="Approve grants the donor 90-day scoped access to that one field. Both approve and deny require a reason."
      />

      <RevealRequestQueue requests={items} />
    </div>
  );
}
