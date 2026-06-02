"use client";

// GA4 — added SAFELY for a child-protection service, and only after EXPLICIT
// opt-in consent (GDPR/PECR, deny-by-default).
//
// THREE independent gates. ALL must be true before anything is requested from
// Google — this is blocking, not hiding:
//   1. NEXT_PUBLIC_GA_ID is set (unset in dev/CI/preview = no analytics ever).
//   2. The route is not a staff/auth surface (/admin, /di, /dashboard) — those
//      aren't funnel pages and their paths can carry ids.
//   3. The visitor has clicked "Accept" (og_analytics_consent === "granted").
//      Denied or unchosen → the <Script> is never rendered, gtag is never
//      bootstrapped, no _ga cookie is set, and there is no network call to
//      googletagmanager.com.
//
// REDACTION (carried over unchanged from the reviewed 583167d component) — even
// once consent is granted, child-identifying data never reaches Google:
//   - send_page_view:false, and every page_view is sent MANUALLY through a
//     sanitizer, so even a direct first load of /children/<uuid> is redacted.
//   - scrubPath() replaces UUID-shaped / long-numeric path segments with "[id]"
//     so child / donor / sponsorship ids never appear in page_path or
//     page_location.
//   - safeTitle() forces a generic title on child-name-bearing routes
//     (/children/[id], /sponsor/[id]) — the child's first name lives in the
//     profile <title>, so it never reaches GA.
//   - page_location is rebuilt as origin + scrubbed-path, which DROPS any query
//     string / hash (so ?token=… style values are never sent either).
//
// IP anonymization is automatic and irreversible in GA4 — no code needed.

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CONSENT_EVENT,
  isAnalyticsExcludedPath,
  readConsent,
} from "@/lib/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replace any UUID-shaped or long-numeric path segment with "[id]". */
function scrubPath(path: string): string {
  return path
    .split("/")
    .map((seg) => (UUID_RE.test(seg) || /^\d{6,}$/.test(seg) ? "[id]" : seg))
    .join("/");
}

/** Generic title for routes whose real <title> can contain a child name. */
function safeTitle(path: string): string {
  if (/^\/children\/[^/]+/.test(path)) return "Child profile — OrphanGive";
  if (/^\/sponsor\/[^/]+/.test(path)) return "Sponsor a child — OrphanGive";
  return typeof document !== "undefined" ? document.title : "OrphanGive";
}

type Win = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function Analytics() {
  const pathname = usePathname();
  const configured = useRef(false);
  const [granted, setGranted] = useState(false);

  const excluded = isAnalyticsExcludedPath(pathname);

  // Read consent on mount, and re-read whenever the banner / the /cookies
  // controls change it. Done in an effect (not during render) so the server
  // and first client render agree — GA simply starts a tick after hydration
  // once consent is granted, never before.
  useEffect(() => {
    const sync = () => setGranted(readConsent() === "granted");
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  const active = Boolean(GA_ID) && !excluded && granted;

  useEffect(() => {
    if (!active || !pathname) return;
    const w = window as unknown as Win;
    w.dataLayer = w.dataLayer || [];
    if (!w.gtag) {
      w.gtag = (...args: unknown[]) => {
        (w.dataLayer as unknown[]).push(args);
      };
      w.gtag("js", new Date());
    }
    // Configure once, with automatic page_view DISABLED so nothing is ever
    // sent before our sanitizer runs.
    if (!configured.current) {
      w.gtag("config", GA_ID, { send_page_view: false });
      configured.current = true;
    }
    const cleanPath = scrubPath(pathname);
    w.gtag("event", "page_view", {
      page_path: cleanPath,
      page_location: `${window.location.origin}${cleanPath}`,
      page_title: safeTitle(pathname),
    });
  }, [active, pathname]);

  if (!active) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      strategy="afterInteractive"
    />
  );
}

export default Analytics;
