"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type FooterLink = { href: string; label: string };
type FooterColumn = { heading: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    heading: "About",
    links: [
      { href: "/about/mission", label: "Mission" },
      { href: "/about/team", label: "The team" },
      { href: "/about/governance", label: "Governance" },
      { href: "/about/annual-reports", label: "Annual reports" },
      { href: "/about/press", label: "Press" },
    ],
  },
  {
    heading: "Get involved",
    links: [
      { href: "/sponsor", label: "Sponsor a child" },
      { href: "/donate", label: "One-time donation" },
      { href: "/for-charities", label: "For charities" },
      { href: "/volunteer", label: "Volunteer" },
      { href: "/corporate", label: "Corporate giving" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { href: "/stories", label: "Stories" },
      { href: "/zakat-sadaqah", label: "Zakat & Sadaqah" },
      { href: "/faq", label: "FAQ" },
      { href: "/help", label: "Help centre" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/legal/terms", label: "Terms of use" },
      { href: "/legal/safeguarding", label: "Safeguarding" },
      { href: "/legal/refunds", label: "Refund policy" },
    ],
  },
];

const BOTTOM_LINKS: FooterLink[] = [
  { href: "/cookie-settings", label: "Cookie settings" },
  { href: "/sitemap", label: "Sitemap" },
  { href: "/status", label: "Status" },
];

export function SiteFooter() {
  const pathname = usePathname();
  // Dashboard owns its own chrome (sidebar). The marketing footer
  // would visually collide with the sidebar's bottom donor card.
  if (pathname.startsWith("/dashboard")) return null;

  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-cream pt-20 px-6 pb-8">
      <div className="max-w-[1320px] mx-auto">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-16 pb-16 border-b border-cream/10 max-lg:grid-cols-2 max-lg:gap-12 max-md:grid-cols-1 max-md:gap-10">
          <div className="max-w-[320px] max-lg:col-span-2 max-md:col-span-1">
            <Image
              src="/logo-mark.png"
              alt="OrphanGive"
              width={56}
              height={56}
              className="w-14 h-14 mb-5"
            />
            <div className="font-display text-[28px] font-medium text-cream mb-3">
              OrphanGive
            </div>
            <p className="text-sm text-cream/60 leading-relaxed">
              Operated by Children&apos;s Heaven Trust, a registered charity in
              Bangladesh. Built for orphan children. Built to last.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-tangerine mb-5">
                {col.heading}
              </h4>
              {col.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block py-1.5 text-sm text-cream/70 hover:text-tangerine-light transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="pt-8 flex flex-wrap justify-between items-center gap-4 font-mono text-[11px] text-cream/40 tracking-[0.08em]">
          <span>
            © {year} Children&apos;s Heaven Trust · Operated with OrphanGive
          </span>
          <div className="flex gap-6">
            {BOTTOM_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-cream/50 hover:text-tangerine-light transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
