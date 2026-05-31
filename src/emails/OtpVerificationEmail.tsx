// Email-refinement lot — donor signup verification code email.
//
// Replaces the inline raw HTML string that lived in
// src/lib/donor-signup.ts (renderOtpEmail) so the OTP arrives in
// the same EmailLayout chrome every other transactional email uses:
// cream page bg, padded white card, standardized footer with the
// canonical Goodverse + CHT attribution + printAgraphy credit link.
//
// Behaviour is unchanged from the old raw HTML — the donor sees the
// same 6-digit code in a monospace dashed box, the same 10-minute
// expiry copy, the same "ignore if you didn't request this" line.
// Only the surrounding frame is now consistent with the rest of
// the email surface.
//
// Privacy: no dynamic data beyond firstName (already in the user's
// own record) + the 6-digit code (server-issued, single-use,
// 10-min TTL). No child / sponsorship / donor-list leakage.

import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

export type OtpVerificationEmailProps = {
  /** First name + last name combined (e.g. "Mahmud Hossain") or
   *  "there" fallback — caller already sanitises. */
  fullName: string;
  /** Six-digit numeric code as a plain string. */
  code: string;
};

export function OtpVerificationEmail({
  fullName,
  code,
}: OtpVerificationEmailProps) {
  // Defensive: caller already trims + sanitises but be belt-and-braces
  // since this is a security-touching email.
  const safeName = (fullName || "there").replace(/[<>"]/g, "").slice(0, 80);

  return (
    <EmailLayout preview={`Your OrphanGive verification code is ${code}.`}>
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
        Hi {safeName},
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Use this 6-digit code to finish setting up your OrphanGive
        donor account:
      </Text>

      {/* Code block — mono, generous padding, dashed tangerine
          border so it reads as a "thing to copy". The wrapper
          Section keeps the code block centered on Outlook. */}
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Text
          style={{
            fontFamily: tokens.mono,
            fontSize: "34px",
            letterSpacing: "0.32em",
            color: tokens.ink,
            backgroundColor: "#FFF4E6",
            border: `1.5px dashed ${tokens.tangerine}`,
            borderRadius: "14px",
            padding: "18px 12px",
            margin: 0,
            display: "inline-block",
            minWidth: "240px",
          }}
        >
          {code}
        </Text>
      </Section>

      <Text
        style={{
          fontSize: "15px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "0 0 16px 0",
        }}
      >
        The code expires in 10 minutes.
      </Text>

      <Text
        style={{
          fontSize: "13px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "16px 0 0 0",
        }}
      >
        If you didn&rsquo;t ask for this code, you can safely ignore
        this email — it won&rsquo;t work for anyone else.
      </Text>
    </EmailLayout>
  );
}

export default OtpVerificationEmail;
