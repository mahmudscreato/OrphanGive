// feat/admin-bulk-approve — shared bulk-approve engine for the 5 admin
// review queues (documents, intake-photos, reports, moments, reveal).
//
// CORE GUARANTEE: bulk approve runs the EXACT per-item logic a single
// approve does — it POSTs the SAME per-item approve route once per item.
// There is NO parallel bulk path that could skip a notification, an
// approved_until stamp, a donor email, validation, or an audit row. Every
// queue's route already does all of that per call; we just call it N times.
//
// Requests run SEQUENTIALLY (not parallel) so a large "approve all" can't
// hammer Directus, and so audit/notification ordering stays deterministic.
// Partial failure is first-class: each POST is independent, failures are
// counted, and the caller reports "N approved, M failed" — never a silent
// drop or a half-state.

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export interface BulkApproveResult {
  ok: number;
  failed: number;
  total: number;
}

/** One selectable unit maps to one or more approve endpoints. Most queues
 *  are 1:1 (a row → its approve route); intake-photo GROUPS expand to one
 *  endpoint per pending photo in the group. */
export interface BulkUnit {
  endpoints: string[];
}

export interface UseBulkApprove {
  selected: ReadonlySet<string>;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  selectMany: (keys: string[]) => void;
  clear: () => void;
  running: boolean;
  progress: { done: number; total: number } | null;
  result: BulkApproveResult | null;
  dismissResult: () => void;
  /**
   * POST every endpoint across `units` sequentially. `body`, when given,
   * is sent as JSON with every request (used by reveal's shared reason).
   * Refreshes the server component on completion so decided rows leave the
   * queue. Returns the tally.
   */
  run: (units: BulkUnit[], body?: unknown) => Promise<BulkApproveResult>;
}

export function useBulkApprove(): UseBulkApprove {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [result, setResult] = useState<BulkApproveResult | null>(null);

  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectMany = useCallback((keys: string[]) => {
    setSelected(new Set(keys));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const dismissResult = useCallback(() => setResult(null), []);

  const run = useCallback(
    async (units: BulkUnit[], body?: unknown): Promise<BulkApproveResult> => {
      const endpoints = units.flatMap((u) => u.endpoints);
      const total = endpoints.length;
      setRunning(true);
      setResult(null);
      setProgress({ done: 0, total });

      let ok = 0;
      let failed = 0;
      let done = 0;
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            ...(body !== undefined
              ? {
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                }
              : {}),
            cache: "no-store",
          });
          // The per-item routes return 200 { ok: true } on success. Any
          // non-2xx (404 not_found, 400 invalid_status, 409 conflict, 500)
          // counts as a failure but does NOT stop the rest of the batch.
          if (res.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
        done += 1;
        setProgress({ done, total });
      }

      const tally: BulkApproveResult = { ok, failed, total };
      setRunning(false);
      setProgress(null);
      setResult(tally);
      setSelected(new Set());
      // Re-read the server component so approved rows leave the queue.
      router.refresh();
      return tally;
    },
    [router],
  );

  return {
    selected,
    isSelected,
    toggle,
    selectMany,
    clear,
    running,
    progress,
    result,
    dismissResult,
    run,
  };
}
