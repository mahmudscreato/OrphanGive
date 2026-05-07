import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipCancelledEmailProps = {
  firstName: string;
  childName: string;
  browseUrl: string;
};

export function SponsorshipCancelledEmail({
  firstName,
  childName,
  browseUrl,
}: SponsorshipCancelledEmailProps) {
  return (
    <EmailLayout
      preview={`Your sponsorship of ${childName} has ended.`}
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
        cancelled. No more charges will occur.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        We&rsquo;re grateful for your support — every month you contributed
        made a real difference. If you&rsquo;d like to resume in the future,
        you can browse children anytime.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
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
        If you cancelled by mistake or want to discuss this with us, simply
        reply to this email.
      </Text>
    </EmailLayout>
  );
}

export default SponsorshipCancelledEmail;
