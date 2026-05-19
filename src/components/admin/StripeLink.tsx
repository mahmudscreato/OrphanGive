// Session 69 — Canonical render for a Stripe-deep-linked id in
// admin views.
//
// Three responsibilities in one component:
//   1. Build the dashboard URL via stripe-links.ts (correct test /
//      live mode automatically; null-safe — no link when the id is
//      missing)
//   2. Render the id in monospace with an external-link icon so it
//      reads as "click to open Stripe" without shouting
//   3. Apply the right link attributes (target=_blank +
//      rel=noopener,noreferrer) so admin lands in a new tab
//
// Visual treatment per brief: small monospace, ink-soft default,
// tangerine-deeper hover, tiny inline external-link glyph. Never
// loud — admin uses these for occasional debugging.
//
// Server-renderable. The URL helpers are server-only (read
// process.env), so this stays a server component too; only the
// string + href reaches the client.

import { ExternalLink } from "lucide-react";
import {
  stripeChargeUrl,
  stripeCustomerUrl,
  stripePaymentIntentUrl,
  stripeRefundUrl,
  stripeSubscriptionUrl,
} from "@/lib/stripe-links";

export type StripeLinkKind =
  | "customer"
  | "subscription"
  | "charge"
  | "payment_intent"
  | "refund";

interface Props {
  /** The Stripe id (e.g. `cus_…`, `sub_…`, `ch_…`, `pi_…`, `re_…`). */
  id: string | null | undefined;
  /** Which Stripe object — picks the right dashboard route. */
  kind: StripeLinkKind;
  /**
   * Override the rendered label. Defaults to the raw id. Pass a
   * shorter label when space is tight (e.g. the first 8 chars of
   * the id followed by "…").
   */
  label?: string;
  /** Optional className appended to the link element. */
  className?: string;
  /**
   * When `null`/`undefined` ids are passed, render this placeholder
   * instead of nothing. Defaults to "—" (matches the rest of the
   * admin surface's "no value" convention).
   */
  fallback?: React.ReactNode;
}

export function StripeLink({
  id,
  kind,
  label,
  className,
  fallback = <span className="text-ink-soft italic">—</span>,
}: Props) {
  const href = urlForKind(kind, id);
  if (!href) return <>{fallback}</>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-baseline gap-1 font-mono text-[12px] text-ink-soft hover:text-tangerine-deeper transition-colors ${className ?? ""}`}
      title={`Open ${kind.replace("_", " ")} in Stripe dashboard`}
    >
      <span className="break-all">{label ?? id}</span>
      <ExternalLink
        className="w-3 h-3 stroke-[1.75] shrink-0 translate-y-[1px]"
        aria-hidden="true"
      />
    </a>
  );
}

function urlForKind(
  kind: StripeLinkKind,
  id: string | null | undefined,
): string | null {
  switch (kind) {
    case "customer":
      return stripeCustomerUrl(id);
    case "subscription":
      return stripeSubscriptionUrl(id);
    case "charge":
      return stripeChargeUrl(id);
    case "payment_intent":
      return stripePaymentIntentUrl(id);
    case "refund":
      return stripeRefundUrl(id);
  }
}
