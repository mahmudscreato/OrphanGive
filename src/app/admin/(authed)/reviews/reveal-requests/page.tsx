// fix/reveal-decision-loop — admin reveal-request review queue.
//
// Lists every PENDING donor information-access (reveal) request and lets
// any admin approve/deny each with a required reason. The (authed)
// layout already gates admin access. Shows WHICH field was requested —
// never the child's actual private value.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  listDecidedRevealRequests,
  listPendingRevealRequests,
} from "@/lib/reveal-data";
import {
  RevealRequestQueue,
  type RevealQueueItem,
} from "@/components/admin/RevealRequestQueue";
import { RevealRequestHistory } from "@/components/admin/RevealRequestHistory";

export const dynamic = "force-dynamic";

export default async function AdminRevealRequestsPage() {
  // feat/reveal-request-history — pending queue + decided history, in
  // parallel. The history is read-only (decision actions live on the queue).
  const [pending, decided] = await Promise.all([
    listPendingRevealRequests(),
    listDecidedRevealRequests(),
  ]);
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

      {/* feat/reveal-request-history — decided-request audit history below
          the pending queue. Read-only; most-recently-decided first; capped
          to the recent window listDecidedRevealRequests returns. Spans all
          donors (the admin audit view), by design. */}
      <section className="mt-10">
        <h2 className="font-display text-[18px] text-ink mb-1">
          Previous requests
        </h2>
        <p className="text-[13.5px] text-ink-soft mb-4">
          Approved and denied requests, most recent first
          {decided.length > 0 ? ` · showing ${decided.length}` : ""}.
        </p>
        <RevealRequestHistory requests={decided} />
      </section>
    </div>
  );
}
