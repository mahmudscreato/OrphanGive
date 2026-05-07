import { Heading, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { MetadataCard } from "./components/EmailMetadata";

export type RevealDeniedEmailProps = {
  firstName: string;
  childName: string;
  fieldLabel: string;
  adminNote?: string | null;
};

export function RevealDeniedEmail({
  firstName,
  childName,
  fieldLabel,
  adminNote,
}: RevealDeniedEmailProps) {
  const note = adminNote?.trim();
  return (
    <EmailLayout
      preview={`We've reviewed your request to view ${fieldLabel}.`}
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
        Thank you for your request to view{" "}
        <strong style={{ color: tokens.ink }}>{fieldLabel}</strong> for{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong>. After
        review, our team has decided not to grant this access at this time.
      </Text>

      {note ? (
        <MetadataCard variant="soft">
          <Text
            style={{
              fontFamily: tokens.mono,
              fontSize: "10.5px",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: tokens.inkSubtle,
              margin: "0 0 8px 0",
            }}
          >
            Note from our team
          </Text>
          <Text
            style={{
              fontSize: "15px",
              lineHeight: 1.6,
              color: tokens.ink,
              margin: 0,
              fontStyle: "italic",
              borderLeft: `3px solid ${tokens.tangerine}`,
              paddingLeft: "12px",
            }}
          >
            {note}
          </Text>
        </MetadataCard>
      ) : null}

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "16px 0 16px 0",
        }}
      >
        This isn&rsquo;t a reflection on you. We hold this information closely
        because the children we work with are vulnerable, and our duty of care
        comes first. You may request again in the future if circumstances
        change.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0",
        }}
      >
        If you&rsquo;d like to discuss this further, please reply to this email
        — our team will respond personally.
      </Text>
    </EmailLayout>
  );
}

export default RevealDeniedEmail;
