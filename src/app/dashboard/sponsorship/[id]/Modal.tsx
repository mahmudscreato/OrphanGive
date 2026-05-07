"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  // Tone affects the title accent only — buttons style themselves.
  tone?: "default" | "danger";
};

// Lightweight accessible modal — focus trap via initial focus + Tab cycle,
// Escape to close, click-outside (on backdrop) to close. No external dep.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  tone = "default",
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);

    // Focus the first focusable inside the dialog after a microtask so
    // children are mounted.
    queueMicrotask(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    });

    // Lock scroll behind the modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleColor = tone === "danger" ? "#A02B2B" : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onMouseDown={(e) => {
        // Close only when the click started on the backdrop (not on the
        // dialog or its descendants).
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-[18px] bg-cream shadow-[0_20px_60px_rgba(42,42,44,0.25)] border border-ink/[0.08] p-6 max-md:p-5"
      >
        <h2
          id={titleId}
          className="font-display text-[22px] leading-tight"
          style={titleColor ? { color: titleColor } : undefined}
        >
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-2 text-[14px] text-slate leading-[1.6]">
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
