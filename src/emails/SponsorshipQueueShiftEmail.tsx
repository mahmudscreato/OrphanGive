// Fires when an active sponsor's sub extension shifts a queued
// donor's start date forward (Session 14.7 Phase 2). Three action
// buttons let the donor choose how to respond — all three link to
// /dashboard/sponsorship/[id]/queue-shift-decision with an action
// query param so the dashboard radio card can pre-select the
// matching option.
//
// Default behaviour: if the donor takes no action within 14 days,
// the daily cron auto-accepts the new date. Make that explicit in
// the body so the donor isn't surprised.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type SponsorshipQueueShiftEmailProps = {
  firstName: string;
  childName: string;
  // Original sponsor's first name when their visibility='named';
  // null otherwise → fall back to "the current sponsor".
  activeSponsorFirstName: string | null;
  oldStartDate: string | null; // ISO
  newStartDate: string | null; // ISO
  decisionUrl: string; // base URL; ?action= appended per button
  // When true, the donor's 14-day decision window expired and the
  // cron auto-accepted the new date on their behalf. The email
  // becomes a confirmation rather than a prompt: heading swaps to
  // "Your sponsorship of [Child] is set to begin on the new start
  // date" and the three action buttons are removed (the donor can
  // still cancel via dashboard if they reconsider, but they don't
  // get nudged here).
  autoAccepted?: boolean;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SponsorshipQueueShiftEmail({
  firstName,
  childName,
  activeSponsorFirstName,
  oldStartDate,
  newStartDate,
  decisionUrl,
  autoAccepted = false,
}: SponsorshipQueueShiftEmailProps) {
  const oldStr = formatDate(oldStartDate);
  const newStr = formatDate(newStartDate);
  const sponsorRef = activeSponsorFirstName ?? "The current sponsor";
  // Build per-button URLs. Append '?action=' to the base URL the
  // caller passes us; if there's already a query string, switch to
  // '&'. The dashboard reads ?action= on mount and pre-selects the
  // matching radio.
  const sep = decisionUrl.includes("?") ? "&" : "?";
  const acceptHref = `${decisionUrl}${sep}action=accept`;
  const transferHref = `${decisionUrl}${sep}action=transfer`;
  const refundHref = `${decisionUrl}${sep}action=refund`;

  return (
    <EmailLayout
      preview={
        autoAccepted
          ? `Your sponsorship of ${childName} is set to begin on the new start date.`
          : `Your sponsorship of ${childName} has a new start date.`
      }
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
        {autoAccepted ? (
          <>
            Your upcoming sponsorship of{" "}
            <strong style={{ color: tokens.ink }}>{childName}</strong>{" "}
            has been confirmed to begin on its new start date
            {newStr ? ` (${newStr})` : ""}. The 14-day window for
            choosing an alternative passed without a response, so we
            kept your support on track automatically.
          </>
        ) : (
          <>
            {sponsorRef} extended their support of{" "}
            <strong style={{ color: tokens.ink }}>{childName}</strong>.
            Your upcoming sponsorship start date has shifted
            {oldStr ? ` from ${oldStr}` : ""}
            {newStr ? ` to ${newStr}` : ""}.
          </>
        )}
      </Text>

      {autoAccepted ? (
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.65,
            color: tokens.inkSubtle,
            margin: "16px 0 0 0",
          }}
        >
          If circumstances have changed and you&rsquo;d like to cancel
          and receive a refund, you can do so from your dashboard
          before the start date.
        </Text>
      ) : (
        <>
          <Text
            style={{
              fontSize: "15px",
              lineHeight: 1.65,
              color: tokens.ink,
              margin: "20px 0 8px 0",
              fontWeight: 600,
            }}
          >
            How would you like to proceed?
          </Text>

          <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
            <EmailButton href={acceptHref}>Accept the new date</EmailButton>
          </Section>
          <Section style={{ textAlign: "center", padding: "4px 0 4px 0" }}>
            <Text
              style={{
                fontSize: "13.5px",
                color: tokens.inkSubtle,
                margin: 0,
              }}
            >
              <a
                href={transferHref}
                style={{
                  color: tokens.tangerine,
                  textDecoration: "underline",
                }}
              >
                Transfer to another awaiting child
              </a>
              {" · "}
              <a
                href={refundHref}
                style={{
                  color: tokens.tangerine,
                  textDecoration: "underline",
                }}
              >
                Cancel and refund
              </a>
            </Text>
          </Section>

          <Text
            style={{
              fontSize: "13.5px",
              lineHeight: 1.65,
              color: tokens.inkSubtle,
              margin: "24px 0 0 0",
              fontStyle: "italic",
            }}
          >
            If you don&rsquo;t respond within 14 days, your sponsorship
            will automatically begin on the new start date — no action
            needed.
          </Text>
        </>
      )}
    </EmailLayout>
  );
}

export default SponsorshipQueueShiftEmail;
