import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Colour + type tokens — kept inline because most email clients
// don't honour <style> blocks reliably.
//
// Session 22 Item 3 — colour palette aligned to the Session 16+
// inspiration design system:
//   - cream: page bg (was #FFFAF2; now #FBF1E5 to match the
//     web app's `--cream` value that ships in globals.css).
//   - tangerine: canonical OG-orange #ED8B3F (was a brighter
//     #F39322 before). All buttons + accents pick this up.
//
// Type stacks remain web-font-with-system-fallback. Email
// clients almost never load Fraunces/Inter/JetBrains Mono, so
// the second-position fallbacks (Georgia / Helvetica /
// system-mono) are what most recipients actually see.
export const tokens = {
  cream: "#FBF1E5",
  card: "#FFFFFF",
  ink: "#2A2A2C",
  inkSubtle: "rgba(42,42,44,0.6)",
  tangerine: "#ED8B3F",
  moss: "#6B8E5A",
  border: "rgba(42,42,44,0.08)",
  cardSoft: "#F9F4ED",
  serif:
    'Fraunces, Georgia, "Times New Roman", serif',
  sans:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono:
    '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org").replace(
    /\/$/,
    "",
  );

type Props = {
  preview: string;
  children: ReactNode;
};

// Email-padding-v2 lot — bulletproof padding implementation.
//
// Why this layout looks the way it does:
//
//   * Padding is applied to the <td> of the card table, NOT to the
//     <table>. CSS padding on a <table> element is honoured by
//     desktop Gmail and Apple Mail but stripped by Gmail iOS,
//     Outlook desktop, and most Outlook-on-Windows variants. Padding
//     on the inner <td> works universally. (Founder review of the
//     refund email screenshot: "Hello Mahmud" was flush against the
//     card's left edge on his client — that's the padding-on-table
//     bug, not insufficient padding.)
//
//   * MetadataCard (the cream "REFUND AMOUNT" style box) also moved
//     its padding to its inner <td> for the same reason; see
//     EmailMetadata.tsx.
//
//   * A <style> block in <head> carries the mobile media queries.
//     Apple Mail (Mac + iOS), Gmail web, and modern Gmail iOS honour
//     these. Outlook ignores them, which is fine — Outlook readers
//     just see the desktop padding values, which are themselves
//     reasonable.
//
//   * The card is rendered as a hand-written <table>/<tbody>/<tr>/
//     <td> tree instead of <Section>. We do this only for the card
//     and the MetadataCard, where padding-on-td is load-bearing.
//     Layout-only Sections elsewhere (centering buttons, footer
//     blocks) are fine as-is — they don't carry visible padding.
//
// Mobile media query scales down the card padding from 44/40 to
// 32/24 so a 375px viewport (iPhone) doesn't end up with a 263px
// content area. Also scales the outer Container padding from 32/16
// to 20/12 to give the card a bit more breathing room from the
// viewport edge.
const MOBILE_STYLES = `
  @media only screen and (max-width: 480px) {
    .og-email-container {
      padding: 20px 12px !important;
    }
    .og-email-card-cell {
      padding: 32px 24px !important;
    }
    .og-email-metadata-cell {
      padding: 18px 18px !important;
    }
    .og-email-heading {
      font-size: 24px !important;
      line-height: 1.2 !important;
    }
  }
`;

export function EmailLayout({ preview, children }: Props) {
  const logoUrl = process.env.EMAIL_LOGO_URL?.trim();
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        {/* Mobile media query — applies via @react-email/render
            inlining. Email clients that honour <style> in <head>
            will scale down padding on narrow viewports. */}
        <style dangerouslySetInnerHTML={{ __html: MOBILE_STYLES }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: tokens.cream,
          fontFamily: tokens.sans,
          color: tokens.ink,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          className="og-email-container"
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "32px 16px",
          }}
        >
          <Section style={{ textAlign: "center", paddingBottom: "24px" }}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt="OrphanGive"
                width={200}
                style={{ display: "inline-block" }}
              />
            ) : (
              <Text
                style={{
                  fontFamily: tokens.serif,
                  color: tokens.tangerine,
                  fontSize: "32px",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                OrphanGive
              </Text>
            )}
          </Section>

          {/* The card — hand-rolled <table> so the padding lands
              on the <td>, where every email client honours it. */}
          <table
            align="center"
            width="100%"
            border={0}
            cellPadding={0}
            cellSpacing={0}
            role="presentation"
            style={{
              backgroundColor: tokens.card,
              borderRadius: "24px",
              boxShadow: "0 1px 2px rgba(42,42,44,0.04)",
              border: `1px solid ${tokens.border}`,
              borderCollapse: "separate",
            }}
          >
            <tbody>
              <tr>
                <td
                  className="og-email-card-cell"
                  style={{
                    padding: "44px 40px",
                  }}
                >
                  {children}
                </td>
              </tr>
            </tbody>
          </table>

          <Section
            style={{
              paddingTop: "24px",
              textAlign: "center",
            }}
          >
            {/* Founder rule: name Goodverse + CHT together, or
                neither. Never CHT alone. This is the canonical
                attribution line used across all emails. */}
            <Text
              style={{
                fontSize: "12px",
                color: tokens.inkSubtle,
                margin: "0 0 8px 0",
                lineHeight: 1.5,
              }}
            >
              Operated by Goodverse Foundation in partnership with
              Children&rsquo;s Heaven Trust · Bangladesh
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: tokens.inkSubtle,
                margin: 0,
              }}
            >
              <Link
                href={SITE_URL}
                style={{ color: tokens.inkSubtle, textDecoration: "underline" }}
              >
                orphangive.org
              </Link>
              {" · "}
              <Link
                href={`${SITE_URL}/dashboard`}
                style={{ color: tokens.inkSubtle, textDecoration: "underline" }}
              >
                Dashboard
              </Link>
            </Text>
          </Section>

          <Hr
            style={{
              border: "none",
              borderTop: `1px solid ${tokens.border}`,
              margin: "20px 0 12px 0",
            }}
          />
          <Text
            style={{
              fontSize: "11px",
              color: tokens.inkSubtle,
              textAlign: "center",
              margin: "0 0 6px 0",
              fontFamily: tokens.mono,
              letterSpacing: "0.05em",
            }}
          >
            You&rsquo;re receiving this because you have an account with
            OrphanGive.
          </Text>
          {/* Session 22 — printAgraphy credit footer per the
              brand pass spec. Matches the homepage SiteFooter.
              Email-refinement lot — drop "in Bangladesh" (it's
              already in the attribution line above) and switch to the
              canonical https://printagraphy.com/ URL. */}
          <Text
            style={{
              fontSize: "11px",
              color: tokens.inkSubtle,
              textAlign: "center",
              margin: 0,
            }}
          >
            Built with care by{" "}
            <Link
              href="https://printagraphy.com/"
              style={{
                color: tokens.inkSubtle,
                textDecoration: "underline",
                fontWeight: 600,
              }}
            >
              printAgraphy
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailLayout;
