// Fires when promoteQueue() promotes a queued sponsorship to active
// (Session 14.7 Phase 2). Two trigger points:
//   • Stripe customer.subscription.deleted webhook → previous active
//     ended naturally or was cancelled, the queued head moves up
//   • /api/sponsorship/[id]/cancel of an active row → queued head
//     promotes immediately
//
// Tone: warmth on activation. The donor's been waiting, sometimes
// for months — this is the moment their support actually starts.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipActivatedEmailProps = {
  firstName: string;
  childName: string;
  childDistrict: string | null;
  childAge: number | null;
  amountUsd: number;
  durationMonths: number | null;
  scheduledEndDate: string | null; // ISO
  paymentScheduleLabel: "monthly" | "monthly_prepaid";
  causeLabel?: string;
  visibilityLabel?: string;
  sponsorshipUrl: string;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SponsorshipActivatedEmail({
  firstName,
  childName,
  childDistrict,
  childAge,
  amountUsd,
  durationMonths,
  scheduledEndDate,
  paymentScheduleLabel,
  causeLabel,
  visibilityLabel,
  sponsorshipUrl,
}: SponsorshipActivatedEmailProps) {
  const endStr = formatDate(scheduledEndDate);
  const subtitle = [childDistrict, childAge != null ? `age ${childAge}` : null]
    .filter(Boolean)
    .join(" · ");
  const isPrepaid = paymentScheduleLabel === "monthly_prepaid";

  return (
    <EmailLayout
      preview={`Your sponsorship of ${childName} has begun.`}
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
        Your sponsorship of{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong>{" "}
        starts today. The previous sponsor&rsquo;s term wrapped up,
        and your spot is now live. Thank you for waiting — it&rsquo;s
        good to have you in {childName}&rsquo;s corner.
      </Text>

      <MetadataCard>
        <Text
          style={{
            fontFamily: tokens.serif,
            fontSize: "22px",
            fontWeight: 500,
            color: tokens.ink,
            margin: "0 0 4px 0",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {childName}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontSize: "13px",
              color: tokens.inkSubtle,
              margin: "0 0 12px 0",
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        <MetadataRow
          label="Amount"
          value={
            durationMonths
              ? `${formatUsd(amountUsd)} / month · ${durationMonths} ${
                  durationMonths === 1 ? "month" : "months"
                }`
              : `${formatUsd(amountUsd)} / month`
          }
          emphasized
        />
        {endStr ? (
          <MetadataRow
            label={isPrepaid ? "Coverage ends" : "Sponsorship ends"}
            value={endStr}
          />
        ) : null}
        {causeLabel ? (
          <MetadataRow label="Supporting" value={causeLabel} />
        ) : null}
        {visibilityLabel ? (
          <MetadataRow label="Visibility" value={visibilityLabel} />
        ) : null}
      </MetadataCard>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "20px 0 24px 0",
        }}
      >
        Over the coming weeks you&rsquo;ll start receiving updates
        from {childName}&rsquo;s life — small moments, school progress,
        the occasional photo. Thank you for being there.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={sponsorshipUrl}>Open your sponsorship</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipActivatedEmail;
