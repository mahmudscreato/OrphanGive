import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipModifiedEmailProps = {
  firstName: string;
  childName: string;
  oldAmountUsd: number;
  newAmountUsd: number;
  nextBillingDate: string | null;
  prorationCents: number | null; // positive = additional charge, negative = credit
  dashboardUrl: string;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function fmtUsdCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SponsorshipModifiedEmail({
  firstName,
  childName,
  oldAmountUsd,
  newAmountUsd,
  nextBillingDate,
  prorationCents,
  dashboardUrl,
}: SponsorshipModifiedEmailProps) {
  const nextStr = fmtDate(nextBillingDate);
  const prorationLine =
    prorationCents != null && prorationCents !== 0
      ? prorationCents > 0
        ? `An additional charge of ${fmtUsdCents(prorationCents)} will appear on your next invoice (proration for the partial month).`
        : `A credit of ${fmtUsdCents(Math.abs(prorationCents))} will be applied to your next invoice (proration for the partial month).`
      : null;

  return (
    <EmailLayout
      preview={`Your sponsorship of ${childName} is now ${fmtUsd(newAmountUsd)}/month.`}
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
        <strong style={{ color: tokens.ink }}>{childName}</strong> has been
        updated from{" "}
        <strong style={{ color: tokens.ink }}>
          {fmtUsd(oldAmountUsd)}/month
        </strong>{" "}
        to{" "}
        <strong style={{ color: tokens.ink }}>
          {fmtUsd(newAmountUsd)}/month
        </strong>
        .
        {nextStr
          ? ` The change takes effect on your next billing cycle (${nextStr}).`
          : " The change takes effect on your next billing cycle."}
      </Text>

      <MetadataCard>
        <MetadataRow label="Previous" value={`${fmtUsd(oldAmountUsd)} / month`} />
        <MetadataRow
          label="New"
          value={`${fmtUsd(newAmountUsd)} / month`}
          emphasized
        />
        {nextStr ? <MetadataRow label="Next charge" value={nextStr} /> : null}
      </MetadataCard>

      {prorationLine ? (
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            margin: "0 0 24px 0",
          }}
        >
          {prorationLine}
        </Text>
      ) : null}

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>View dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipModifiedEmail;
