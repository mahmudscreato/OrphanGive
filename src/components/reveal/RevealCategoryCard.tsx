"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AllowedRevealField,
} from "@/lib/reveal-data";

// ─── Shared types (mirrors LockedFieldsBand's category shape) ───────────────
export type RevealCategory = {
  key: "address" | "school" | "guardian" | "family";
  label: string;
  blurb: string;
  // Field name(s) requested when the donor submits the modal. The first
  // entry is the "primary" field tracked in reveal_request; for compound
  // categories like guardian, the secondary fields are auto-revealed
  // server-side once primary is approved.
  fields: ReadonlyArray<AllowedRevealField>;
  iconKey: "location" | "school" | "guardian" | "family";
};

type Props = {
  category: RevealCategory;
  childId: string;
  childFirstName: string;
  // Whether the viewer can interact (approved donor) or just see the locked
  // pill (public / pending_approval / rejected donor).
  interactive: boolean;
  // Sign-in URL for non-interactive viewers (passed by parent).
  signInHref: string;
  // If revealed, the actual decrypted values mapped by field. Undefined
  // entries render as the locked pill.
  revealedValues: Partial<Record<AllowedRevealField, string | null>>;
  // ISO timestamp of when this category's primary reveal was approved.
  approvedAt?: string | null;
  // fix/reveal-data-population — whether this category's reveal is APPROVED
  // (in the active-reveal set), independent of whether a value exists. Lets
  // the card distinguish "approved but no data on file" from "not approved"
  // (both previously rendered as the locked/request pill).
  approved?: boolean;
};

