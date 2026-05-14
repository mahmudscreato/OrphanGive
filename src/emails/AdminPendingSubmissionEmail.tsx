// Session 46 — Admin email template for new pending DI submissions.
//
// Plain, internal-feeling email. No marketing chrome — admins are
// looking for a quick "what's pending and where" in their inbox.
//
// Privacy: this email contains the DI's first name and the child's
// display_name (both data the DI is permitted to see). It contains
// NO donor data and NO sponsorship details.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

export type AdminPendingSubmissionEmailProps = {
  collectionLabel: string; // "moment" / "report" / "delivery" / "child profile change"
  submitterFirstName: string;
  childDisplayName: string | null;
  summary: string;
  reviewUrl: string; // deep link to Directus admin row
};

export function AdminPendingSubmissionEmail({
  collectionLabel,
  submitterFirstName,
  childDisplayName,
  summary,
  reviewUrl,
}: AdminPendingSubmissionEmailProps) {
  const subjectLine = childDisplayName
    ? `New ${collectionLabel} from ${submitterFirstName} for ${childDisplayName}`
    : `New ${collectionLabel} from ${submitterFirstName}`;

  return (
    <EmailLayout preview={subjectLine}>
      <Heading
        as="h1"
        style={{
          fontFamily: tokens.serif,
          fontSize: "24px",
          fontWeight: 500,
          color: tokens.ink,
          letterSpacing: "-0.02em",
          margin: "0 0 16px 0",
          lineHeight: 1.2,
        }}
      >
        New {collectionLabel} pending review
      </Heading>

      <Section
        style={{
          margin: "0 0 20px 0",
        }}
      >
        <Text
          style={{
            fontFamily: tokens.sans,
            fontSize: "15px",
            color: tokens.ink,
            lineHeight: 1.6,
            margin: "0 0 12px 0",
          }}
        >
          <strong>{submitterFirstName}</strong> just submitted a new{" "}
          {collectionLabel}
          {childDisplayName ? (
            <>
              {" for "}
              <strong>{childDisplayName}</strong>
            </>
          ) : null}
          .
        </Text>
        <Text
          style={{
            fontFamily: tokens.sans,
            fontSize: "14px",
            color: tokens.inkSubtle,
            lineHeight: 1.6,
            margin: "0",
          }}
        >
          {summary}
        </Text>
      </Section>

      <Section style={{ margin: "0 0 24px 0" }}>
        <EmailButton href={reviewUrl}>Review in Directus</EmailButton>
      </Section>

      <Text
        style={{
          fontFamily: tokens.sans,
          fontSize: "12px",
          color: tokens.inkSubtle,
          lineHeight: 1.5,
          margin: "16px 0 0 0",
        }}
      >
        This is an internal admin notification from the OrphanGive Data
        Inputter dashboard. Submissions stay in <em>pending</em> until you
        approve or reject them.
      </Text>
    </EmailLayout>
  );
}
