// feat/admin-bulk-approve — shared checkbox review list for the three
// structurally-identical queues: documents, reports, moments.
//
// Each of those queues renders a list of rows that LINK to a detail page
// (where the existing one-by-one approve lives, untouched). This component
// adds the two new modes on top WITHOUT changing that: a checkbox per
// approvable row + the bulk bar ("Approve selected" / "Approve all").
//
// Rows are normalized to BulkReviewRow by the server page, so one component
// serves all three. Bulk approve POSTs each row's own `approveEndpoint`
// (the SAME per-item route the detail page uses) via useBulkApprove — so
// notifications/validation/audit fire per item exactly as a single approve.
//
// These three queues are NON-sensitive → a normal confirmation step.

"use client";

import Link from "next/link";
import {
  ChevronRight,
  Clock,
  FileBarChart,
  FileText,
  ImageIcon,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useBulkApprove } from "./useBulkApprove";
import { BulkApproveBar } from "./BulkApproveBar";
import { BulkConfirmDialog } from "./BulkConfirmDialog";

export type BulkReviewThumb = "file" | "image" | "video" | "report";

export interface BulkReviewRow {
  id: string;
  href: string;
  /** The per-item approve route — the SAME one the detail page POSTs. */
  approveEndpoint: string;
  /** Only pending/approvable rows get a checkbox + count toward bulk. */
  selectable: boolean;
  thumbUrl?: string | null;
  thumbIcon: BulkReviewThumb;
  title: string;
  statusLabel: string;
  statusTone: "pending" | "approved" | "rejected" | "published" | "neutral";
  typeLabel?: string | null;
  subtitle?: string | null;
  meta?: string | null;
}

const STATUS_TONES: Record<BulkReviewRow["statusTone"], string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-moss-soft text-moss-deep",
  published: "bg-moss-soft text-moss-deep",
  rejected: "bg-[#FCE9E9] text-[#A02020]",
  neutral: "bg-stone-100 text-stone-700",
};

function ThumbGlyph({ kind }: { kind: BulkReviewThumb }) {
  const cls = "w-5 h-5 text-stone-500 stroke-[1.75]";
  if (kind === "image") return <ImageIcon className={cls} aria-hidden="true" />;
  if (kind === "video") return <Video className={cls} aria-hidden="true" />;
  if (kind === "report") return <FileBarChart className={cls} aria-hidden="true" />;
  return <FileText className={cls} aria-hidden="true" />;
}

export function BulkReviewList({
  rows,
  itemNoun,
}: {
  rows: BulkReviewRow[];
  /** Singular noun for the confirm copy, e.g. "document". */
  itemNoun: string;
}) {
  const bulk = useBulkApprove();
  const [confirm, setConfirm] = useState<{ ids: string[] } | null>(null);

  const approvable = useMemo(() => rows.filter((r) => r.selectable), [rows]);
  const endpointById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of approvable) m.set(r.id, r.approveEndpoint);
    return m;
  }, [approvable]);

  const allSelected =
    approvable.length > 0 && approvable.every((r) => bulk.isSelected(r.id));

  function toggleAll() {
    if (allSelected) bulk.clear();
    else bulk.selectMany(approvable.map((r) => r.id));
  }

  function openConfirm(ids: string[]) {
    if (ids.length === 0) return;
    setConfirm({ ids });
  }

  async function doConfirm() {
    if (!confirm) return;
    const units = confirm.ids
      .map((id) => endpointById.get(id))
      .filter((e): e is string => !!e)
      .map((endpoint) => ({ endpoints: [endpoint] }));
    setConfirm(null);
    await bulk.run(units);
  }

  const selectedIds = approvable
    .filter((r) => bulk.isSelected(r.id))
    .map((r) => r.id);

  return (
    <>
      <BulkApproveBar
        approvableCount={approvable.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onApproveSelected={() => openConfirm(selectedIds)}
        onApproveAll={() => openConfirm(approvable.map((r) => r.id))}
        running={bulk.running}
        progress={bulk.progress}
        result={bulk.result}
        onDismissResult={bulk.dismissResult}
      />

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-stretch gap-2">
            {r.selectable ? (
              <label className="flex items-center pl-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulk.isSelected(r.id)}
                  onChange={() => bulk.toggle(r.id)}
                  disabled={bulk.running}
                  className="w-4 h-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft"
                  aria-label={`Select ${r.title}`}
                />
              </label>
            ) : (
              <span className="w-4 ml-1" aria-hidden="true" />
            )}
            <Link
              href={r.href}
              className="group flex-1 flex items-start gap-3 rounded-2xl bg-white border border-stone-200 shadow-sm px-4 py-3.5 md:px-5 md:py-4 transition-colors hover:border-tangerine-soft"
            >
              <div className="shrink-0 w-12 h-12 rounded-lg bg-stone-100 overflow-hidden flex items-center justify-center">
                {r.thumbUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={r.thumbUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ThumbGlyph kind={r.thumbIcon} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-display text-[16px] text-ink leading-snug truncate">
                    {r.title}
                  </p>
                  {r.typeLabel ? (
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft">
                      {r.typeLabel}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${STATUS_TONES[r.statusTone]}`}
                  >
                    {r.statusLabel}
                  </span>
                </div>
                {r.subtitle ? (
                  <p className="mt-0.5 text-[13px] text-ink-soft leading-snug line-clamp-1">
                    {r.subtitle}
                  </p>
                ) : null}
                {r.meta ? (
                  <p className="mt-1 text-[12px] text-ink-soft leading-relaxed inline-flex items-center gap-1">
                    <Clock className="w-3 h-3 stroke-[1.75]" aria-hidden="true" />
                    {r.meta}
                  </p>
                ) : null}
              </div>
              <ChevronRight
                className="w-4 h-4 mt-2 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>

      <BulkConfirmDialog
        open={confirm !== null}
        sensitive={false}
        title="Approve selected"
        message={
          confirm
            ? `Approve ${confirm.ids.length} ${itemNoun}${confirm.ids.length === 1 ? "" : "s"}? Each is approved with the same per-item result as approving it individually.`
            : ""
        }
        confirmLabel={
          confirm ? `Approve ${confirm.ids.length}` : "Approve"
        }
        pending={bulk.running}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

export default BulkReviewList;
