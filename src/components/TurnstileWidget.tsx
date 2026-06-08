// Cloudflare Turnstile widget (client). Loads the Turnstile script and
// renders the challenge, calling `onToken(token)` when solved (and
// onToken("") on expiry/error so the parent can re-gate its submit).
//
// Graceful no-op: when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, this
// renders NOTHING and never loads the script — local/dev and an
// un-configured prod work unchanged (matches the server-side skip in
// src/lib/turnstile.ts). No third-party npm dependency — uses the
// official Turnstile JS API via explicit rendering.

"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.getElementById(
      SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("turnstile script failed to load")),
        { once: true },
      );
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed to load"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    ensureScript()
      .then(() => {
        if (cancelled || !window.turnstile || !el) return;
        if (widgetIdRef.current) return; // guard against double-render (StrictMode)
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          theme: "light",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch((err) => {
        // Don't hard-block the user on a script failure — leave the token
        // empty (submit stays gated) and log. The server still verifies.
        console.warn("[turnstile] widget load failed", err);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
    // onToken is a stable setter from the parent; re-running on siteKey only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  // Graceful no-op: nothing rendered when the site key isn't configured.
  if (!siteKey) return null;

  return <div ref={containerRef} className="cf-turnstile" />;
}
