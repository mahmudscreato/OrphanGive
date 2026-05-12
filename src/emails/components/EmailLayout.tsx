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

export function EmailLayout({ preview, children }: Props) {
  const logoUrl = process.env.EMAIL_LOGO_URL?.trim();
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
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

          <Section
            style={{
              backgroundColor: tokens.card,
              // Session 22 — bumped from 16px to 24px to match the
              // web app's card radii (`rounded-3xl` ≈ 24px).
              borderRadius: "24px",
              padding: "36px 32px",
              boxShadow: "0 1px 2px rgba(42,42,44,0.04)",
              border: `1px solid ${tokens.border}`,
            }}
          >
            {children}
          </Section>

          <Section
            style={{
              paddingTop: "24px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                fontSize: "12px",
                color: tokens.inkSubtle,
                margin: "0 0 8px 0",
              }}
            >
              OrphanGive · Children&rsquo;s Heaven Trust · Bangladesh
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
              brand pass spec. Matches the homepage SiteFooter. */}
          <Text
            style={{
              fontSize: "11px",
              color: tokens.inkSubtle,
              textAlign: "center",
              margin: 0,
            }}
          >
            Built with care in Bangladesh by{" "}
            <Link
              href="https://www.printagraphy.com"
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
