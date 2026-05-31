// Form-acks lot — submitter acknowledgement email for the
// /for-charities partnership inquiry form.
//
// Recipient: whoever submitted the partnership inquiry. Fires once,
// from POST /api/partnership-inquiry immediately after the row is
// persisted to the partnership_inquiry collection.
//
// Tone: professional-warm, partner-to-partner. We're acknowledging
// their interest, not promising onboarding. The actual review is
// handled manually by our team via /admin/partnerships.
//
// Variables: only fields the form captures + persists.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { INQUIRY_TYPE_LABELS, type InquiryType } from "@/lib/partnership-inquiry-types";

export type PartnershipInquiryAckEmailProps = {
  contactName: string;
  organisationName: string;
  inquiryType: InquiryType;
};

export function PartnershipInquiryAckEmail({
  contactName,
  organisationName,
  inquiryType,
}: PartnershipInquiryAckEmailProps) {
  const firstName = contactName.trim().split(/\s+/)[0] || contactName;
  const typeLabel = INQUIRY_TYPE_LABELS[inquiryType];

  return (
    <EmailLayout
      preview={`Thanks for reaching out — we received your inquiry from ${organisationName}.`}
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
        Thanks, {firstName}.
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        We received your inquiry from{" "}
        <strong style={{ color: tokens.ink }}>{organisationName}</strong>{" "}
        about{" "}
        <strong style={{ color: tokens.ink }}>
          {typeLabel.toLowerCase()}
        </strong>
        .
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Our team will review it carefully and write back within a few
        working days. Partnerships are a meaningful step for us — we
        want to do them properly rather than quickly.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If you have anything to add in the meantime, just reply to
        this email — it reaches us.
      </Text>

      <Section style={{ paddingTop: "16px" }}>
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            margin: 0,
          }}
        >
          — The OrphanGive team
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default PartnershipInquiryAckEmail;
