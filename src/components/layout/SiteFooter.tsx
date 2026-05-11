"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type FooterLink = { href: string; label: string };
type FooterColumn = { heading: string; links: FooterLink[] };

// Session 15a — link wiring. Items WITH a real route resolve to
// that route. Items still in the backlog (governance, annual
// reports, press, volunteer, corporate, zakat-sadaqah, every
// /legal/* page) are kept aliased to /about or /for-charities or
// /faq for v1; intentional "Coming soon" pages can replace those
// aliases as content lands.
//
// LEGAL pages (privacy, cookies, terms, safeguarding, refunds)
// remain on this list because the footer needs them visible
// before launch — but they currently alias to /about pending the
// real legal copy from Mahmud's lawyer. This is a launch blocker
// flagged in the 15a session report.
const COLUMNS: FooterColumn[] = [
  {
    heading: "About",
    links: [
      { href: "/about", label: "Mission" },
      { href: "/about", label: "The team" },
      { href: "/about", label: "Governance" },
      { href: "/about", label: "Annual reports" },
      { href: "/about", label: "Press" },
    ],
  },
  {
    heading: "Get involved",
    links: [
      { href: "/children", label: "Sponsor a child" },
      { href: "/children", label: "One-time donation" },
      { href: "/for-charities", label: "For charities" },
      { href: "/for-charities", label: "Volunteer" },
      { href: "/for-charities", label: "Corporate giving" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { href: "/stories", label: "Stories" },
      { href: "/faq", label: "Zakat & Sadaqah" },
      { href: "/faq", label: "FAQ" },
      { href: "/faq", label: "Help centre" },
      { href: "mailto:hello@orphangive.org", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/cookies", label: "Cookie policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/safeguarding", label: "Safeguarding" },
      { href: "/refund", label: "Refund policy" },
    ],
  },
];

const BOTTOM_LINKS: FooterLink[] = [
  { href: "/about", label: "Cookie settings" },
  { href: "/children", label: "Sitemap" },
  { href: "/about", label: "Status" },
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
                // Composite key: multiple labels in the same column
                // can alias to the same href during the v1 footer
                // wiring (e.g. "Help centre" and "FAQ" both → /faq).
                // Keying on href alone produced duplicate-key React
                // warnings; label+href is unique within the column.
                <Link
                  key={`${link.label}-${link.href}`}
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
                key={`${link.label}-${link.href}`}
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
