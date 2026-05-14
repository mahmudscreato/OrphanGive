// Session 44 — My Submissions page.
//
// Server component. Lists the DI's own proposals, with URL-driven
// status filter pills (All / Pending / Approved / Rejected).
//
// The spec mentioned Withdrawn and Expired filter pills; the
// production schema has no such status values (see di-proposals.ts
// header). Withdrawal is implemented as DELETE — the row is gone,
// not visible. Expiration isn't implemented at all; pruning is admin's
// job. Pills omitted accordingly.
//
// `?just_submitted=<id>` triggers a one-shot success banner via the
// JustSubmittedBanner client component.

import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireDiUser } from "@/lib/di-auth";
import {
  listProposalsForUser,
  type ProposalStatus,
} from "@/lib/di-proposals";
import { SubmissionCard } from "@/components/di/SubmissionCard";
import { JustSubmittedBanner } from "@/components/di/JustSubmittedBanner";

export const dynamic = "force-dynamic";

const FILTER_OPTIONS: ReadonlyArray<{
  value: "all" | ProposalStatus;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function isStatusFilter(
  v: string | undefined,
): v is "all" | ProposalStatus {
  return (
    v === "all" ||
    v === "pending" ||
    v === "approved" ||
    v === "rejected" ||
    v === "draft"
  );
}

export default async function DiSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; just_submitted?: string }>;
}) {
  const session = await requireDiUser();
  const sp = await searchParams;
  const filter: "all" | ProposalStatus = isStatusFilter(sp.status)
    ? sp.status
    : "all";
  const justSubmittedId =
    typeof sp.just_submitted === "string" && sp.just_submitted.length > 8
      ? sp.just_submitted
      : null;

  const proposals = await listProposalsForUser(session.userId, {
    status: filter === "all" ? undefined : filter,
  });

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-5xl mx-auto">
      {/* Header */}
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          My submissions
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Track what you&apos;ve sent for admin review.
        </p>
      </header>

      {justSubmittedId ? (
        <JustSubmittedBanner proposalId={justSubmittedId} />
      ) : null}

      {/* Filter pills */}
      <nav
        aria-label="Filter by submission status"
        className="mb-5 md:mb-6 flex gap-2 overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {FILTER_OPTIONS.map((f) => {
          const selected = f.value === filter;
          const href =
            f.value === "all"
              ? "/di/submissions"
              : `/di/submissions?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium transition-colors ${
                selected
                  ? "bg-tangerine text-white"
                  : "bg-white text-slate border border-stone-200 hover:border-tangerine-soft hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {/* Empty state */}
      {proposals.length === 0 ? (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-10 text-center">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tangerine-mist text-tangerine-deeper mb-4"
            aria-hidden="true"
          >
            <Inbox className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="font-display text-[20px] text-ink mb-2">
            {filter === "all"
              ? "No submissions yet."
              : `No ${filter} submissions.`}
          </p>
          <p className="text-[14.5px] text-ink-soft leading-relaxed max-w-md mx-auto">
            {filter === "all" ? (
              <>
                Edit a child or{" "}
                <Link
                  href="/di/children/new"
                  className="text-tangerine-deeper hover:underline font-medium"
                >
                  add a new one
                </Link>{" "}
                to send your first submission for admin review.
              </>
            ) : (
              <>
                Try{" "}
                <Link
                  href="/di/submissions"
                  className="text-tangerine-deeper hover:underline font-medium"
                >
                  All
                </Link>{" "}
                to see every submission.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <SubmissionCard key={p.id} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}
