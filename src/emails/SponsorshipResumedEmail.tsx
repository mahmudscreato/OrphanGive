// Session 61.3 hotfix — notification for an admin-initiated resume
// of a paused sponsorship.
//
// Why this template exists (and not a flag on SponsorshipPausedEmail
// or a reuse of SponsorshipWelcomeEmail):
//   - Paused/Resumed are semantically opposite — a flag would split
//     the body in half, which is worse than two focused templates.
//   - Welcome's body is materially wrong for resume ("you've just
//     signed up", multi-sponsorship checkout context).
//   - SponsorshipActivatedEmail is queue-promote-specific copy ("the
//     previous sponsor's term has ended").
//
// Donor self-resume does NOT send an email today (see
// /api/sponsorship/[id]/resume — explicit comment justifying the
// omission). Admin resume DOES send because the donor didn't act and
// the absence of any signal would erode trust ("did my pause take
// effect or not?"). The byAdmin prop is therefore implicitly true at
// every callsite today; kept as a prop so a future donor-resume
// wire-in can reuse the same template with `byAdmin: false`.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipResumedEmailProps = {
  firstName: string;
  childName: string;
  dashboardUrl: string;
  byAdmin?: boolean;
  adminReason?: string | null;
};

export function SponsorshipResumedEmail({
  firstName,
  childName,
  dashboardUrl,
  byAdmin = false,
  adminReason,
}: SponsorshipResumedEmailProps) {
  const trimmedReason = adminReason?.trim();
  const lead = byAdmin
    ? "has been resumed by the OrphanGive team. Your monthly billing will pick up on the next regular date."
    : "has been resumed. Your monthly billing will pick up on the next regular date.";

  return (
    <EmailLayout
      preview={`Your sponsorship of ${childName} has been resumed.`}
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
        Thank you for staying with {childName}. You can review the
        sponsorship anytime in your dashboard.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>View sponsorship</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipResumedEmail;
