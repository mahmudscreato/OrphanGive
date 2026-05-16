// Session 52b — Client island for the blurred intake photo tile +
// modal trigger.
//
// Lifted out of IntakePhotoGallery (server component) because the
// modal needs useState. The tile renders the blurred image; click
// opens a modal with the sponsor / sign-in CTA. Modal closes on
// click-outside or ESC.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HeartHandshake, Lock, X } from "lucide-react";

export interface BlurredPhotoModalTriggerProps {
  photoUrl: string;
  alt: string;
  childFirstName: string;
  childId: string;
  isAuthenticated: boolean;
}

export function BlurredPhotoModalTrigger({
  photoUrl,
  alt,
  childFirstName,
  childId,
  isAuthenticated,
}: BlurredPhotoModalTriggerProps) {
  const [open, setOpen] = useState(false);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Locked — sign in or sponsor ${childFirstName} to see this photo`}
        className="group relative rounded-2xl overflow-hidden bg-linen border border-ink/[0.05] block w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={alt}
          // CSS blur — see IntakePhotoGallery's header comment for
          // the V1 tradeoff note. The browser still downloads the
          // file; a determined visitor could lift the URL out of
          // DevTools. Acceptable because the photo is approved-for-
          // public per Tier 1; future hardening uses server-side
          // blurred variants.
          className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
          style={{
            aspectRatio: "1 / 1",
            objectFit: "cover",
            filter: "blur(14px)",
            // The blur creates a visible halo at the image edges;
            // scaling up slightly clips it.
            transform: "scale(1.1)",
          }}
        />
        <div className="absolute inset-0 bg-ink/30 group-hover:bg-ink/40 transition-colors flex items-center justify-center">
          <div className="bg-white/90 rounded-full p-2.5 shadow-md">
            <Lock
              className="w-4 h-4 text-tangerine-deeper stroke-[2]"
              aria-hidden="true"
            />
          </div>
        </div>
      </button>

      {open ? (
        <Modal
          onClose={() => setOpen(false)}
          childFirstName={childFirstName}
          childId={childId}
          isAuthenticated={isAuthenticated}
        />
      ) : null}
    </>
  );
}

function Modal({
  onClose,
  childFirstName,
  childId,
  isAuthenticated,
}: {
  onClose: () => void;
  childFirstName: string;
  childId: string;
  isAuthenticated: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Sponsor ${childFirstName} to see more`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h3 className="font-display text-[18px] text-ink">
            More of {childFirstName}&apos;s story
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-stone-100"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-tangerine-mist text-tangerine-deeper">
              <HeartHandshake
                className="w-5 h-5 stroke-[1.75]"
                aria-hidden="true"
              />
            </div>
            <p className="text-[14px] text-ink leading-relaxed">
              Sponsors see all the intake photos from our field team&apos;s
              first visit with {childFirstName}, plus updates as their
              story unfolds.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-stone-200 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
          {!isAuthenticated ? (
            <Link
              href={`/signin?from=/children/${childId}`}
              className="text-center md:text-left text-[14px] text-slate hover:text-tangerine-deeper transition-colors"
              onClick={onClose}
            >
              Sign in instead
            </Link>
          ) : null}
          <Link
            href={`/sponsor/${childId}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-tangerine text-white font-medium text-[14.5px] hover:bg-tangerine-deep transition-colors"
            onClick={onClose}
          >
            Sponsor {childFirstName}
          </Link>
        </div>
      </div>
    </div>
  );
}
