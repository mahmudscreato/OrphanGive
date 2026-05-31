// Form-acks lot — submitter acknowledgement for the /contact form
// (kind = "contact": general support enquiry).
//
// Recipient: whoever submitted the contact form. Fires from
// POST /api/contact after the form_submission DB row is written and
// the existing OperationalNoticeEmail admin alert is dispatched.
//
// Tone: warm, friendly, conversational. We're acknowledging a
// message, not opening a ticket. Sets a soft expectation without
// committing to an SLA we don't have.
//
// Variables: only fields the contact form captures.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type ContactFormAckEmailProps = {
  /** Submitter's full name as entered on the form. */
  senderName: string;
  /** The subject label (already humanised by the route — e.g.
   *  "Sponsorship question", not the raw enum key). */
  subjectLabel: string;
};

export function ContactFormAckEmail({
  senderName,
  subjectLabel,
}: ContactFormAckEmailProps) {
  const firstName = senderName.trim().split(/\s+/)[0] || senderName;

  return (
    <EmailLayout
      preview="We got your message — we'll be in touch soon."
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
        Hi {firstName},
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        We got your message about{" "}
        <strong style={{ color: tokens.ink }}>
          {subjectLabel.toLowerCase()}
        </strong>
        . Thank you for taking the time to write to us.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Someone from our small team will read it and write back to
        you. We try to respond within a couple of working days — if
        it&rsquo;s urgent, just reply with &ldquo;urgent&rdquo; in
        the subject and we&rsquo;ll bump it up the queue.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        Anything to add? Just reply to this email — it reaches the
        same inbox.
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

export default ContactFormAckEmail;
