// Session 67 — Expandable metadata + diff cell for the audit log
// viewer.
//
// Renders two stacked sections, each independently collapsible:
//   - "metadata" — the JSON payload from audit_log.metadata
//   - "diff"     — the before/after structure from audit_log.diff
//
// Session 67.1 hotfix — the collapsed state previously rendered a
// truncated raw-JSON preview alongside the chevron. The preview
// was unreadable (mostly uuids + braces) and made the table feel
// like debug output. Switched to chevron + label only; pretty-
// printed JSON appears below on expand.
//
// Client component because the expand/collapse toggle is per-row +
// per-section local state; the parent table stays server-rendered.

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  metadata: Record<string, unknown> | null;
  diff: Record<string, unknown> | null;
}

export function AuditMetadataCell({ metadata, diff }: Props) {
  const hasMeta = isNonEmptyRecord(metadata);
  const hasDiff = isNonEmptyRecord(diff);

  if (!hasMeta && !hasDiff) {
    return <span className="text-ink-soft italic text-[12.5px]">none</span>;
  }

  return (
    <div className="space-y-1.5">
      {hasMeta ? (
        <ExpandableSection label="metadata" payload={metadata as Record<string, unknown>} />
      ) : null}
      {hasDiff ? (
        <ExpandableSection label="diff" payload={diff as Record<string, unknown>} />
      ) : null}
    </div>
  );
}

function ExpandableSection({
  label,
  payload,
}: {
  label: string;
  payload: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-baseline gap-1 text-[12px] text-ink-soft hover:text-tangerine-deeper transition-colors group"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown
            className="w-3 h-3 stroke-[2] mt-0.5"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="w-3 h-3 stroke-[2] mt-0.5"
            aria-hidden="true"
          />
        )}
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] font-semibold">
          {label}
        </span>
      </button>
      {open ? (
        <pre className="mt-1.5 ml-4 rounded-lg bg-stone-100 border border-stone-200 p-2.5 font-mono text-[11.5px] text-ink leading-relaxed whitespace-pre-wrap break-words overflow-x-auto max-w-[520px]">
          {safeStringify(payload, true)}
        </pre>
      ) : null}
    </div>
  );
}

function isNonEmptyRecord(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

function safeStringify(v: unknown, pretty = false): string {
  try {
    return JSON.stringify(v, null, pretty ? 2 : undefined);
  } catch {
    return "(unserialisable)";
  }
}
