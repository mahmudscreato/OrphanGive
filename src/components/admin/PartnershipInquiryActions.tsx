// P4 — admin status + notes panel for a single partnership inquiry.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
// P4 — types module is non-server-only so it can be imported into
// this client component without dragging the Directus SDK in.
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUSES,
  type InquiryStatus,
} from "@/lib/partnership-inquiry-types";

export function PartnershipInquiryActions({
  inquiryId,
  currentStatus,
  currentNotes,
  reviewedAt: _reviewedAt,
}: {
  inquiryId: string;
  currentStatus: InquiryStatus;
  currentNotes: string;
  reviewedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(currentNotes);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeStatus(next: InquiryStatus) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/partnership-inquiries/${inquiryId}/status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? "Couldn't update status.");
          return;
        }
        setToast(`Marked ${INQUIRY_STATUS_LABELS[next]}.`);
        window.setTimeout(() => setToast(null), 1500);
        router.refresh();
      } catch {
        setError("Network error.");
      }
    });
  }

  function saveNotes() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/partnership-inquiries/${inquiryId}/notes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? "Couldn't save notes.");
          return;
        }
        setToast("Notes saved.");
        window.setTimeout(() => setToast(null), 1500);
        router.refresh();
      } catch {
        setError("Network error.");
      }
    });
  }

  return (
    <section
      aria-label="Status + notes"
      className="rounded-2xl bg-white border border-stone-200 shadow-sm p-5 md:p-6 space-y-5"
    >
      <h2 className="font-display text-[16px] text-ink">
        Status &amp; internal notes
      </h2>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-[#A02B2B]/30 bg-[#A02B2B]/[0.06] px-4 py-3 text-[13.5px] text-[#A02B2B]"
        >
          {error}
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          className="rounded-xl border border-moss/40 bg-moss-soft px-4 py-3 text-[13.5px] text-moss-deep"
        >
          {toast}
        </div>
      ) : null}

      <div>
        <p className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft mb-2">
          Status
        </p>
        <div className="flex flex-wrap gap-2">
          {INQUIRY_STATUSES.map((s) => {
            const isCurrent = s === currentStatus;
            return (
              <button
                key={s}
                type="button"
                disabled={pending || isCurrent}
                onClick={() => changeStatus(s)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
                  isCurrent
                    ? "bg-tangerine text-white"
                    : "bg-white border border-stone-200 text-ink-soft hover:border-tangerine-soft hover:text-tangerine-deeper disabled:opacity-60"
                }`}
              >
                {pending && !isCurrent ? (
                  <Loader2
                    className="w-3 h-3 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {INQUIRY_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="admin-notes"
          className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-soft mb-1.5 block"
        >
          Internal notes
        </label>
        <textarea
          id="admin-notes"
          className="w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[14px] text-ink leading-relaxed focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all min-h-[120px] resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this inquiry…"
          maxLength={4000}
          disabled={pending}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-ink-soft">
            Visible to admin only. Never shown to the submitter.
          </p>
          <button
            type="button"
            onClick={saveNotes}
            disabled={pending || notes === currentNotes}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-white text-[13px] font-medium px-4 py-2 hover:bg-ink/85 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save notes"
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
