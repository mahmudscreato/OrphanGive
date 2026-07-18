// feat/reveal-request-history — admin "Previous requests" list.
//
// Read-only history of DECIDED donor information-access (reveal) requests,
// shown BELOW the pending queue on /admin/reviews/reveal-requests. Server
// component (pure display — no decision actions live here; the pending
// queue owns those). Most-recently-decided first.
//
// PRIVACY: mirrors the pending queue — shows WHICH field was requested (the
// allowlist label) + who asked + for which child + who decided + the
// recorded reason. NEVER the child's actual private value.
//
// This is the admin AUDIT view: it spans ALL donors by design (admins see
// every reveal decision). Not a donor-scoping change.

import { CheckCircle2, XCircle } from "lucide-react";
import type { DecidedRevealRequest } from "@/lib/reveal-data";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function RevealRequestHistory({
  requests,
}: {
  requests: DecidedRevealRequest[];
}) {
  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-stone-200 bg-white p-6 text-[14px] text-ink-soft italic">
        No decided requests yet. Approved and denied requests will appear here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => {
        const approved = r.decision === "approved";
        return (
          <li
            key={r.id}
            className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5"
          >
            <div className="flex items-start gap-4">
              <div
                className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl ${
                  approved
                    ? "bg-moss-soft text-moss-deep"
                    : "bg-[#FCE9E9] text-[#A02020]"
                }`}
              >
                {approved ? (
                  <CheckCircle2 className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
                ) : (
                  <XCircle className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <p className="font-display text-[16px] text-ink leading-snug">
                    {r.fieldLabel}
                    <span className="text-ink-soft font-body text-[14px]">
                      {" "}
                      for {r.childName}
                    </span>
                  </p>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-[10px] tracking-[0.12em] uppercase font-medium border ${
                      approved
                        ? "bg-moss-soft text-moss-deep border-moss/30"
                        : "bg-[#FCE9E9] text-[#A02020] border-[#A02B2B]/20"
                    }`}
                  >
                    {approved ? "Approved" : "Denied"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Requested by {r.donorName}
                  {r.donorEmail ? ` · ${r.donorEmail}` : ""} · {formatWhen(r.requestedAt)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {approved ? "Approved" : "Denied"} by{" "}
                  {r.decidedByName ?? "Unknown admin"} · {formatWhen(r.decidedAt)}
                </p>
                {r.donorReason ? (
                  <p className="mt-2 text-[13px] text-ink bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 leading-relaxed">
                    <span className="font-medium text-slate">Donor’s reason:</span>{" "}
                    {r.donorReason}
                  </p>
                ) : null}
                {r.adminNote ? (
                  <p className="mt-2 text-[13px] text-ink bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 leading-relaxed">
                    <span className="font-medium text-slate">
                      {approved ? "Approval note:" : "Reason given:"}
                    </span>{" "}
                    {r.adminNote}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default RevealRequestHistory;
