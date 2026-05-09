import { Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type MonthlyReceiptEmailProps = {
  firstName: string;
  childName: string;
  amountUsd: number;
  paidAt: string; // ISO
  paymentMethodLast4: string | null;
  paymentMethodBrand: string | null;
  stripeReceiptUrl: string | null;
  nextBillingDate: string | null;
  dashboardUrl: string;
  // Pre-resolved cause label (e.g. "Education and learning"). Optional
  // for back-compat — old callers that haven't been updated still send
  // a valid receipt; the new line just won't appear.
  causeLabel?: string;
  // Pre-resolved visibility label (Session 14.6). Same back-compat
  // shape as causeLabel — absent → row is omitted.
  visibilityLabel?: string;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
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
function titleBrand(b: string | null): string {
  if (!b) return "card";
  return b.charAt(0).toUpperCase() + b.slice(1).toLowerCase();
}

export function MonthlyReceiptEmail({
  firstName,
  childName,
  amountUsd,
  paidAt,
  paymentMethodLast4,
  paymentMethodBrand,
  stripeReceiptUrl,
  nextBillingDate,
  dashboardUrl,
  causeLabel,
  visibilityLabel,
}: MonthlyReceiptEmailProps) {
  const paidAtFmt = formatDate(paidAt) ?? paidAt;
  const nextFmt = formatDate(nextBillingDate);
  const methodLine =
    paymentMethodLast4
      ? `${titleBrand(paymentMethodBrand)} ending ${paymentMethodLast4}`
      : titleBrand(paymentMethodBrand);

  return (
    <EmailLayout
      preview={`Thank you for ${formatUsd(amountUsd)} this month.`}
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
          margin: "0 0 8px 0",
        }}
      >
        Your monthly sponsorship of{" "}
        <strong style={{ color: tokens.ink }}>{childName}</strong> was charged
        today. Thank you.
      </Text>

      <MetadataCard>
        <Text
          style={{
            fontFamily: tokens.mono,
            fontSize: "10.5px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: tokens.inkSubtle,
            margin: "0 0 12px 0",
          }}
        >
          Receipt
        </Text>
        <MetadataRow label="Date charged" value={paidAtFmt} />
        <MetadataRow label="Sponsorship for" value={childName} />
        <MetadataRow label="Amount" value={formatUsd(amountUsd)} emphasized />
        <MetadataRow label="Payment method" value={methodLine} />
        {causeLabel ? (
          <MetadataRow label="Supporting" value={causeLabel} />
        ) : null}
        {visibilityLabel ? (
          <MetadataRow label="Visibility" value={visibilityLabel} />
        ) : null}
        {stripeReceiptUrl ? (
          <Text
            style={{
              fontSize: "12.5px",
              color: tokens.inkSubtle,
              margin: "10px 0 0 0",
            }}
          >
            <Link
              href={stripeReceiptUrl}
              style={{
                color: tokens.inkSubtle,
                textDecoration: "underline",
              }}
            >
              View receipt on Stripe →
            </Link>
          </Text>
        ) : null}
      </MetadataCard>

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "16px 0 24px 0",
        }}
      >
        {nextFmt
          ? `Your next charge is scheduled for ${nextFmt}. `
          : "Your next charge will be scheduled automatically. "}
        You can view all your sponsorships and manage them anytime from your
        dashboard.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>View dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default MonthlyReceiptEmail;
