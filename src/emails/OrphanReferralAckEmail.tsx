// Form-acks lot — submitter acknowledgement for the /contact form
// (kind = "orphan_referral": someone referring a child for review).
//
// Recipient: whoever submitted the referral. Fires from
// POST /api/contact after the form_submission row + admin alert.
//
// Tone: serious-gentle. This is a sensitive context — a person has
// thought enough about a vulnerable child to write to us. Honor
// that without overpromising. We CANNOT commit to taking the child;
// we CAN commit to reviewing carefully.
//
// Founder voice: warm but honest. "Not every referral results in
// onboarding — but every one is reviewed." No sappy adjectives, no
// charity-marketing tone.
//
// Variables: only fields the form captures.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type OrphanReferralAckEmailProps = {
  senderName: string;
  /** The child's first name as the referrer entered it. Used to make
   *  the ack feel specific to this child rather than generic. */
  childFirstName: string;
};

export function OrphanReferralAckEmail({
  senderName,
  childFirstName,
}: OrphanReferralAckEmailProps) {
  const firstName = senderName.trim().split(/\s+/)[0] || senderName;
  // Trim + sanitise the child name lightly for the body — referrer
  // typed it, no validation upstream.
  const safeChildName =
    childFirstName.trim().replace(/[<>"]/g, "").slice(0, 40) || "the child";

  return (
    <EmailLayout
      preview={`We received your referral for ${safeChildName} — thank you.`}
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
        We received your referral about{" "}
        <strong style={{ color: tokens.ink }}>{safeChildName}</strong>.
        It takes care to reach out about a child you&rsquo;ve seen
        struggling, and we&rsquo;re grateful you did.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Our team will review what you&rsquo;ve shared carefully. To
        be honest with you up front: not every referral becomes a
        sponsored placement — we have to weigh safeguarding,
        capacity, and what the child and their family actually need.
        But every referral we receive is reviewed, and we&rsquo;ll
        write back to you with what we can do.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        This usually takes a few working days. If the situation
        you&rsquo;ve described is urgent or worsening, please reply
        with any new context and we&rsquo;ll prioritise it.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If you need to add or change anything, just reply to this
        email.
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

export default OrphanReferralAckEmail;
