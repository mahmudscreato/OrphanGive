"use client";

// "Log a report received by email" — manual transcription into the queue.
// There is NO automated inbound-email ingestion; the lead types it in. This
// is stated plainly in the UI so no one assumes emailed reports auto-capture.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  type ReportType,
} from "@/lib/safeguarding-report-types";

export function SafeguardingEmailLogForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReportType | "">("");
  const [description, setDescription] = useState("");
  const [reporter, setReporter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!type) return setError("Choose a report type.");
    if (description.trim().length < 1) return setError("Enter the report details.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/safeguarding-reports/log-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: type,
          description,
          reporter_name: reporter || undefined,
        }),
      });
      if (!res.ok) {
        setError(`Could not log report (${res.status}).`);
        return;
      }
      setType("");
      setDescription("");
      setReporter("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not log report — network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink/[0.08] bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-ink">Log a report received by email</h2>
          <p className="text-sm text-ink-soft mt-1 leading-[1.5]">
            Emailed/phoned reports are recorded here <strong className="text-ink">manually</strong> —
            there is no automated email ingestion. Transcribe it so nothing lives only in an inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 inline-flex items-center rounded-full bg-ink text-cream font-semibold px-4 py-2 text-sm hover:bg-tangerine hover:text-ink transition-colors"
        >
          {open ? "Cancel" : "Log a report"}
        </button>
      </div>

      {open ? (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-ink/[0.08] pt-5">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">Report type *</span>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-ink focus:border-tangerine focus:outline-none"
            >
              <option value="" disabled>Choose…</option>
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">Report details *</span>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Transcribe the concern as reported."
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-ink leading-[1.6] focus:border-tangerine focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-1.5">
              Reporter (optional)
            </span>
            <input
              type="text"
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
              placeholder="Name / email if known"
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-ink focus:border-tangerine focus:outline-none"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center rounded-full bg-ink text-cream font-semibold px-5 py-2.5 text-sm hover:bg-tangerine hover:text-ink transition-colors disabled:opacity-50"
          >
            {busy ? "Logging…" : "Log report"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default SafeguardingEmailLogForm;
