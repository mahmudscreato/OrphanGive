// feat/admin-bulk-approve — intake-photo queue list with bulk approve.
//
// The intake queue is grouped BY CHILD (each card = one child's pending
// set, linking to the per-child review page where the existing one-by-one
// / batch-decide flow lives, untouched). The selectable unit here is a
// child-GROUP; approving it approves ALL of that child's pending photos by
// POSTing the per-photo approve route (/api/admin/intake-photos/[id]/approve)
// for each id — the SAME route the per-child page uses, so every
// notification + audit fires per photo exactly as a single approve.
//
// CHILD-SAFETY SENSITIVE → bulk actions require an EXTRA confirmation step
// stating the photo + child counts.

"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useBulkApprove } from "./bulk/useBulkApprove";
import { BulkApproveBar } from "./bulk/BulkApproveBar";
import { BulkConfirmDialog } from "./bulk/BulkConfirmDialog";

interface IntakeGroupView {
  childId: string;
  childDisplayName: string;
  pendingCount: number;
  totalCount: number;
  thumbnails: ReadonlyArray<{ id: string; photoUrl: string; status: string }>;
  pendingPhotoIds: string[];
}

function thumbBorder(status: string): string {
  if (status === "pending") return "border-amber-300";
  if (status === "approved") return "border-moss";
  if (status === "rejected") return "border-[#A02020]/40";
  return "border-stone-200";
}

export function IntakePhotoGroupList({ groups }: { groups: IntakeGroupView[] }) {
  const bulk = useBulkApprove();
  const [confirm, setConfirm] = useState<{ childIds: string[] } | null>(null);

  // Only children with pending photos are approvable.
  const approvable = useMemo(
    () => groups.filter((g) => g.pendingCount > 0),
    [groups],
  );
  const byChild = useMemo(() => {
    const m = new Map<string, IntakeGroupView>();
    for (const g of approvable) m.set(g.childId, g);
    return m;
  }, [approvable]);

  const selectedIds = approvable
    .filter((g) => bulk.isSelected(g.childId))
    .map((g) => g.childId);
  const allSelected =
    approvable.length > 0 && selectedIds.length === approvable.length;

  function toggleAll() {
    if (allSelected) bulk.clear();
    else bulk.selectMany(approvable.map((g) => g.childId));
  }

  // For the confirm dialog copy: how many PHOTOS across the chosen children.
  function photoCount(childIds: string[]): number {
    return childIds.reduce(
      (n, id) => n + (byChild.get(id)?.pendingPhotoIds.length ?? 0),
      0,
    );
  }

  async function doConfirm() {
    if (!confirm) return;
    const units = confirm.childIds
      .map((id) => byChild.get(id))
      .filter((g): g is IntakeGroupView => !!g)
      .map((g) => ({
        endpoints: g.pendingPhotoIds.map(
          (pid) => `/api/admin/intake-photos/${pid}/approve`,
        ),
      }));
    setConfirm(null);
    await bulk.run(units);
  }

  const confirmPhotoN = confirm ? photoCount(confirm.childIds) : 0;
  const confirmChildN = confirm ? confirm.childIds.length : 0;

  return (
    <>
      <BulkApproveBar
        approvableCount={approvable.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onApproveSelected={() =>
          selectedIds.length > 0 && setConfirm({ childIds: selectedIds })
        }
        onApproveAll={() =>
          approvable.length > 0 &&
          setConfirm({ childIds: approvable.map((g) => g.childId) })
        }
        running={bulk.running}
        progress={bulk.progress}
        result={bulk.result}
        onDismissResult={bulk.dismissResult}
      />

      <ul className="space-y-3">
        {groups.map((g) => {
          const selectable = g.pendingCount > 0;
          return (
            <li key={g.childId} className="flex items-stretch gap-2">
              {selectable ? (
                <label className="flex items-center pl-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulk.isSelected(g.childId)}
                    onChange={() => bulk.toggle(g.childId)}
                    disabled={bulk.running}
                    className="w-4 h-4 rounded border-stone-300 text-tangerine focus:ring-tangerine-soft"
                    aria-label={`Select ${g.childDisplayName}'s ${g.pendingCount} pending photos`}
                  />
                </label>
              ) : (
                <span className="w-4 ml-1" aria-hidden="true" />
              )}
              <Link
                href={`/admin/reviews/intake-photos/${g.childId}`}
                className="group flex-1 block rounded-2xl bg-white border border-stone-200 shadow-sm p-4 md:p-5 transition-colors hover:border-tangerine-soft"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-display text-[18px] text-ink leading-snug">
                      {g.childDisplayName}
                    </p>
                    <p className="mt-1 text-[12.5px] text-ink-soft">
                      {g.pendingCount} pending of {g.totalCount} total
                    </p>
                  </div>
                  <ChevronRight
                    className="w-4 h-4 mt-1 text-stone-400 stroke-[1.75] group-hover:text-tangerine-deeper transition-colors shrink-0"
                    aria-hidden="true"
                  />
                </div>
                {g.thumbnails.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto">
                    {g.thumbnails.map((t) => (
                      <div
                        key={t.id}
                        className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border ${thumbBorder(t.status)}`}
                        title={t.status}
                      >
                        {t.photoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={t.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <BulkConfirmDialog
        open={confirm !== null}
        sensitive
        title="Approve intake photos in bulk"
        message={`You're about to approve ${confirmPhotoN} intake photo${confirmPhotoN === 1 ? "" : "s"} across ${confirmChildN} child${confirmChildN === 1 ? "" : "ren"} WITHOUT reviewing each individually. Approved intake photos become visible to that child's sponsors. Confirm.`}
        confirmLabel={`Approve ${confirmPhotoN} photo${confirmPhotoN === 1 ? "" : "s"}`}
        pending={bulk.running}
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

export default IntakePhotoGroupList;
