// fix/reveal-decision-loop — admin decision queue for donor Tier-3
// information-access requests. Lists each PENDING reveal request and
// lets any admin approve (grants 90-day scoped access) or deny — both
// requiring a non-empty reason. Mirrors the other /admin/reviews/*
// list-plus-decision pattern.
//
// PRIVACY: this surface shows WHICH field was requested (the allowlist
// label) + who asked + for which child. It NEVER shows the child's
// actual private value — the admin decides on the request, not by
// viewing the secret.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Loader2, XCircle } from "lucide-react";
import { useBulkApprove } from "./bulk/useBulkApprove";
import { BulkApproveBar } from "./bulk/BulkApproveBar";
import { BulkConfirmDialog } from "./bulk/BulkConfirmDialog";

export interface RevealQueueItem {
  id: string;
  donorName: string;
  donorEmail: string;
  childName: string;
  fieldLabel: string;
  donorReason: string | null;
  requestedAt: string | null;
}

type DecisionKind = "approve" | "deny";

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

export function RevealRequestQueue({ requests }: { requests: RevealQueueItem[] }) {
  const router = useRouter();
  const [active, setActive] = useState<{ id: string; kind: DecisionKind } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // feat/admin-bulk-approve — CHILD-SAFETY SENSITIVE queue. Bulk approve
  // POSTs the SAME per-item route the inline Approve uses
  // (/api/admin/reveal/[id]/approve) once per selected request, with a
  // single shared reason — so approved_until, decided_by, the audit row,
  // and the donor email all fire per item exactly as a single approve.
  // An EXTRA confirmation step is required before it runs.
  const bulk = useBulkApprove();
  const [bulkConfirm, setBulkConfirm] = useState<{ ids: string[] } | null>(null);

  const allIds = requests.map((r) => r.id);
  const selectedIds = allIds.filter((id) => bulk.isSelected(id));
  const allSelected = allIds.length > 0 && selectedIds.length === allIds.length;

  function toggleAll() {
    if (allSelected) bulk.clear();
    else bulk.selectMany(allIds);
  }

  async function runBulk(reasonText?: string) {
    if (!bulkConfirm) return;
    const units = bulkConfirm.ids.map((id) => ({
      endpoints: [`/api/admin/reveal/${id}/approve`],
    }));
    setBulkConfirm(null);
    await bulk.run(units, { reason: reasonText ?? "" });
  }

  function begin(id: string, kind: DecisionKind) {
    setActive({ id, kind });
    setReason("");
    setError(null);
  }
  function cancel() {
    if (pending) return;
    setActive(null);
    setReason("");
    setError(null);
  }

  async function submit(id: string, kind: DecisionKind) {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Please give a brief reason (at least 3 characters).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reveal/${id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "unauthorized") {
          setError("Your admin session expired. Sign in again.");
        } else if (data.error === "conflict") {
          setError(data.message ?? "This request was already decided. Refresh.");
        } else {
          setError(data.message ?? "Couldn't save the decision. Try again.");
        }
        setPending(false);
        return;
      }
      // Success — the row leaves the pending list on refresh.
      setActive(null);
      setReason("");
      setPending(false);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border border-stone-200 bg-white p-6 text-[14px] text-ink-soft italic">
        No pending information-access requests. All clear.
      </p>
    );
  }

  return (
    <>
      <BulkApproveBar
        approvableCount={allIds.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onApproveSelected={() =>
          selectedIds.length > 0 && setBulkConfirm({ ids: selectedIds })
        }
        onApproveAll={() =>
          allIds.length > 0 && setBulkConfirm({ ids: allIds })
        }
        running={bulk.running}
        progress={bulk.progress}
        result={bulk.result}
        onDismissResult={bulk.dismissResult}
      />

      <ul className="space-y-3">
        {requests.map((r) => {
          const isActive = active?.id === r.id;
          return (
            <li
              key={r.id}
              className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5"
            >
              <div className="flex items-start gap-4">
                <label className="flex items-center pt-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulk.isSelected(r.id)}
                    onChange={() => bulk.toggle(r.id)}
                    disabled={bulk.running}
                    className="w-4 h-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft"
                    aria-label={`Select reveal request from ${r.donorName}`}
                  />
                </label>
                <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
                  <Eye className="w-5 h-5 stroke-[1.75]" aria-hidden="true" />
                </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-[16px] text-ink leading-snug">
                  {r.fieldLabel}
                  <span className="text-ink-soft font-body text-[14px]">
                    {" "}
                    for {r.childName}
                  </span>
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Requested by {r.donorName}
                  {r.donorEmail ? ` · ${r.donorEmail}` : ""} · {formatWhen(r.requestedAt)}
                </p>
                {r.donorReason ? (
                  <p className="mt-2 text-[13px] text-ink bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 leading-relaxed">
                    <span className="font-medium text-slate">Donor’s reason:</span>{" "}
                    {r.donorReason}
                  </p>
                ) : null}

                {!isActive ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => begin(r.id, "approve")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-moss text-white font-medium text-[13.5px] hover:bg-moss-deep transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => begin(r.id, "deny")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#A02B2B]/40 text-[#A02B2B] bg-white font-medium text-[13.5px] hover:bg-[#A02B2B]/[0.06] transition-colors"
                    >
                      <XCircle className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
                      Deny
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                    <label
                      htmlFor={`reason-${r.id}`}
                      className="block font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium mb-1.5"
                    >
                      {active.kind === "approve"
                        ? "Reason for approving (recorded)"
                        : "Reason for denying (shown to the donor)"}
                    </label>
                    <textarea
                      id={`reason-${r.id}`}
                      rows={3}
                      value={reason}
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={pending}
                      maxLength={1000}
                      autoFocus
                      placeholder={
                        active.kind === "approve"
                          ? "e.g. Long-term monthly sponsor; needs address to send a gift."
                          : "e.g. We don't share guardian contact details for safeguarding reasons."
                      }
                      className="w-full rounded-lg border border-ink/[0.14] bg-white px-3 py-2 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all disabled:opacity-60"
                    />
                    {error ? (
                      <p className="mt-1.5 text-[12.5px] text-[#A02B2B]" role="alert">
                        {error}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => submit(r.id, active.kind)}
                        disabled={pending}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium text-[13.5px] disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
                          active.kind === "approve"
                            ? "bg-moss hover:bg-moss-deep"
                            : "bg-[#A02B2B] hover:bg-[#8A2424]"
                        }`}
                      >
                        {pending ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : null}
                        {active.kind === "approve"
                          ? "Confirm approval"
                          : "Confirm denial"}
                      </button>
                      <button
                        type="button"
                        onClick={cancel}
                        disabled={pending}
                        className="text-[13.5px] text-slate hover:text-tangerine-deeper transition-colors disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
      </ul>

      <BulkConfirmDialog
        open={bulkConfirm !== null}
        sensitive
        title="Grant Tier-3 access in bulk"
        message={
          bulkConfirm
            ? `You're about to grant ${bulkConfirm.ids.length} Tier-3 information-access request${bulkConfirm.ids.length === 1 ? "" : "s"} — each gives a donor 90-day access to a private child field — WITHOUT reviewing each individually. The reason below is recorded on every one and emailed to each donor. Confirm.`
            : ""
        }
        confirmLabel={
          bulkConfirm ? `Grant ${bulkConfirm.ids.length}` : "Grant"
        }
        needsReason
        reasonPlaceholder="e.g. Long-term sponsors; standard address/guardian grants."
        pending={bulk.running}
        onConfirm={(reasonText) => runBulk(reasonText)}
        onCancel={() => setBulkConfirm(null)}
      />
    </>
  );
}
