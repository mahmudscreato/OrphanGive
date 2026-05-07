import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, tokens } from "./components/EmailLayout";
import { EmailButton } from "./components/EmailButton";
import { MetadataCard, MetadataRow } from "./components/EmailMetadata";

export type SponsorshipWelcomeItem = {
  childName: string;
  childDistrict: string | null;
  childAge: number | null;
  childGenderPronoun: "he" | "she" | "they";
  paymentMode: "monthly" | "one_time";
  amountUsd: number;
  nextBillingDate?: string | null;
};

export type SponsorshipWelcomeEmailProps = {
  firstName: string;
  sponsorships: SponsorshipWelcomeItem[];
  dashboardUrl: string;
};

const PRONOUN_SUBJECT: Record<SponsorshipWelcomeItem["childGenderPronoun"], string> = {
  he: "He",
  she: "She",
  they: "They",
};
const PRONOUN_POSSESSIVE: Record<
  SponsorshipWelcomeItem["childGenderPronoun"],
  string
> = {
  he: "his",
  she: "her",
  they: "their",
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function formatDate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SponsorshipWelcomeEmail({
  firstName,
  sponsorships,
  dashboardUrl,
}: SponsorshipWelcomeEmailProps) {
  const isMulti = sponsorships.length > 1;
  const first = sponsorships[0];
  const childList =
    sponsorships.length === 1
      ? sponsorships[0]!.childName
      : sponsorships.length === 2
        ? `${sponsorships[0]!.childName} and ${sponsorships[1]!.childName}`
        : sponsorships
            .slice(0, -1)
            .map((s) => s.childName)
            .join(", ") +
          ", and " +
          sponsorships[sponsorships.length - 1]!.childName;

  const previewName = isMulti
    ? `${sponsorships.length} children`
    : first?.childName ?? "your sponsorship";

  // Pronoun handling: when single, use that child's pronouns. When multi,
  // collapse to "they"/"their" naturally.
  const pronounSubject = isMulti
    ? "They"
    : PRONOUN_SUBJECT[first?.childGenderPronoun ?? "they"];
  const pronounPossessive = isMulti
    ? "their"
    : PRONOUN_POSSESSIVE[first?.childGenderPronoun ?? "they"];

  return (
    <EmailLayout preview={`Your support of ${previewName} starts now.`}>
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
        Thank you. As of today, you&rsquo;re sponsoring{" "}
        <strong style={{ color: tokens.ink }}>{childList}</strong>.{" "}
        {pronounSubject} now {isMulti ? "have" : "has"} someone in{" "}
        {pronounPossessive} corner who chose to be there — and that matters
        more than you might realise.
      </Text>

      {sponsorships.map((s, i) => {
        const subtitle = [
          s.childDistrict,
          s.childAge != null ? `age ${s.childAge}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        const next = formatDate(s.nextBillingDate);
        return (
          <MetadataCard key={i}>
            <Text
              style={{
                fontFamily: tokens.serif,
                fontSize: "22px",
                fontWeight: 500,
                color: tokens.ink,
                margin: "0 0 4px 0",
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
              }}
            >
              {s.childName}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  fontSize: "13px",
                  color: tokens.inkSubtle,
                  margin: "0 0 12px 0",
                }}
              >
                {subtitle}
              </Text>
            ) : null}
            <MetadataRow
              label={s.paymentMode === "monthly" ? "Monthly" : "One-time gift"}
              value={
                s.paymentMode === "monthly"
                  ? `${formatUsd(s.amountUsd)} / month`
                  : formatUsd(s.amountUsd)
              }
            />
            {s.paymentMode === "monthly" && next ? (
              <MetadataRow label="Next charge" value={next} />
            ) : null}
          </MetadataCard>
        );
      })}

      <Text
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: tokens.ink,
          margin: "20px 0 24px 0",
        }}
      >
        Over the coming weeks, you&rsquo;ll start receiving updates from{" "}
        {isMulti ? "their" : `${first?.childName ?? "the child"}'s`} life —
        small moments, school progress, occasional photos. Your sponsorship
        card on your dashboard will always be there if you want to manage your
        support.
      </Text>

      <Section style={{ textAlign: "center", padding: "8px 0 8px 0" }}>
        <EmailButton href={dashboardUrl}>View your dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default SponsorshipWelcomeEmail;
