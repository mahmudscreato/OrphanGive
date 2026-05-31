import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type RevealApprovedEmailProps = {
  firstName: string;
  childName: string;
  childId: string;
  fieldLabel: string;
  profileUrl: string;
};

export function RevealApprovedEmail({
  firstName,
  childName,
  fieldLabel,
  profileUrl,
}: RevealApprovedEmailProps) {
  return (
    <EmailLayout
      preview={`You can now see ${fieldLabel} for ${childName}.`}
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
        Good news — you can now see{" "}
        <strong style={{ color: tokens.ink }}>{fieldLabel}</strong> on{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong>
        &rsquo;s profile. Our team reviewed your request and you&rsquo;re
        cleared.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0 0 24px 0",
        }}
      >
        This access lasts 90 days, then you can request again if you
        still need it. We trust you with this — please keep it to
        yourself. {childName}&rsquo;s safety is the reason we hold it
        closely.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={profileUrl}>
          Open {childName}&rsquo;s profile
        </EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default RevealApprovedEmail;
