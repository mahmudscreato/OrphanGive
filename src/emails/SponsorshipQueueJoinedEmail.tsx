// Confirms a successful queue join (Session 14.7 Phase 2). Fires
// from /api/checkout/init right after a queued sponsorship row is
// created with queue_position > 0. The donor's payment is already
// committed (prepaid: PI succeeded today; recurring: trial_end sub
// holding their card on file).
//
// Tone: gratitude + clarity about the pending nature of their
// sponsorship — they're paid up but their support hasn't started
// yet. Make the timeline concrete (estimated start date) and
// reassuring (refundable until activation).

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipQueueJoinedEmailProps = {
  firstName: string;
  childName: string;
  childDistrict: string | null;
  childAge: number | null;
  queuePosition: number;
  estimatedStartDate: string | null; // ISO
  amountUsd: number;
  durationMonths: number | null;
  paymentScheduleLabel: "prepaid" | "monthly_trial";
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

export function SponsorshipQueueJoinedEmail({
  firstName,
  childName,
  childDistrict,
  childAge,
  queuePosition,
  estimatedStartDate,
  amountUsd,
  durationMonths,
  paymentScheduleLabel,
  causeLabel,
  visibilityLabel,
  sponsorshipUrl,
}: SponsorshipQueueJoinedEmailProps) {
  const startStr = formatDate(estimatedStartDate);
  const subtitle = [childDistrict, childAge != null ? `age ${childAge}` : null]
    .filter(Boolean)
    .join(" · ");
  const isPrepaid = paymentScheduleLabel === "prepaid";

  return (
    <EmailLayout
      preview={`You're in line to sponsor ${childName}.`}
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
        Thank you. You&rsquo;ve reserved the {ordinal(queuePosition)}{" "}
        sponsorship slot for{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong>. Your
        support will begin {startStr ? `around ${startStr}` : "when the current sponsor's term ends"}.
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
          label="Queue position"
          value={`${ordinal(queuePosition)} in line`}
        />
        {startStr ? (
          <MetadataRow label="Estimated start" value={startStr} />
        ) : (
          <MetadataRow label="Begins" value="When the current term ends" />
        )}
        <MetadataRow
          label="Amount"
          value={
            durationMonths
              ? `${formatUsd(amountUsd)} / month · ${durationMonths} ${
                  durationMonths === 1 ? "month" : "months"
                }`
              : `${formatUsd(amountUsd)} / month`
          }
        />
        <MetadataRow
          label="Payment"
          value={
            isPrepaid
              ? `Charged today${
                  durationMonths
                    ? ` · ${formatUsd(amountUsd * durationMonths)} total`
                    : ""
                }`
              : `Card on file · charged on activation`
          }
          emphasized
        />
        {causeLabel ? (
          <MetadataRow label="Supporting" value={causeLabel} />
        ) : null}
        {visibilityLabel ? (
          <MetadataRow label="Visibility" value={visibilityLabel} />
        ) : null}
      </MetadataCard>

      <Text
        style={{
          fontSize: "14px",
          lineHeight: 1.65,
          color: tokens.inkSubtle,
          margin: "20px 0 24px 0",
          fontStyle: "italic",
        }}
      >
        You can cancel this queued sponsorship any time before it
        activates and receive a full refund.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={sponsorshipUrl}>
          Manage your upcoming sponsorship
        </EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipQueueJoinedEmail;
