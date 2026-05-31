// Session 58.2-overnight Task 2 — thank-you email for campaign donations.
//
// Campaign donations are one-time gifts to a cause (feed-a-child,
// winter-clothing, emergency-aid, etc.) that aren't tied to a specific
// child. The standard SponsorshipWelcomeEmail won't work for them
// because it personalizes around a child name; that filter was added
// in Session 58.2 (handlePaymentIntentSucceeded).
//
// This template uses cause-language instead of child-language. It
// covers two cases:
//   - Package-backed: causeName comes from donation_package.name_en
//     (e.g. "Feed a child for a week")
//   - Custom amount with no package: causeName falls back to a
//     generic "Your generous gift" label

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export interface CampaignDonationThankYouEmailProps {
  donorFirstName: string;
  /** Pre-formatted with currency symbol/code, e.g. "$25 USD" or "£14 GBP". */
  amount: string;
  /** Human label for the cause (donation_package.name_en or fallback). */
  causeName: string;
  /** Stable tag for footer copy / future filtering. Null for custom amounts. */
  causeTag: string | null;
  paidAt: Date;
  dashboardUrl: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CampaignDonationThankYouEmail({
  donorFirstName,
  amount,
  causeName,
  causeTag,
  paidAt,
  dashboardUrl,
}: CampaignDonationThankYouEmailProps) {
  return (
    <EmailLayout preview={`Thank you, ${donorFirstName} — your gift is on its way.`}>
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
        Thank you, {donorFirstName}.
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Your gift of <strong style={{ color: tokens.ink }}>{amount}</strong>{" "}
        to <strong style={{ color: tokens.ink }}>{causeName}</strong> is
        on its way to the children and families we serve in Bangladesh.
        We&rsquo;ll write back with how it&rsquo;s being used, once
        it&rsquo;s landed.
      </Text>

      <MetadataCard>
        <Text
          style={{
            fontFamily: tokens.serif,
            fontSize: "20px",
            fontWeight: 500,
            color: tokens.ink,
            margin: "0 0 12px 0",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {causeName}
        </Text>
        <MetadataRow label="Gift amount" value={amount} />
        <MetadataRow label="Date" value={formatDate(paidAt)} />
        {causeTag ? <MetadataRow label="Cause" value={causeTag} /> : null}
      </MetadataCard>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "20px 0 24px 0",
        }}
      >
        A separate receipt from Stripe is heading to your inbox too.
        Whenever you want to give again — to a specific child or
        another cause — your dashboard has the options laid out.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>Open your giving</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default CampaignDonationThankYouEmail;
