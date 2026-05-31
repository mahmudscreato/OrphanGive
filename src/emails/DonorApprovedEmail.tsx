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
        We&rsquo;re really glad you&rsquo;re here. Your account is
        approved, and you can now choose a child to sponsor.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        Sponsorship at OrphanGive is a quiet relationship that builds
        over months and years — updates from each child&rsquo;s life,
        school progress, the occasional photo. There&rsquo;s no rush.
        Take your time and find the child who feels right.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 16px 0" }}>
        <EmailButton href={browseUrl}>Meet the children</EmailButton>
      </Section>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If anything&rsquo;s on your mind, just reply to this email — a
        real person from our team reads every message.
      </Text>
    </EmailLayout>
  );
}

export default DonorApprovedEmail;
