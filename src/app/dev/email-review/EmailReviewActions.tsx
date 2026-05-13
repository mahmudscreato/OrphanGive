// Session 34 Part C — client island for the /dev/email-review page.
// Holds the "Send" buttons + a running log of what's been sent in
// the current session. Kept deliberately minimal — this is a dev
// tool, not a polished UX.

"use client";

import { useState, useTransition } from "react";

type SampleMeta = {
  id: string;
  title: string;
  description: string;
  subject: string;
};

type LogEntry = {
  ts: string;
  templateId: string;
  templateTitle: string;
  success: boolean;
  detail: string;
};

type SendResult = {
  ok: boolean;
  results?: Array<{
    id: string;
    title: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
  error?: string;
};

export function EmailReviewActions({ samples }: { samples: SampleMeta[] }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function appendLog(entries: LogEntry[]) {
    setLog((prev) => [...entries, ...prev].slice(0, 50));
  }

  async function send(templateId: string) {
    setBusyId(templateId);
    try {
      const res = await fetch("/api/dev/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateId }),
      });
      const data = (await res.json()) as SendResult;
      const entries: LogEntry[] = (data.results ?? []).map((r) => ({
        ts: new Date().toLocaleTimeString(),
        templateId: r.id,
        templateTitle: r.title,
        success: r.success,
        detail: r.success
          ? `sent — message id ${r.messageId ?? "(none)"}`
          : `failed — ${r.error ?? data.error ?? "unknown error"}`,
      }));
      if (entries.length === 0) {
        entries.push({
          ts: new Date().toLocaleTimeString(),
          templateId,
          templateTitle: templateId,
          success: false,
          detail: data.error ?? `HTTP ${res.status}`,
        });
      }
      startTransition(() => appendLog(entries));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      startTransition(() =>
        appendLog([
          {
            ts: new Date().toLocaleTimeString(),
            templateId,
            templateTitle: templateId,
            success: false,
            detail: `network error — ${msg}`,
          },
        ]),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function sendAll() {
    if (
      !confirm(
        `Send ALL ${samples.length} test emails to mahmud@printagraphy.com? Sequential, ~${Math.ceil(
          (samples.length * 0.6) / 1,
        )}s total.`,
      )
    ) {
      return;
    }
    await send("ALL");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F0E8D9] bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-[#2A2A2C]">
            Quick actions
          </p>
          <p className="text-xs text-[#666]">
            All sends go to mahmud@printagraphy.com.
          </p>
        </div>
        <button
          type="button"
          onClick={sendAll}
          disabled={busyId !== null}
          className="rounded-full bg-[#ED8B3F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d97a2f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyId === "ALL" ? "Sending all…" : `Send ALL (${samples.length})`}
        </button>
      </div>

      {/* Per-template buttons in a compact grid above the previews
          so Mahmud can fire any one without scrolling.            */}
      <div className="rounded-2xl border border-[#F0E8D9] bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-[#2A2A2C]">
          Send individual templates
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => send(s.id)}
              disabled={busyId !== null}
              className="rounded-lg border border-[#F0E8D9] px-3 py-2 text-left text-xs transition hover:border-[#ED8B3F] hover:bg-[#FFF6EC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-semibold text-[#2A2A2C]">
                {busyId === s.id ? "Sending…" : s.title}
              </span>
              <span className="block truncate text-[#999]">{s.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent sends log. Newest first.                          */}
      <div className="rounded-2xl border border-[#F0E8D9] bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-[#2A2A2C]">
          Recent sends ({log.length})
        </p>
        {log.length === 0 ? (
          <p className="text-xs text-[#999]">
            Nothing sent yet this session.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {log.map((entry, idx) => (
              <li
                key={`${entry.ts}-${entry.templateId}-${idx}`}
                className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${
                  entry.success
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div>
                  <span className="font-semibold">{entry.templateTitle}</span>{" "}
                  <span className="text-[#666]">— {entry.detail}</span>
                </div>
                <span className="shrink-0 text-[#999]">{entry.ts}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
