// Admin notification email — a sponsorship payment succeeded.
//
// Internal admin notification, fired from the Stripe webhook at the
// SAME trigger point + idempotency guard as the donation auto-task
// (one payment row → one email). Plain, internal-feeling — admins want
// a quick "who paid, how much, where to look" in their inbox.
//
// Privacy: child FIRST NAME only (Tier-1, public-safe). NO donor card
// details, NO child Tier-3 data. The "Open in Directus" link is where
// authorised admins see the full row.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type AdminSponsorshipNotificationEmailProps = {
  /** Child's first name (Tier-1). null for a campaign donation (no child). */
  childFirstName: string | null;
  amountUsd: number;
  paymentMode: string; // "monthly" | "one_time"
  sponsorshipId: string;
  paymentId: string;
  paidAt: string; // ISO
  reviewUrl: string; // deep link to the Directus admin sponsorship row
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function paymentModeLabel(m: string): string {
  if (m === "monthly") return "Monthly";
  if (m === "one_time") return "One-time";
  return m;
}

export function AdminSponsorshipNotificationEmail({
  childFirstName,
  amountUsd,
  paymentMode,
  sponsorshipId,
  paymentId,
  paidAt,
  reviewUrl,
}: AdminSponsorshipNotificationEmailProps) {
  const childLabel = childFirstName ?? "Campaign donation (no child)";
  return (
    <EmailLayout preview={`New sponsorship payment — ${formatUsd(amountUsd)}`}>
      <Heading
        as="h1"
        style={{
          fontFamily: tokens.serif,
          fontSize: "24px",
          fontWeight: 500,
          color: tokens.ink,
          letterSpacing: "-0.02em",
          margin: "0 0 16px 0",
          lineHeight: 1.2,
        }}
      >
        New sponsorship payment
      </Heading>

      <Section style={{ margin: "0 0 20px 0" }}>
        <Text
          style={{
            fontFamily: tokens.sans,
            fontSize: "15px",
            color: tokens.ink,
            lineHeight: 1.6,
            margin: "0",
          }}
        >
          A {paymentModeLabel(paymentMode).toLowerCase()} sponsorship payment of{" "}
          <strong>{formatUsd(amountUsd)}</strong>
          {childFirstName ? (
            <>
              {" for "}
              <strong>{childFirstName}</strong>
            </>
          ) : null}{" "}
          just succeeded. A delivery task was created automatically.
        </Text>
      </Section>

      <MetadataCard>
        <MetadataRow label="Child" value={childLabel} />
        <MetadataRow label="Amount" value={formatUsd(amountUsd)} emphasized />
        <MetadataRow label="Payment mode" value={paymentModeLabel(paymentMode)} />
        <MetadataRow label="When" value={formatDateTime(paidAt)} />
        <MetadataRow label="Sponsorship ID" value={sponsorshipId} />
        <MetadataRow label="Payment ID" value={paymentId} />
      </MetadataCard>

      <Section style={{ margin: "20px 0 24px 0" }}>
        <EmailButton href={reviewUrl}>Open in Directus</EmailButton>
      </Section>

      <Text
        style={{
          fontFamily: tokens.sans,
          fontSize: "12px",
          color: tokens.inkSubtle,
          lineHeight: 1.5,
          margin: "16px 0 0 0",
        }}
      >
        Internal notification from the donation webhook. Child first name only
        — no donor or sensitive data is included here.
      </Text>
    </EmailLayout>
  );
}
