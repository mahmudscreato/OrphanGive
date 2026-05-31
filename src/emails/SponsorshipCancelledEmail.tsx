import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipCancelledEmailProps = {
  firstName: string;
  childName: string;
  browseUrl: string;
  // Session 61.3 hotfix — when admin initiated the cancel (vs the
  // donor doing it from /dashboard), attribute the action +
  // surface the admin's stated reason inline. The donor route's
  // existing callsite omits both props so its behaviour is
  // unchanged.
  byAdmin?: boolean;
  adminReason?: string | null;
};

export function SponsorshipCancelledEmail({
  firstName,
  childName,
  browseUrl,
  byAdmin = false,
  adminReason,
}: SponsorshipCancelledEmailProps) {
  const trimmedReason = adminReason?.trim();
  const lead = byAdmin
    ? "has been cancelled by our team. No more charges will go through."
    : "has ended. No more charges will go through.";

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
        <strong style={{ color: tokens.ink }}>{childName}</strong> {lead}
      </Text>

      {byAdmin && trimmedReason ? (
        <Text
          style={{
            fontSize: "14px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            fontStyle: "italic",
            margin: "0 0 16px 0",
          }}
        >
          A note from our team: {trimmedReason}
        </Text>
      ) : null}

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        Thank you for the months you stood beside {childName}. Each
        one mattered, even when it felt routine on your end. If you
        ever feel like coming back, the door&rsquo;s open — you can
        meet the children whenever you&rsquo;re ready.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
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
        {byAdmin
          ? "If you have questions about this, just hit reply — we'll write back."
          : "If you cancelled by accident or want to talk it through, just hit reply."}
      </Text>
    </EmailLayout>
  );
}

export default SponsorshipCancelledEmail;
