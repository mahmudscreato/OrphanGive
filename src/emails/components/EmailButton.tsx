import { Button } from "@react-email/components";
import { tokens } from "./EmailLayout";

type Props = {
  href: string;
  children: React.ReactNode;
};

// Session 22 Item 3 — brand-aligned button.
//
// `@react-email/components`'s <Button> renders as a table-based
// HTML element internally, which keeps padding + colour rendering
// consistent across Outlook (the worst offender for inline-style
// quirks). We don't need to hand-roll a <table> wrapper — the
// component already does it.
//
// Style notes:
//   - 999px border-radius for a pill shape (matches the web app's
//     primary CTA — homepage Support button et al.).
//   - White text on OG-orange (tokens.tangerine) — explicit
//     `#FFFFFF` rather than tokens.cream so the button stays
//     legible regardless of how a client renders the cream tint.
//   - 14px 28px padding for a generous tap target.
export function EmailButton({ href, children }: Props) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: tokens.tangerine,
        color: "#FFFFFF",
        fontFamily: tokens.sans,
        fontSize: "15px",
        fontWeight: 600,
        textDecoration: "none",
        padding: "14px 28px",
        borderRadius: "999px",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}

export default EmailButton;
