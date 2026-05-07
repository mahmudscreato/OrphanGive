import { Section, Text } from "@react-email/components";
import { tokens } from "./EmailLayout";

// A small "label / value" pair used in receipt + sponsorship cards.
export function MetadataRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <Section style={{ padding: "6px 0" }}>
      <Text
        style={{
          fontFamily: tokens.mono,
          fontSize: "10.5px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: tokens.inkSubtle,
          margin: "0 0 2px 0",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: emphasized ? tokens.serif : tokens.sans,
          fontSize: emphasized ? "22px" : "15px",
          fontWeight: emphasized ? 500 : 400,
          color: tokens.ink,
          margin: 0,
          lineHeight: 1.35,
        }}
      >
        {value}
      </Text>
    </Section>
  );
}

// Container for a "card-within-card" like receipt details / sponsorship details.
export function MetadataCard({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft";
}) {
  return (
    <Section
      style={{
        backgroundColor: variant === "soft" ? tokens.cardSoft : tokens.cream,
        border: `1px solid ${tokens.border}`,
        borderRadius: "12px",
        padding: "20px 22px",
        margin: "20px 0",
      }}
    >
      {children}
    </Section>
  );
}

export default MetadataCard;
