// Session 61.3 hotfix — donor notification for an admin-issued
// refund.
//
// Replaces the inline minimal JSX tree the Session 61 refund route
// shipped as a placeholder (admin-sponsorships refund/route.tsx
// inline `refundEmailTemplate`). The session shipped that pragmatic
// stub with an explicit follow-up note in the route's header: "add
// a SponsorshipRefundEmail React-Email component". This is that
// component.
//
// Content: amount + currency + (optional) admin reason + the
// "5-10 business days" line + a deep link back to the dashboard
// sponsorship page so the donor can see their full charge history.
//
// No byAdmin prop because donor self-refund doesn't exist (refunds
// are always an admin action).

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipRefundEmailProps = {
  firstName: string;
  childName: string;
  amount: number;
  currency: string;
  // Free-text reason the admin entered in the refund modal. Captured
  // in audit_log too. Rendered as a "Note from our team" italic
  // line when present + non-empty; otherwise omitted.
  adminReason?: string | null;
  dashboardUrl: string;
};

function formatCurrency(amount: number, currency: string): string {
  // Defensive: amount can be string-typed at the boundary if a caller
  // passes a Postgres NUMERIC pass-through. Coerce once here so the
  // template is self-protecting. Same shape Session 61.1 added to the
  // formatMoney admin helpers.
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return safe.toLocaleString("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    // Fallback for unrecognised currency codes.
    return `${safe.toFixed(2)} ${currency || "USD"}`;
  }
}

export function SponsorshipRefundEmail({
  firstName,
  childName,
  amount,
  currency,
  adminReason,
  dashboardUrl,
}: SponsorshipRefundEmailProps) {
  const trimmedReason = adminReason?.trim();
  const formattedAmount = formatCurrency(amount, currency);

  return (
    <EmailLayout
      preview={`A refund of ${formattedAmount} has been issued.`}
    >
      <Heading
        as="h1"
        style={{
          fontFamily: tokens.serif,
          fontSize: "28px",
          fontWeight: 500,
          color: tokens.ink,
          letterSpacing: "-0.02em",
          margin: "0 0 16px 0",
          lineHeight: 1.15,
        }}
      >
        Hello {firstName},
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        We&rsquo;ve sent a refund of{" "}
        <strong style={{ color: tokens.ink }}>{formattedAmount}</strong>{" "}
        back to your card for your sponsorship of{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong>.
      </Text>

      <MetadataCard>
        <MetadataRow label="Refund amount" value={formattedAmount} />
        <MetadataRow label="For" value={`Sponsorship of ${childName}`} />
        {trimmedReason ? (
          <MetadataRow label="A note from our team" value={trimmedReason} />
        ) : null}
      </MetadataCard>

      <Text
        style={{
          fontSize: "14px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "16px 0 24px 0",
        }}
      >
        Refunds usually show up on your statement within 5–10 business
        days — your card issuer sets the exact pace.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>Open sponsorship history</EmailButton>
      </Section>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        Any questions about this refund? Just hit reply — we&rsquo;ll
        write back quickly.
      </Text>
    </EmailLayout>
  );
}

export default SponsorshipRefundEmail;
