import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getCurrentDonor } from "@/lib/donor-data";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://orphangive.org"
).replace(/\/$/, "");

const DEFAULT_OG_IMAGE =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_SVG_vdmpqc.svg";

const DEFAULT_DESCRIPTION =
  "Sponsor a vulnerable or orphaned child in Bangladesh through verified profiles. Operated by Children's Heaven Trust (Reg. iv-98/2021), an NGO Affairs Bureau registered charity.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "OrphanGive — Sponsor an orphan in Bangladesh",
    // %s receives the page-level title; nested pages override only
    // their own title and inherit the rest of this block.
    template: "%s · OrphanGive",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: "OrphanGive",
  authors: [{ name: "Children's Heaven Trust" }],
  openGraph: {
    type: "website",
    siteName: "OrphanGive",
    locale: "en_US",
    url: SITE_URL,
    title: "OrphanGive — Sponsor an orphan in Bangladesh",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "OrphanGive — sponsor an orphan in Bangladesh",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OrphanGive — Sponsor an orphan in Bangladesh",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    // Crawler directives are also broadcast via /robots.txt; the
    // <meta> form is a belt-and-braces fallback for crawlers that
    // don't honour robots.txt on every fetch.
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FFFAF2",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch donor at the top so SiteNav can render auth-aware UI.
  // SiteNav itself decides to skip rendering on /dashboard/* routes.
  const donor = await getCurrentDonor();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col bg-cream text-ink"
        suppressHydrationWarning={true}
      >
        <SiteNav
          signedIn={!!donor}
          firstName={
            donor?.first_name?.trim() ||
            donor?.email?.split("@")[0] ||
            null
          }
        />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
