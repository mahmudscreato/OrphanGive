import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";

// feat/quick-donation — warm thank-you for a GUEST cause donation. Sent
// best-effort from the webhook's guest branch after payment succeeds
// (Stripe's native Checkout receipt covers the formal payment record;
// this is the human note). No account exists, so no name — we greet
// warmly without one.
export type GuestDonationThankYouEmailProps = {
  causeTitle: string;
  amountLabel: string; // e.g. "$40" or "৳4,000"
  childCount: number | null;
  browseUrl: string;
  signupUrl: string;
};

export function GuestDonationThankYouEmail({
  causeTitle,
  amountLabel,
  childCount,
  browseUrl,
  signupUrl,
}: GuestDonationThankYouEmailProps) {
  return (
    <EmailLayout preview="Thank you — your donation has been received.">
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
        Thank you.
      </Heading>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 16px 0",
        }}
      >
        Your gift of <strong>{amountLabel}</strong> to{" "}
        <strong>{causeTitle}</strong> has been received.
        {childCount
          ? ` It goes toward this cause for ${childCount} ${childCount === 1 ? "child" : "children"} in Bangladesh.`
          : " It reaches children in Bangladesh through this cause, wherever the need is greatest."}
      </Text>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "0 0 24px 0",
        }}
      >
        You didn&rsquo;t need an account to do this, and you still
        don&rsquo;t. But if you&rsquo;d ever like to follow a specific
        child&rsquo;s story through sponsorship, we&rsquo;d be glad to
        have you.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 16px 0" }}>
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
        Stripe will email your payment receipt separately. If you&rsquo;d
        like an account later, it takes a minute: {signupUrl} — and if
        anything&rsquo;s on your mind, just reply to this email. A real
        person from our team reads every message.
      </Text>
    </EmailLayout>
  );
}

export default GuestDonationThankYouEmail;
