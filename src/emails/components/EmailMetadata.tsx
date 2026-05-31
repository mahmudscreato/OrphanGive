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
//
// Email-padding-v2 lot — rewritten as a hand-rolled <table> so the
// internal padding lands on the <td> instead of the <table>. CSS
// padding on a <table> is stripped by Gmail iOS + Outlook, which
// caused the founder-flagged "REFUND AMOUNT box stretches to both
// card edges with zero gap" symptom on his client. With padding on
// the <td>, the inner rows always sit inset from the box edges.
//
// `og-email-metadata-cell` class is targeted by the mobile media
// query in EmailLayout.tsx — on a narrow viewport the padding scales
// down from 22/22 to 18/18 so the content area isn't too cramped
// inside the already-shrunk parent card.
export function MetadataCard({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "soft";
}) {
  return (
    <table
      align="center"
      width="100%"
      border={0}
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{
        backgroundColor: variant === "soft" ? tokens.cardSoft : tokens.cream,
        border: `1px solid ${tokens.border}`,
        borderRadius: "12px",
        margin: "20px 0",
        borderCollapse: "separate",
      }}
    >
      <tbody>
        <tr>
          <td
            className="og-email-metadata-cell"
            style={{
              padding: "22px 22px",
            }}
          >
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default MetadataCard;
