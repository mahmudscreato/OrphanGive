// Spine Lot 2 — donor email fired when admin publishes an approved
// report to the donor.
//
// PRIVACY POSTURE (load-bearing):
//   - Email body contains ONLY: child first name, donor first name,
//     a single short line stating an update is ready, the dashboard
//     link.
//   - Does NOT include the report content, donor_text, photo, or
//     any Tier-3 child field (district, DOB, guardian, school).
//   - The donor pulls the actual report from the dashboard — that
//     surface is server-rendered with the right scope + privacy
//     guards (curated donor_text only). Email is a notification,
//     not the message body.
//
// Tone: short, warm, dignified. Matches the existing donor
// transactional emails (SponsorshipActivatedEmail, MonthlyReceiptEmail).
// No emoji, no urgency drum, no preview of content.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type ReportPublishedEmailProps = {
  /** Donor first name (Tier-1 — already in their own user record). */
  firstName: string;
  /** Child display name (Tier-1 — what donors see on the public
   *  child page). NEVER pass district/age/guardian here. */
  childName: string;
  /** "progress" or "deployment" — drives a tiny copy fork. progress =
   *  ongoing-sponsor monthly cycle; deployment = one-time gift
   *  delivery. Null when the row was the legacy 'pending' lifecycle. */
  reportType: "progress" | "deployment" | null;
  /** Full URL to /dashboard/sponsorship/[id] so the donor lands
   *  directly on the report. Built via siteUrl() in the caller. */
  sponsorshipUrl: string;
};

export function ReportPublishedEmail({
  firstName,
  childName,
  reportType,
  sponsorshipUrl,
}: ReportPublishedEmailProps) {
  const isDeployment = reportType === "deployment";
  const previewCopy = isDeployment
    ? `Your gift reached ${childName}.`
    : `${childName} has a new update for you.`;
  const headlineCopy = isDeployment
    ? `Your gift reached ${childName}`
    : `A moment from ${childName}`;
  const ctaCopy = isDeployment ? "See the moment" : "Read the update";

  return (
    <EmailLayout preview={previewCopy}>
      <Heading
        as="h1"
        style={{
          fontFamily: tokens.serif,
          fontSize: "26px",
          fontWeight: 500,
          color: tokens.ink,
          letterSpacing: "-0.02em",
          margin: "0 0 14px 0",
          lineHeight: 1.2,
        }}
      >
        {headlineCopy}
      </Heading>

      <Text
        style={{
          fontSize: "15.5px",
          color: tokens.ink,
          lineHeight: 1.7,
          margin: "0 0 16px 0",
        }}
      >
        Hi {firstName},
      </Text>

      {isDeployment ? (
        <Text
          style={{
            fontSize: "15.5px",
            color: tokens.ink,
            lineHeight: 1.7,
            margin: "0 0 24px 0",
          }}
        >
          Your gift to{" "}
          <strong style={{ color: tokens.ink }}>{childName}</strong>{" "}
          arrived. Our team has written a short note about how it
          landed, with a photo or two. Open your dashboard whenever
          you have a minute — it&rsquo;s waiting for you.
        </Text>
      ) : (
        <Text
          style={{
            fontSize: "15.5px",
            color: tokens.ink,
            lineHeight: 1.7,
            margin: "0 0 24px 0",
          }}
        >
          There&rsquo;s a fresh update from{" "}
          <strong style={{ color: tokens.ink }}>{childName}</strong> on
          your dashboard — a small moment from this month that we
          thought you&rsquo;d want to see.
        </Text>
      )}

      <Section style={{ margin: "0 0 24px 0" }}>
        <EmailButton href={sponsorshipUrl}>{ctaCopy}</EmailButton>
      </Section>

      <Text
        style={{
          fontSize: "13px",
          color: tokens.inkSubtle,
          lineHeight: 1.6,
          margin: "0",
        }}
      >
        Thank you for being part of {childName}&rsquo;s story.
      </Text>
    </EmailLayout>
  );
}
