"use client";

// Modal that lets a queued donor pick a different child to transfer
// their support to (Session 14.7 Phase 2). Fetches the list of
// active children client-side (excluding the original child the
// donor was queued for). Filtering by "no current monthly sponsor /
// queue not full" is server-side at /api/sponsorship/[id]/queue-shift
// — this picker just shows the donor a browsable list.

import { useEffect, useState } from "react";
import { Modal } from "../Modal";

type ChildOption = {
  id: string;
  display_name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  excludeChildId: string;
  onPick: (c: ChildOption) => void;
};

export function TransferTargetPicker({
  open,
  onClose,
  excludeChildId,
  onPick,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ChildOption[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Reuse the public /api/children-search-style endpoint if one
    // exists; for now, hit Directus's items API via the generic
    // /api/internal/list-active-children route. The dashboard donor
    // is signed in and approved at this point, so a broad list is
    // fine. Fallback: surface error and let the donor try again.
    fetch("/api/transfer-targets", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const arr = Array.isArray(j?.children) ? j.children : [];
        setOptions(
          arr
            .filter((c: ChildOption) => c.id !== excludeChildId)
            .slice(0, 100),
        );
      })
      .catch(() => {
        if (!cancelled) setError("Could not load children. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, excludeChildId]);

  const filtered = query
    ? options.filter((c) =>
        c.display_name.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer your support"
      description="Choose a child whose sponsorship can begin sooner. Your original commitment will be refunded; you'll re-checkout for the new child."
    >
      <div className="mt-2">
        <input
          type="search"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-ink/[0.16] bg-white text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-tangerine-soft focus:border-tangerine"
        />
      </div>

      {loading ? (
        <p className="mt-4 text-[13px] text-slate-soft italic">Loading…</p>
      ) : error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-2 text-[12.5px] text-[#A02B2B]"
        >
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-soft italic">
          {query
            ? "No children match that search."
            : "No transfer targets available right now."}
        </p>
      ) : (
        <ul className="mt-4 max-h-[300px] overflow-y-auto space-y-2 pr-1">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="w-full text-left rounded-[12px] bg-white border border-ink/[0.10] px-4 py-2.5 hover:border-tangerine hover:bg-tangerine-mist/30 transition-colors"
              >
                <span className="font-display text-[15px] text-ink">
                  {c.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className="font-body text-[13.5px] text-slate hover:text-ink transition-colors"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
