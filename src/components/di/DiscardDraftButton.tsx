// Session 48b — Discard-draft button (client).
//
// Two-tap confirm pattern matching the WithdrawButton from
// Session 44 — first tap arms, second tap within 5s actually
// deletes. Drafts have no audit history so the delete is hard.

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const CONFIRM_TIMEOUT_MS = 5000;

type Phase = "idle" | "confirm" | "submitting" | "error";

export function DiscardDraftButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "confirm") return;
    timerRef.current = setTimeout(() => setPhase("idle"), CONFIRM_TIMEOUT_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("idle");
    setError(null);
  }

  function onClick() {
    if (phase === "idle") {
      setPhase("confirm");
      return;
    }
    if (phase === "confirm") {
      startTransition(async () => {
        setPhase("submitting");
        setError(null);
        try {
          const res = await fetch(`/api/di/proposals/${draftId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            setPhase("error");
            setError(
              res.status === 401
                ? "Your session expired. Please sign in again."
                : "Could not discard. It may have already been removed.",
            );
            return;
          }
          router.refresh();
        } catch {
          setPhase("error");
          setError("Network issue. Try again.");
        }
      });
    }
  }

  if (phase === "error") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-[12.5px] text-[#9A2424]">{error}</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center self-start px-3 py-1.5 rounded-full border border-stone-300 text-[12.5px] text-slate hover:bg-stone-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const label =
    phase === "submitting" || pending
      ? "Discarding…"
      : phase === "confirm"
        ? "Are you sure? Tap again to confirm"
        : "Discard";

  const tone =
    phase === "confirm"
      ? "border-[#D04848]/40 text-[#9A2424] hover:bg-[#D04848]/[0.06]"
      : "border-stone-300 text-slate hover:bg-stone-50 hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={phase === "submitting" || pending}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white text-[12.5px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${tone}`}
    >
      {phase === "submitting" || pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : null}
      {label}
    </button>
  );
}
