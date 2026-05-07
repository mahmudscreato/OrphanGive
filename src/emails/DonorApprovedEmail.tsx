import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type DonorApprovedEmailProps = {
  firstName: string;
  browseUrl: string;
};

export function DonorApprovedEmail({
  firstName,
  browseUrl,
}: DonorApprovedEmailProps) {
  return (
    <EmailLayout preview="Your account has been approved. You can now sponsor children.">
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
        We&rsquo;re delighted to welcome you to OrphanGive. Your account has
        been approved, and you can now sponsor children through Children&rsquo;s
        Heaven Trust.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        Each child you sponsor is a relationship you&rsquo;ll build over months
        and years. You&rsquo;ll see updates from their lives, receive their
        school progress, and know your support is making a difference. Take
        your time finding the right child for you.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 16px 0" }}>
        <EmailButton href={browseUrl}>Browse children</EmailButton>
      </Section>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If you have any questions, simply reply to this email — our team reads
        every message.
      </Text>
    </EmailLayout>
  );
}

export default DonorApprovedEmail;
