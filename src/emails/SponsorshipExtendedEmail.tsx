import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipExtendedEmailProps = {
  firstName: string;
  childName: string;
  additionalMonths: number;
  newDurationMonths: number;
  monthsRemaining: number;
  newEndDateIso: string | null;
  paidNow: boolean;
  paymentAmountUsd: number;
  // New: differentiates "prepaid + monthly tail" extension. When true,
  // we display the prepaid end date and the future-monthly cadence
  // instead of "charged today".
  monthlyExtensionAfterPrepaid?: boolean;
  prepaidEndDateIso?: string | null;
  monthlyAmountUsd?: number;
  sponsorshipUrl: string;
  // Pre-resolved cause label for the "Supporting" line.
  causeLabel?: string;
  // Pre-resolved visibility label (Session 14.6).
  visibilityLabel?: string;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SponsorshipExtendedEmail({
  firstName,
  childName,
  additionalMonths,
  newDurationMonths,
  monthsRemaining,
  newEndDateIso,
  paidNow,
  paymentAmountUsd,
  monthlyExtensionAfterPrepaid = false,
  prepaidEndDateIso = null,
  monthlyAmountUsd,
  sponsorshipUrl,
  causeLabel,
  visibilityLabel,
}: SponsorshipExtendedEmailProps) {
  const newEndStr = fmtDate(newEndDateIso);
  const prepaidEndStr = fmtDate(prepaidEndDateIso);
  return (
    <EmailLayout
      preview={`You've extended your sponsorship of ${childName} by ${additionalMonths} months.`}
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

      {monthlyExtensionAfterPrepaid ? (
        <Text
          style={{
            fontSize: "16px",
            lineHeight: 1.65,
            color: tokens.ink,
            margin: "0 0 16px 0",
          }}
        >
          Your sponsorship of{" "}
          <strong style={{ color: tokens.ink }}>{childName}</strong> is now
          extended by{" "}
          <strong style={{ color: tokens.ink }}>
            {additionalMonths} {additionalMonths === 1 ? "month" : "months"}
          </strong>
          . Your prepaid period continues as-is until{" "}
          <strong style={{ color: tokens.ink }}>{prepaidEndStr ?? "your prepaid end date"}</strong>
          . After that,{" "}
          <strong style={{ color: tokens.ink }}>
            {monthlyAmountUsd != null ? fmtUsd(monthlyAmountUsd) : "your monthly amount"}
            /month
          </strong>{" "}
          will be charged automatically for {additionalMonths}{" "}
          {additionalMonths === 1 ? "month" : "months"}. Total commitment now:{" "}
          <strong style={{ color: tokens.ink }}>
            {newDurationMonths} {newDurationMonths === 1 ? "month" : "months"}
          </strong>
          .
        </Text>
      ) : (
        <Text
          style={{
            fontSize: "16px",
            lineHeight: 1.65,
            color: tokens.ink,
            margin: "0 0 16px 0",
          }}
        >
          You&rsquo;ve extended your sponsorship of{" "}
          <strong style={{ color: tokens.ink }}>{childName}</strong> by{" "}
          <strong style={{ color: tokens.ink }}>
            {additionalMonths} {additionalMonths === 1 ? "month" : "months"}
          </strong>
          . Total commitment is now{" "}
          <strong style={{ color: tokens.ink }}>
            {newDurationMonths} {newDurationMonths === 1 ? "month" : "months"}
          </strong>
          {" "}({monthsRemaining}{" "}
          {monthsRemaining === 1 ? "month" : "months"} remaining).
        </Text>
      )}

      <MetadataCard>
        <MetadataRow
          label="Months added"
          value={`${additionalMonths} ${
            additionalMonths === 1 ? "month" : "months"
          }`}
        />
        <MetadataRow
          label="New total commitment"
          value={`${newDurationMonths} ${
            newDurationMonths === 1 ? "month" : "months"
          }`}
        />
        {newEndStr ? (
          <MetadataRow label="Sponsorship now ends" value={newEndStr} />
        ) : null}
        {causeLabel ? (
          <MetadataRow label="Supporting" value={causeLabel} />
        ) : null}
        {visibilityLabel ? (
          <MetadataRow label="Visibility" value={visibilityLabel} />
        ) : null}
        {paidNow ? (
          <MetadataRow
            label="Charged today"
            value={fmtUsd(paymentAmountUsd)}
            emphasized
          />
        ) : null}
      </MetadataCard>

      {paidNow ? (
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            margin: "0 0 24px 0",
          }}
        >
          {fmtUsd(paymentAmountUsd)} was charged to your saved payment method
          today, covering the additional months.
        </Text>
      ) : monthlyExtensionAfterPrepaid ? (
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            margin: "0 0 24px 0",
          }}
        >
          No charge today.
          {prepaidEndStr
            ? ` Monthly billing begins ${prepaidEndStr}.`
            : " Monthly billing begins after your prepaid period ends."}
        </Text>
      ) : (
        <Text
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            color: tokens.inkSubtle,
            margin: "0 0 24px 0",
          }}
        >
          {newEndStr
            ? `Your monthly schedule continues until ${newEndStr}.`
            : "Your monthly schedule continues until the new end date."}
          {" "}No charge today — billing continues as before.
        </Text>
      )}

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={sponsorshipUrl}>View sponsorship</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipExtendedEmail;
