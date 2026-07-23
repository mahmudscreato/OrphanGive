import { Heading, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";

// feat/donor-account-deactivation — confirmation that a donor deactivated
// their own account. Reversible: no data is erased and support can
// reactivate. Best-effort send from the deactivate route.
export type DonorDeactivatedEmailProps = {
  firstName: string;
  supportEmail: string;
};

export function DonorDeactivatedEmail({
  firstName,
  supportEmail,
}: DonorDeactivatedEmailProps) {
  return (
    <EmailLayout preview="Your OrphanGive account has been deactivated.">
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
        Your OrphanGive account has been deactivated, as you requested.
        You&rsquo;ve been signed out, and you won&rsquo;t be able to sign
        in while the account is deactivated.
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        Nothing has been deleted — this is fully reversible. Whenever
        you&rsquo;d like your account back, just email us at{" "}
        <a href={`mailto:${supportEmail}`} style={{ color: tokens.ink }}>
          {supportEmail}
        </a>{" "}
        and we&rsquo;ll reactivate it for you.
      </Text>

      <Text
        style={{
          fontSize: "13.5px",
          lineHeight: 1.6,
          color: tokens.inkSubtle,
          margin: "24px 0 0 0",
        }}
      >
        If you didn&rsquo;t request this, contact us right away at{" "}
        {supportEmail} — a real person from our team reads every message.
      </Text>
    </EmailLayout>
  );
}

export default DonorDeactivatedEmail;
