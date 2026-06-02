"use client";

// Safeguarding report — lead controls (detail page). Founder/lead only;
// the page + API are both gated. Each control POSTs to the single update
// endpoint, which writes an audit_log row, then we refresh the server view.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RISK_LEVELS,
  RISK_LEVEL_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  type RiskLevel,
  type ReportStatus,
} from "@/lib/safeguarding-report-types";

type Props = {
  reportId: string;
  riskLevel: RiskLevel | null;
  status: ReportStatus | null;
  assignedTo: string | null;
  actionTaken: string | null;
  leadUserId: string;
};

export function SafeguardingReportActions({
  reportId,
  riskLevel,
  status,
  assignedTo,
  actionTaken,
  leadUserId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [action, setAction] = useState(actionTaken ?? "");
  const [error, setError] = useState<string | null>(null);

  async function send(label: string, body: Record<string, unknown>) {
    setError(null);
    setBusy(label);
    try {
      const res = await fetch(
        `/api/admin/safeguarding-reports/${reportId}/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        setError(`Update failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Update failed — network error.");
    } finally {
      setBusy(null);
    }
  }

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
      active
        ? "bg-ink text-cream border-ink"
        : "bg-white text-ink border-ink/15 hover:border-ink/40"
    }`;

  return (
    <div className="rounded-2xl border border-ink/[0.08] bg-white p-6 max-md:p-5 space-y-6">
      <h2 className="font-display text-lg text-ink">Lead controls</h2>

      {/* Risk level */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">
          Risk level <span className="text-ink-soft font-normal">(you set this)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {RISK_LEVELS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy !== null}
              onClick={() => send(`risk:${r}`, { field: "risk", value: r })}
              className={pill(riskLevel === r)}
            >
              {RISK_LEVEL_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">Status</div>
        <div className="flex flex-wrap gap-2">
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy !== null}
              onClick={() => send(`status:${s}`, { field: "status", value: s })}
              className={pill(status === s)}
            >
              {REPORT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Assign */}
      <div>
        <div className="text-sm font-medium text-ink mb-2">Assignment</div>
        <button
          type="button"
          disabled={busy !== null || assignedTo === leadUserId}
          onClick={() => send("assign", { field: "assign" })}
          className={pill(assignedTo === leadUserId)}
        >
          {assignedTo === leadUserId ? "Assigned to you" : "Assign to me"}
        </button>
      </div>

      {/* Action taken */}
      <div>
        <label className="block text-sm font-medium text-ink mb-2">
          Action taken <span className="text-ink-soft font-normal">(lead-only; never shown to the reporter)</span>
        </label>
        <textarea
          rows={4}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink leading-[1.6] focus:border-tangerine focus:outline-none"
        />
        <button
          type="button"
          disabled={busy !== null || action === (actionTaken ?? "")}
          onClick={() => send("action", { field: "action", value: action })}
          className="mt-3 inline-flex items-center rounded-full bg-ink text-cream font-semibold px-5 py-2.5 text-sm hover:bg-tangerine hover:text-ink transition-colors disabled:opacity-50"
        >
          {busy === "action" ? "Saving…" : "Save action"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default SafeguardingReportActions;
