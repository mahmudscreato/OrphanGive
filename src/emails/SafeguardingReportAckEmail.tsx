// Submitter acknowledgement for a public safeguarding report.
//
// Fires ONLY if the reporter chose to give an email. Deliberately
// minimal and non-committal: it confirms receipt and points to
// emergency services — it carries NO case details (no description, no
// type, no status), because a safeguarding ack may land in a shared or
// insecure mailbox and must not echo sensitive content back.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type SafeguardingReportAckEmailProps = {
  reporterName?: string | null;
};

export function SafeguardingReportAckEmail({
  reporterName,
}: SafeguardingReportAckEmailProps) {
  const first = (reporterName ?? "").trim().split(/\s+/)[0] || null;

  return (
    <EmailLayout preview="Your safeguarding report has been received.">
      <Heading
        as="h1"
        style={{
          fontFamily: tokens.serif,
          fontSize: "26px",
          fontWeight: 500,
          color: tokens.ink,
          letterSpacing: "-0.02em",
          margin: "0 0 16px 0",
          lineHeight: 1.15,
        }}
      >
        {first ? `Thank you, ${first}.` : "Thank you."}
      </Heading>

      <Text
        style={{ fontSize: "16px", lineHeight: 1.65, color: tokens.ink, margin: "0 0 16px 0" }}
      >
        Your report has been received and will be reviewed in confidence by
        our safeguarding lead. We take every concern seriously.
      </Text>

      <Text
        style={{ fontSize: "16px", lineHeight: 1.65, color: tokens.ink, margin: "0 0 16px 0" }}
      >
        <strong style={{ color: tokens.ink }}>
          If a child is in immediate danger, please contact your local
          police or emergency services now — do not wait for us.
        </strong>
      </Text>

      <Section style={{ paddingTop: "8px" }}>
        <Text style={{ fontSize: "13.5px", lineHeight: 1.6, color: tokens.inkSubtle, margin: 0 }}>
          — OrphanGive Safeguarding
        </Text>
      </Section>
    </EmailLayout>
  );
}

export default SafeguardingReportAckEmail;
