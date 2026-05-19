import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipPausedEmailProps = {
  firstName: string;
  childName: string;
  resumeUrl: string;
  // Session 61.3 hotfix — when the pause was initiated by the
  // OrphanGive admin team (not the donor themselves), the copy
  // shifts to explicitly attribute the action so the donor doesn't
  // think their account was charged silently. Optional + defaults
  // to the donor-self-action wording for backwards compat with the
  // donor /api/sponsorship/[id]/pause caller.
  byAdmin?: boolean;
  // Free-text reason captured from the admin's modal. Rendered as an
  // italic line under the lead paragraph when present. Templates
  // tolerate null / undefined / empty — only renders when set.
  adminReason?: string | null;
};

export function SponsorshipPausedEmail({
  firstName,
  childName,
  resumeUrl,
  byAdmin = false,
  adminReason,
}: SponsorshipPausedEmailProps) {
  const lead = byAdmin
    ? // Admin-initiated pause: explicit attribution + reassurance the
      // slot is still reserved. Mirror's "has been paused" passive
      // voice but adds "by the OrphanGive team" so the donor knows it
      // wasn't them.
      `Your sponsorship of ${childName} has been paused by the OrphanGive team. No charges will happen until it's resumed. ${childName}'s sponsorship slot remains reserved for you.`
    : `Your sponsorship of ${childName} has been paused. No charges will happen until you resume it. ${childName}'s sponsorship slot remains reserved for you.`;
  const trimmedReason = adminReason?.trim();

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
        {lead.split(childName).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <strong style={{ color: tokens.ink }}>{childName}</strong>
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
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
          Note from our team: {trimmedReason}
        </Text>
      ) : null}

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0 0 24px 0",
        }}
      >
        {byAdmin
          ? "You can resume anytime — or reply to this email if you have any questions."
          : "You can resume anytime — your billing will pick up on the next regular monthly date."}
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={resumeUrl}>Resume sponsorship</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipPausedEmail;
