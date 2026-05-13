// Session 25 — branded 404. Next.js renders this whenever a route
// returns notFound() or the URL doesn't match any route. Inherits
// the root layout (SiteNav + SiteFooter) so the navigation stays
// reachable from the dead-end. Three helpful link cards point at
// the most likely destinations the user actually wanted.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export const metadata = {
  title: "Page not found",
  description:
    "The page you were looking for isn't here. We can help you find what you needed.",
};

type Destination = {
  href: string;
  title: string;
  description: string;
  icon: "children" | "about" | "contact";
};

const DESTINATIONS: Destination[] = [
  {
    href: "/children",
    title: "Browse children waiting for sponsors",
    description: "Verified profiles ready for monthly support.",
    icon: "children",
  },
  {
    href: "/about",
    title: "About OrphanGive",
    description: "Who we are, who we work with, what we believe.",
    icon: "about",
  },
  {
    href: "/contact",
    title: "Get in touch",
    description: "Questions, partnerships, anything else.",
    icon: "contact",
  },
];

function DestinationIcon({ kind }: { kind: Destination["icon"] }) {
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
  if (kind === "children") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 21 v-2 c 0 -3 3 -5 6 -5 c 3 0 6 2 6 5 v2" />
        <path d="M15 21 v-1 c 0 -2 2 -3 4 -3 s 4 1 4 3 v1" />
      </svg>
    );
  }
  if (kind === "about") {
    return (
      <svg {...common}>
        <path d="M20 12c0 4-3.6 7-8 7-1 0-2-.2-3-.5L4 20l1.5-4.5C5.2 14.5 5 13.3 5 12c0-4 3.6-7 8-7s7 3 7 7z" />
      </svg>
    );
  }
  // contact
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="bg-cream">
      {/* Hero block. Centered, dignified, OG-palette only. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[760px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Page not found
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              We couldn&apos;t find that page.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              But we can help.
            </span>
          </h1>
          <p className="mt-6 max-w-xl mx-auto text-lg text-ink-soft leading-[1.65]">
            The page you were looking for isn&apos;t here. It may have
            moved, or the link might be incorrect. Let us point you
            toward what you needed.
          </p>
        </div>
      </header>

      {/* Three helpful link cards — same chrome as the /help quick-
          links grid. */}
      <section className="px-6 pb-20 max-md:pb-16">
        <div className="max-w-[960px] mx-auto">
          <div className="grid grid-cols-3 max-md:grid-cols-1 gap-5">
            {DESTINATIONS.map((dest) => (
              <Link
                key={dest.href}
                href={dest.href}
                className="group block bg-white rounded-2xl border border-ink/[0.06] px-6 py-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep mb-4 group-hover:bg-tangerine group-hover:text-white transition-colors duration-200">
                  <DestinationIcon kind={dest.icon} />
                </div>
                <div className="font-display font-semibold text-lg text-ink leading-tight group-hover:text-tangerine-deep transition-colors duration-200">
                  {dest.title}
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {dest.description}
                </p>
              </Link>
            ))}
          </div>

          <p className="mt-10 text-center text-base text-ink-soft leading-relaxed">
            Or head back to the{" "}
            <Link
              href="/"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              homepage →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
