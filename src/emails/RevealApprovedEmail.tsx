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
        Good news. Your request to view{" "}
        <strong style={{ color: tokens.ink }}>{fieldLabel}</strong> for{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong> has been
        approved by our team. You can see this information now when you visit{" "}
        {childName}&rsquo;s profile.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0 0 24px 0",
        }}
      >
        This access lasts 90 days, after which you can request again if needed.
        You&rsquo;re trusted with this information — please keep it
        confidential.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={profileUrl}>
          View {childName}&rsquo;s profile
        </EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default RevealApprovedEmail;
