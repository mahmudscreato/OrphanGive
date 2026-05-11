"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { CartIconButton } from "@/components/cart/CartIconButton";

// Session 16 REDO — "For charities" moved to the footer.
// Part 3 Item 4 — "How it works" removed from the top-nav. The
// /how-it-works route still exists (Hero CTA + footer link to
// it), it's just no longer surfaced as a top-level nav item.
const NAV_LINKS = [
  { href: "/children", label: "Children" },
  { href: "/stories", label: "Stories" },
  { href: "/about", label: "About" },
  { href: "mailto:hello@orphangive.org", label: "Contact" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  signedIn: boolean;
  firstName: string | null;
};

export function SiteNav({ signedIn, firstName }: Props) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  // The dashboard renders its own permanent left sidebar, so the
  // floating top nav would just compete for attention. Hide it there.
  if (pathname.startsWith("/dashboard")) return null;

  // Session 16 polish Fix A — switched from a floating-pill
  // `fixed top-6` design to a full-width `sticky top-0` bar.
  // Fixed had a layering issue with the Hero's brushed-circle
  // decorations and the rounded pill's narrow width left bare
  // canvas above/around it. Sticky + full width gives a solid
  // anchor that always sits above the content and never overlaps.
  return (
    <motion.nav
      className="sticky top-0 z-50 w-full border-b border-ink/[0.06]"
      style={{
        background: "rgba(251, 241, 229, 0.92)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
      }}
      initial={reduced ? false : { y: -20, opacity: 0 }}
      animate={reduced ? undefined : { y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-6 px-6 py-4 lg:py-5 max-md:px-4 max-md:py-3">
        <Link
          href="/"
          className="inline-flex items-center shrink-0"
          aria-label="OrphanGive — home"
        >
          {/* Combined icon+wordmark SVG from Cloudinary.
              ViewBox 948.8×407.81 ≈ 2.327:1.
              Rendered at h-12 (48px) mobile → h-14 (56px) lg+ per
              Micro-fix C; width is auto via the intrinsic aspect.
              Intrinsic dimensions doubled (260×112) for crisp
              rendering on high-DPR displays; CSS controls layout. */}
          <Image
            src="https://res.cloudinary.com/dh9w1apsk/image/upload/v1778388529/OG_Logo_L_SVG_h9uduq.svg"
            alt="OrphanGive"
            width={260}
            height={112}
            priority
            unoptimized
            className="h-12 lg:h-14 w-auto"
          />
        </Link>

        <div className="flex items-center gap-1 max-md:hidden">
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-[18px] py-2.5 text-sm font-medium rounded-full transition-all duration-200 ease-soft ${
                  active
                    ? "bg-tangerine-mist text-ink"
                    : "text-slate hover:bg-tangerine-mist hover:text-ink"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Charity-trust pattern: cart icon is only visible to
              signed-in donors. Anonymous visitors are routed through
              sign-in before they can build a cart, so we don't surface
              the cart at all. The cart_session cookie data isn't
              destroyed — when they sign in the icon reappears with
              whatever was saved. */}
          {signedIn ? <CartIconButton /> : null}
          {signedIn ? (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate hover:text-ink px-4 py-2.5 max-md:hidden"
            >
              {firstName ? `Hi, ${firstName}` : "Dashboard"}
            </Link>
          ) : (
            <Link
              href="/signin"
              className="text-sm font-medium text-slate hover:text-ink px-4 py-2.5 max-md:hidden"
            >
              Sign in
            </Link>
          )}
          <Button href="/sponsor" variant="primary">
            Sponsor a Child
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}

export default SiteNav;
