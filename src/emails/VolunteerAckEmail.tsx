// Form-acks lot — submitter acknowledgement for the /volunteer
// application form.
//
// Recipient: whoever submitted the volunteer application. Fires
// from POST /api/contact (kind = "volunteer") after the
// form_submission row + admin alert.
//
// Tone: appreciative, warm. Volunteer offers matter even when we
// can't take everyone — acknowledge the gesture genuinely, set a
// soft expectation, do NOT promise a role.
//
// Variables: only what the volunteer form captures.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type VolunteerAckEmailProps = {
  senderName: string;
  /** Comma-separated skills list as shown on the form. Already
   *  pre-resolved by the route (incl. "Other: ..." expansion). */
  skillsSummary: string;
};

export function VolunteerAckEmail({
  senderName,
  skillsSummary,
}: VolunteerAckEmailProps) {
  const firstName = senderName.trim().split(/\s+/)[0] || senderName;

  return (
    <EmailLayout
      preview="Thank you for offering to help — we'll be in touch."
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
        Thank you, {firstName}.
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        We received your offer to volunteer with us. The gesture
        matters — we appreciate you taking the time to fill out the
        form.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Someone from our team will review what you&rsquo;ve shared
        ({skillsSummary || "your skills and availability"}) and
        write back if there&rsquo;s a fit with current needs.
        We&rsquo;re a small team, so we can&rsquo;t always match
        every offer to a role straight away — but every offer goes
        on file and we revisit them as new needs come up.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If circumstances change for you, just reply and let us know
        — we&rsquo;ll update your application.
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

export default VolunteerAckEmail;
