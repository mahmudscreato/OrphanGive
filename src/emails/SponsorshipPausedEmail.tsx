import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipPausedEmailProps = {
  firstName: string;
  childName: string;
  resumeUrl: string;
};

export function SponsorshipPausedEmail({
  firstName,
  childName,
  resumeUrl,
}: SponsorshipPausedEmailProps) {
  return (
    <EmailLayout
      preview={`Your sponsorship of ${childName} is paused.`}
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
        <strong style={{ color: tokens.ink }}>{childName}</strong> has been
        paused. No charges will happen until you resume it.{" "}
        {childName}&rsquo;s sponsorship slot remains reserved for you.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0 0 24px 0",
        }}
      >
        You can resume anytime — your billing will pick up on the next
        regular monthly date.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={resumeUrl}>Resume sponsorship</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipPausedEmail;
