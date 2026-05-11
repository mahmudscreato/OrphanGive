"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Session 16 FINAL — SiteFooter.
 *
 * 4-column grid on lg (Brand · Learn · Trust & Legal · Connect),
 * 2 on md, single column on mobile. Charcoal background, soft
 * white text with hover-to-full-white.
 *
 * Part 4 Fix 2 — partner names in the brand attribution line are
 * now bold + linked (open in new tab). Connect column carries a
 * horizontal row of 4 social icons at the bottom (Facebook,
 * Instagram, LinkedIn, YouTube). URLs are best-guess placeholders
 * with `#` fallback — ops can swap them in env / CMS later.
 */

type FooterLink = { href: string; label: string };
type FooterColumn = { heading: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    heading: "Learn",
    links: [
      { href: "/about", label: "About" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/stories", label: "Stories" },
      { href: "/for-charities", label: "For Charities" },
      { href: "/about", label: "Transparency" },
    ],
  },
  {
    heading: "Trust & Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/refund", label: "Refund Policy" },
      { href: "/cookies", label: "Cookie Policy" },
      { href: "/safeguarding", label: "Safeguarding Policy" },
      { href: "/safeguarding", label: "Child Protection Policy" },
    ],
  },
];

const CONNECT_LINKS: FooterLink[] = [
  { href: "/contact", label: "Contact" },
  { href: "/signin", label: "Sign In" },
  { href: "/about", label: "Volunteer" },
  { href: "/help", label: "Help Centre" },
];

type SocialLink = {
  kind: "facebook" | "instagram" | "linkedin" | "youtube";
  href: string;
  label: string;
};

const SOCIAL_LINKS: SocialLink[] = [
  {
    kind: "facebook",
    href: "https://www.facebook.com/orphangive",
    label: "Facebook",
  },
  {
    kind: "instagram",
    href: "https://www.instagram.com/orphangive",
    label: "Instagram",
  },
  {
    kind: "linkedin",
    href: "https://www.linkedin.com/company/orphangive",
    label: "LinkedIn",
  },
  {
    kind: "youtube",
    href: "https://www.youtube.com/@orphangive",
    label: "YouTube",
  },
];

const FOOTER_LOGO_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/v1778505013/OG_Logo_SVG_s0z6ak.svg";

const GOODVERSE_URL = "https://www.goodverse.org";
const CHILDRENS_HEAVEN_URL = "https://childrensheaventrust.org/";

function SocialIcon({ kind }: { kind: SocialLink["kind"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-5 h-5",
  };
  if (kind === "facebook") {
    return (
      <svg {...common}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  }
  if (kind === "instagram") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (kind === "linkedin") {
    return (
      <svg {...common}>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    );
  }
  // youtube
  return (
    <svg {...common}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  // Dashboard owns its own chrome — marketing footer would visually
  // collide with the sidebar's bottom donor card.
  if (pathname.startsWith("/dashboard")) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-white px-6 py-16">
      <div className="max-w-[1320px] mx-auto">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-12 pb-12 max-lg:grid-cols-2 max-lg:gap-10 max-md:grid-cols-1 max-md:gap-10">
          {/* Brand column with footer logo + bold+linked partner
              attribution. */}
          <div className="max-w-[320px] max-lg:col-span-2 max-md:col-span-1">
            <Image
              src={FOOTER_LOGO_URL}
              alt="OrphanGive — sponsor an orphan in Bangladesh"
              width={260}
              height={140}
              unoptimized
              className="h-[70px] w-auto mb-5"
            />
            <p className="text-sm text-white/70 leading-relaxed">
              OrphanGive is a project of{" "}
              <a
                href={GOODVERSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-white hover:underline"
              >
                Goodverse Foundation
              </a>{" "}
              and{" "}
              <a
                href={CHILDRENS_HEAVEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-white hover:underline"
              >
                Children&apos;s Heaven Trust
              </a>
              .
            </p>
          </div>

          {/* Learn + Trust & Legal columns. */}
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-xs uppercase tracking-wider text-white/50 mb-5 font-semibold">
                {col.heading}
              </h4>
              {col.links.map((link) => (
                <Link
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  className="block py-1.5 text-sm text-white/85 hover:text-white transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}

          {/* Connect column — text links + social icons row at
              the bottom. */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-white/50 mb-5 font-semibold">
              Connect
            </h4>
            {CONNECT_LINKS.map((link) => (
              <Link
                key={`${link.label}-${link.href}`}
                href={link.href}
                className="block py-1.5 text-sm text-white/85 hover:text-white transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-6 flex gap-4 items-center">
              {SOCIAL_LINKS.map((s) => (
                <motion.a
                  key={s.kind}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-white/70 hover:text-white transition-colors duration-200 inline-flex"
                  whileHover={reduced ? undefined : { scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <SocialIcon kind={s.kind} />
                </motion.a>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-wrap justify-between items-center gap-3 text-xs text-white/60 tracking-wide">
          <span>© {year} OrphanGive. All rights reserved.</span>
          <span>Built with care in Bangladesh.</span>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