const ICONS: Record<RevealCategory["iconKey"], React.ReactNode> = {
  location: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  school: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M3 7v13h18V7M3 7l9-4 9 4M3 7h18" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  guardian: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21a8 8 0 0116 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  family: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path
        d="M9 11a3 3 0 100-6 3 3 0 000 6zm6 0a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0H3zm12 0a6 6 0 016-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};

function approvedAgo(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Approved today";
  if (days === 1) return "Approved 1 day ago";
  return `Approved ${days} days ago`;
}

function BlurredBlocks() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-14" />
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-8" />
      <span className="inline-block bg-ink/[0.18] h-3 rounded-sm w-20" />
    </span>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-tangerine-deep">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function RevealCategoryCard({
  category,
  childId,
  childFirstName,
  interactive,
  signInHref,
  revealedValues,
  approvedAt,
  approved,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Determine "revealed" by checking the PRIMARY field (first in the
  // category's field list). If revealed, all sibling fields in the same
  // category were also fetched server-side.
  const primary = category.fields[0]!;
  const primaryValue = revealedValues[primary];
  const revealed =
    primaryValue !== undefined &&
    primaryValue !== null &&
    primaryValue !== "";
  // fix/reveal-data-population — the reveal is APPROVED but the (post-
  // fallback) value is empty: this detail simply isn't on file. Distinct
  // from "not approved" so we don't show the request pill for something
  // the donor already has access to.
  const approvedButEmpty = (approved ?? false) && !revealed;

  async function submit() {
    setError(null);
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/reveal/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          fieldName: primary,
          donorReason: reason.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not submit request.");
        setSubmitState("idle");
        return;
      }
      setSubmitState("success");
    } catch {
      setError("Network error. Please try again.");
      setSubmitState("idle");
    }
  }

  return (
    <>
      <div
        className={
          revealed || approvedButEmpty
            ? "rounded-[20px] p-7 transition-all duration-[400ms] ease-soft bg-tangerine-mist border-[1.5px] border-moss/40"
            : "rounded-[20px] p-7 transition-all duration-[400ms] ease-soft bg-white border-[1.5px] border-dashed border-tangerine/40 hover:bg-tangerine-mist hover:-translate-y-0.5"
        }
      >
        <div className="flex items-center gap-3 text-tangerine-deep">
          {ICONS[category.iconKey]}
          <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
            {category.label}
          </div>
        </div>

        {revealed ? (
          <div className="mt-4 space-y-2 font-display text-[17px] text-ink leading-snug">
            {category.fields.map((f) => {
              const v = revealedValues[f];
              if (v === undefined || v === null || v === "") return null;
              return (
                <div key={f}>
                  <div className="text-[10.5px] uppercase tracking-[0.12em] text-slate-soft font-mono mt-0.5">
                    {f.replace(/_encrypted$/, "").replace(/_/g, " ")}
                  </div>
                  <div>{v}</div>
                </div>
              );
            })}
            <div className="mt-3 text-[11px] text-moss-deep font-mono tracking-[0.08em] uppercase">
              {approvedAgo(approvedAt) ?? "Approved"}
            </div>
          </div>
        ) : approvedButEmpty ? (
          // fix/reveal-data-population — access is granted, but this detail
          // simply isn't recorded for this child. Show it as approved (not
          // as a locked "request access" pill).
          <div className="mt-4">
            <p className="text-[14px] text-ink/85 leading-snug">
              Approved — but this detail isn&apos;t on file for{" "}
              {childFirstName} yet.
            </p>
            <div className="mt-3 text-[11px] text-moss-deep font-mono tracking-[0.08em] uppercase">
              {approvedAgo(approvedAt) ?? "Approved"}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <span className="inline-flex items-center gap-2.5 bg-tangerine-mist border-[1.5px] border-dashed border-tangerine/40 rounded-xl px-3.5 py-2">
                <BlurredBlocks />
                <LockIcon />
              </span>
            </div>
            <p className="mt-4 text-[13.5px] text-slate leading-snug">
              {category.blurb}
            </p>
            <div className="mt-5">
              {interactive ? (
                <button
                  type="button"
                  onClick={() => {
                    setSubmitState("idle");
                    setError(null);
                    setReason("");
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 text-tangerine-deeper text-[13px] font-medium transition-[gap] duration-[250ms] hover:gap-3"
                >
                  Request to view →
                </button>
              ) : (
                <a
                  href={signInHref}
                  className="inline-flex items-center gap-2 text-tangerine-deeper text-[13px] font-medium transition-[gap] duration-[250ms] hover:gap-3"
                >
                  Sign in to learn more →
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {modalOpen ? (
        <Modal
          category={category}
          childFirstName={childFirstName}
          submitState={submitState}
          error={error}
          reason={reason}
          onReason={setReason}
          onSubmit={submit}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function Modal(props: {
  category: RevealCategory;
  childFirstName: string;
  submitState: "idle" | "submitting" | "success";
  error: string | null;
  reason: string;
  onReason: (s: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  // Lock body scroll while open + focus the dialog
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center px-5 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative max-w-[520px] w-full bg-cream rounded-[24px] border border-ink/[0.06] shadow-lift p-7 max-md:p-6 outline-none"
      >
        {props.submitState === "success" ? (
          <div>
            <div className="w-14 h-14 rounded-full bg-moss-soft text-moss-deep flex items-center justify-center mb-5" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                <path
                  d="M5 12l4 4L19 6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 id="reveal-modal-title" className="font-display text-[26px] text-ink leading-tight">
              Request submitted.
            </h2>
            <p className="mt-3 text-[15px] text-slate leading-[1.65]">
              We&apos;ll email you when it&apos;s reviewed. Approvals usually
              take 1–2 business days.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={props.onClose}
                className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-ink text-cream px-6 py-3 text-[14px] hover:bg-tangerine hover:text-ink transition-all"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="reveal-modal-title" className="font-display text-[26px] text-ink leading-tight">
              Request to view {props.category.label.toLowerCase()}
            </h2>
            <p className="mt-3 text-[15px] text-slate leading-[1.65]">
              Once approved by our team, you&apos;ll be able to see{" "}
              {props.category.label.toLowerCase()} for {props.childFirstName}.
              Approvals last 90 days.
            </p>

            <label className="block mt-6">
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate font-medium">
                Why are you requesting this?{" "}
                <span className="normal-case tracking-normal text-slate-soft font-normal">
                  (optional)
                </span>
              </span>
              <textarea
                value={props.reason}
                onChange={(e) => props.onReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-2 w-full rounded-xl border border-ink/[0.12] bg-white px-4 py-3 text-[14px] text-ink placeholder:text-slate-soft focus:outline-none focus:border-tangerine focus:ring-2 focus:ring-tangerine-soft transition-all resize-none"
                placeholder="Helpful for our team but not required."
              />
              <span className="mt-1 block text-right text-[11px] text-slate-soft">
                {props.reason.length}/500
              </span>
            </label>

            {props.error ? (
              <div className="mt-4 rounded-xl bg-[#FEEFEF] border border-[#F4C7C7] px-4 py-3 text-[13.5px] text-[#A02B2B]">
                {props.error}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end items-center gap-4">
              <button
                type="button"
                onClick={props.onClose}
                className="text-[13px] text-slate hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={props.onSubmit}
                disabled={props.submitState === "submitting"}
                className="inline-flex items-center gap-2 font-body font-semibold rounded-full bg-tangerine text-ink px-6 py-3 text-[14px] hover:bg-tangerine-deep hover:shadow-warm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {props.submitState === "submitting" ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RevealCategoryCard;
