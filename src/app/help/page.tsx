// Session 19 — /help page. Tier 1 (public, no auth).
// New route — did not exist before. Server Component.
//
// Two surfaces:
//   1. Quick-links grid (4 cards) — top-level destinations: FAQ,
//      How It Works, Contact, About.
//   2. Common topics — 8 cards, each linking into a /faq#group
//      anchor (the FAQ groups carry stable IDs — see
//      src/app/faq/page.tsx::FAQ_GROUPS). Two topics
//      ("Donor dashboard guide", "Account security") link to a
//      placeholder anchor — once dedicated help articles exist,
//      swap the href.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/help",
  title: "Help Centre",
  description:
    "Quick links to common help topics, the full FAQ, and direct contact channels.",
});

type QuickLink = {
  href: string;
  title: string;
  description: string;
  icon: "faq" | "how" | "contact" | "about";
};

const QUICK_LINKS: QuickLink[] = [
  {
    href: "/faq",
    title: "Browse common questions",
    description: "Twenty-eight questions, grouped by topic.",
    icon: "faq",
  },
  {
    href: "/how-it-works",
    title: "How OrphanGive works",
    description: "The five-step deep-dive — verification to delivery.",
    icon: "how",
  },
  {
    href: "/contact",
    title: "Contact us directly",
    description: "Email, message form, partnership and press lanes.",
    icon: "contact",
  },
  {
    href: "/about",
    title: "About OrphanGive",
    description: "Who we are, who we work with, what we believe.",
    icon: "about",
  },
];

type Topic = {
  title: string;
  body: string;
  href: string;
};

// Topic anchors deep-link to the relevant /faq#group. The FAQ
// groups are: about-orphangive / sponsorship-donation /
// children-privacy / payments / account.
//
// `/help#donor-dashboard` and `/help#account-security` are
// placeholder fragments — when dedicated help articles get built
// (separate `/help/[slug]` pages), swap those hrefs over.
const TOPICS: Topic[] = [
  {
    title: "Setting up monthly sponsorship",
    body: "How to choose a child, pick an amount, and complete checkout.",
    href: "/faq#sponsorship",
  },
  {
    title: "Updating my payment method",
    body: "Where to find Billing in your dashboard and how Stripe handles the swap.",
    href: "/faq#payments",
  },
  {
    title: "Cancelling my sponsorship",
    body: "Pausing or cancelling a monthly contribution — no friction, no penalty.",
    href: "/faq#sponsorship",
  },
  {
    title: "Understanding child profiles",
    body: "What the Verified and Privacy-protected badges mean in practice.",
    href: "/faq#children-privacy",
  },
  {
    title: "Tax receipts and Zakat",
    body: "Receipt issuance, Zakat eligibility, and what you should run by your scholar.",
    href: "/faq#sponsorship",
  },
  {
    title: "Refund policy",
    body: "When refunds are possible and how to request one.",
    href: "/faq#payments",
  },
  {
    title: "Account security",
    body: "Sign-in, password reset, magic-link flow, and account deletion.",
    href: "/faq#account",
  },
  {
    title: "Donor dashboard guide",
    body: "Where to find your sponsorship history, billing, and quarterly reports.",
    // TODO: replace with dedicated /help/donor-dashboard article
    // when the help-articles content type lands. For now points
    // to /how-it-works which covers the dashboard at a high level.
    href: "/how-it-works",
  },
];

function QuickLinkIcon({ kind }: { kind: QuickLink["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-6 h-6",
  };
  if (kind === "faq") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-1.5 2-2.5 3" />
        <line x1="12" y1="17" x2="12" y2="17.01" />
      </svg>
    );
  }
  if (kind === "how") {
    return (
      <svg {...common}>
        <path d="M3 12h18" />
        <path d="M3 6h18" />
        <path d="M3 18h12" />
      </svg>
    );
  }
  if (kind === "contact") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  // about
  return (
    <svg {...common}>
      <path d="M20 12c0 4-3.6 7-8 7-1 0-2-.2-3-.5L4 20l1.5-4.5C5.2 14.5 5 13.3 5 12c0-4 3.6-7 8-7s7 3 7 7z" />
    </svg>
  );
}

export default function HelpCentrePage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Help Centre
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              How can we help?
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Let&apos;s find an answer.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Start with a quick link below, or jump into a specific
            topic.
          </p>
        </div>
      </header>

      {/* Quick links grid — 4 cards. */}
      <section className="px-6 py-10 max-md:py-8">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-4 max-lg:grid-cols-2 max-md:grid-cols-1 gap-5">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group block bg-white rounded-2xl border border-ink/[0.06] px-6 py-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep mb-4 group-hover:bg-tangerine group-hover:text-white transition-colors duration-200">
                  <QuickLinkIcon kind={link.icon} />
                </div>
                <div className="font-display font-semibold text-lg text-ink leading-tight group-hover:text-tangerine-deep transition-colors duration-200">
                  {link.title}
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {link.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Common topics. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Common topics
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                The questions donors ask most.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-5 max-md:gap-4">
            {TOPICS.map((topic) => (
              <Link
                key={topic.title}
                href={topic.href}
                className="group block bg-white rounded-2xl border border-ink/[0.06] px-6 py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="font-display font-semibold text-lg text-ink leading-tight group-hover:text-tangerine-deep transition-colors duration-200">
                  {topic.title}
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {topic.body}
                </p>
                <div className="mt-3 inline-flex items-center gap-1 text-sm text-tangerine-deep font-medium">
                  Read more
                  <span
                    aria-hidden="true"
                    className="inline-block transition-transform duration-200 group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Closing strip. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Can&apos;t find what you need?{" "}
            <Link
              href="/contact"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Contact us →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
