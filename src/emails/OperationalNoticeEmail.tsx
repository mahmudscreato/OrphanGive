// Session 32 — shared email template for operational form
// submissions (contact form, orphan referral, volunteer
// application). Renders inside the same EmailLayout chrome the
// rest of the transactional emails use, so the inbox style is
// consistent with sponsorship welcome / receipt / cancellation
// emails.
//
// The template accepts a structured `sections` payload rather
// than freeform HTML — keeps the rendered email readable in any
// client and avoids HTML-injection risk from form values.

import { Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type OperationalSection = {
  /** Section heading (e.g., "Submitted by", "Message"). */
  label: string;
  /** Multi-line plain text content. Newlines preserve as line
   * breaks in the rendered email. */
  body: string;
};

export type OperationalNoticeEmailProps = {
  /** The big headline (e.g., "New contact form message"). */
  heading: string;
  /** Short eyebrow line above the heading (e.g., "Sponsorship question"). */
  eyebrow?: string | null;
  /** Optional one-line summary directly under the heading. */
  intro?: string | null;
  /** Structured content sections. */
  sections: OperationalSection[];
  /** Optional reply-to nudge (e.g., the sender's email). */
  replyToNudge?: string | null;
};

export function OperationalNoticeEmail({
  heading,
  eyebrow,
  intro,
  sections,
  replyToNudge,
}: OperationalNoticeEmailProps) {
  const previewText = intro?.slice(0, 80) ?? heading;
  return (
    <EmailLayout preview={previewText}>
      <Section>
        {eyebrow ? (
          <Text
            style={{
              fontFamily: tokens.mono,
              fontSize: "11px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tokens.tangerine,
              margin: "0 0 8px 0",
            }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Heading
          as="h1"
          style={{
            fontFamily: tokens.serif,
            fontSize: "24px",
            color: tokens.ink,
            fontWeight: 500,
            margin: "0 0 12px 0",
            lineHeight: 1.2,
          }}
        >
          {heading}
        </Heading>
        {intro ? (
          <Text
            style={{
              fontSize: "15px",
              color: tokens.ink,
              margin: "0 0 20px 0",
              lineHeight: 1.55,
            }}
          >
            {intro}
          </Text>
        ) : null}
      </Section>

      {sections.map((s, i) => (
        <Section key={i} style={{ marginTop: i === 0 ? "12px" : "20px" }}>
          <Text
            style={{
              fontFamily: tokens.mono,
              fontSize: "10.5px",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: tokens.tangerine,
              margin: "0 0 6px 0",
            }}
          >
            {s.label}
          </Text>
          <Text
            style={{
              fontSize: "14px",
              color: tokens.ink,
              margin: 0,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {s.body}
          </Text>
        </Section>
      ))}

      {replyToNudge ? (
        <>
          <Hr
            style={{
              border: "none",
              borderTop: `1px solid ${tokens.border}`,
              margin: "24px 0 16px 0",
            }}
          />
          <Text
            style={{
              fontSize: "13px",
              color: tokens.inkSubtle,
              margin: 0,
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            Reply directly to <strong>{replyToNudge}</strong> to respond.
          </Text>
        </>
      ) : null}
    </EmailLayout>
  );
}

export default OperationalNoticeEmail;
