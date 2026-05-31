"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Tasteful scroll-reveal wrapper for the profile enhancement
// (hero content column + story teaser). Pairs with the `.reveal-init`
// / `.is-revealed` CSS in globals.css.
//
// Behaviour:
//   - prefers-reduced-motion → render fully visible, no observer,
//     no transition (the CSS media query also enforces this as a
//     belt-and-braces backstop).
//   - otherwise → start hidden, then reveal once the element scrolls
//     into view. Elements already on-screen at mount (e.g. the
//     above-the-fold hero) reveal immediately, giving a gentle
//     entrance without waiting for a scroll.
//   - one-shot: we unobserve after the first reveal so it never
//     re-hides.
//
// SSR note: we render the hidden (`reveal-init`) state on the server
// so there's no flash of the final position; the client observer then
// adds `is-revealed`. Privacy: this is purely presentational — it
// carries whatever children it's given and adds/removes class names
// only. It never fetches or holds data.
export function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  as?: "div" | "section";
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (delayMs > 0) {
              const t = window.setTimeout(() => setRevealed(true), delayMs);
              // best-effort cleanup if unmounted before the timeout
              el.dataset.revealTimer = String(t);
            } else {
              setRevealed(true);
            }
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      const t = el.dataset.revealTimer;
      if (t) window.clearTimeout(Number(t));
    };
  }, [delayMs]);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref as React.Ref<HTMLDivElement>}
      className={`reveal-init ${revealed ? "is-revealed" : ""} ${className}`.trim()}
    >
      {children}
    </Comp>
  );
}

export default Reveal;
