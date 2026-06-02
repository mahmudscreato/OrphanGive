"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CartIconButton } from "@/components/cart/CartIconButton";

// Session 32 — "How It Works" added back between Children and
// Stories per Mahmud's review. Contact link fixed: was a
// `mailto:hello@orphangive.org` (no longer the canonical inbox);
// now routes to the in-app /contact page (built in Session 19,
// wired to support@orphangive.org via Resend in this session).
// Launch-audit #10 — "Stories" hidden from the main nav until there is
// real content (the page currently shows "Coming soon"). The /stories
// route still exists; it's simply not linked from the header. Restore
// this entry when stories ship. (Footer still lists it — founder to
// decide whether to drop it there too.)
const NAV_LINKS = [
  { href: "/children", label: "Children" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
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

  // Mobile drawer state. Hooks run before the early return below so the
  // Rules of Hooks hold on the routes where the nav renders null.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the drawer on route change (covers link taps that navigate).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // While open: lock body scroll, close on Esc, trap Tab focus inside the
  // panel, move focus into it; on close restore scroll + focus the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    const toggle = menuButtonRef.current;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      toggle?.focus();
    };
  }, [menuOpen]);

  // The dashboard renders its own permanent left sidebar, so the
  // floating top nav would just compete for attention. Hide it there.
  // Session 25 — also hide on /maintenance and /offline, which both
  // ship their own inline logo header and need to render even when
  // the rest of the app's data layer is unreachable.
  // Session 42-FIX2 — also hide on /di/*. The DI Dashboard ships its
  // own DiSidebar (desktop) + DiHeader/DiBottomNav (mobile). The
  // marketing nav (Children/How It Works/Stories/About/Contact +
  // Sponsor a Child) is for prospective sponsors and has no place
  // inside the staff data-entry surface — it would visually compete
  // with the sidebar on desktop and stack with DiHeader on mobile.
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/di") ||
    pathname.startsWith("/admin") ||
    pathname === "/maintenance" ||
    pathname === "/offline"
  ) {
    return null;
  }

  // Session 16 polish Fix A — switched from a floating-pill
  // `fixed top-6` design to a full-width `sticky top-0` bar.
  // Fixed had a layering issue with the Hero's brushed-circle
  // decorations and the rounded pill's narrow width left bare
  // canvas above/around it. Sticky + full width gives a solid
  // anchor that always sits above the content and never overlaps.
  return (
    <>
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
          {/* Part 5.10 Fix D — destination changed from `/sponsor`
              (which 404s — only `/sponsor/[childId]` exists) to
              `/children`. Picking a specific child is a
              prerequisite for sponsorship; the children gallery is
              the natural funnel entry. */}
          <Button href="/children" variant="primary">
            Sponsor a Child
          </Button>

          {/* Mobile menu toggle — shown only below md, exactly where the
              desktop nav pills + Sign in are hidden (max-md:hidden), so
              there is always one nav affordance and never two. */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="md:hidden inline-flex items-center justify-center w-11 h-11 -mr-1 rounded-full text-ink hover:bg-tangerine-mist transition-colors duration-200"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3.5" y1="7" x2="20.5" y2="7" />
              <line x1="3.5" y1="12" x2="20.5" y2="12" />
              <line x1="3.5" y1="17" x2="20.5" y2="17" />
            </svg>
          </button>
        </div>
      </div>
    </motion.nav>

    {/* Mobile drawer. Rendered as a SIBLING of <nav> (not a child): the
        nav's backdrop-filter would otherwise become the containing block
        for position:fixed descendants and pin the drawer to the header.
        md:hidden so it never exists on desktop. Always mounted + toggled
        via framer `animate` (not AnimatePresence): an interrupted exit
        unmount could freeze a half-faded overlay over the page; here the
        layer is simply inert + off-screen + click-through when closed
        (overflow-hidden clips the off-screen panel so it adds no scroll). */}
    <div
      id="mobile-menu"
      className="md:hidden fixed inset-0 z-[60] overflow-hidden"
      style={{ pointerEvents: menuOpen ? "auto" : "none" }}
      aria-hidden={!menuOpen}
      {...(menuOpen ? {} : { inert: true })}
    >
      {/* Dimmed overlay — tap to close. */}
      <motion.div
        className="absolute inset-0 bg-ink/40"
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
        initial={false}
        animate={{ opacity: menuOpen ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.2 }}
        style={{ pointerEvents: menuOpen ? "auto" : "none" }}
      />

      {/* Slide-in panel. */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className="absolute top-0 right-0 h-full w-[82%] max-w-[340px] bg-cream shadow-2xl flex flex-col"
        initial={false}
        animate={{ x: menuOpen ? 0 : "100%" }}
        transition={{ duration: reduced ? 0 : 0.28, ease: "easeOut" }}
      >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink/[0.08]">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-tangerine-deep">
                Menu
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="inline-flex items-center justify-center w-10 h-10 -mr-1 rounded-full text-ink hover:bg-tangerine-mist transition-colors duration-200"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-col px-3 py-3" aria-label="Mobile">
              {NAV_LINKS.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`px-4 py-3.5 text-base font-medium rounded-2xl transition-colors duration-200 ${
                      active
                        ? "bg-tangerine-mist text-ink"
                        : "text-slate hover:bg-tangerine-mist hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href={signedIn ? "/dashboard" : "/signin"}
                onClick={() => setMenuOpen(false)}
                className="px-4 py-3.5 text-base font-medium rounded-2xl text-slate hover:bg-tangerine-mist hover:text-ink transition-colors duration-200"
              >
                {signedIn ? (firstName ? `Hi, ${firstName}` : "Dashboard") : "Sign in"}
              </Link>
            </nav>

            {/* Primary CTA — kept prominent (full-width) in the menu too.
                Styled to match the Button `primary` variant; a plain Link
                is used so it can be full-width (the Button wrapper is an
                inline-block span). */}
            <div className="mt-auto px-4 py-5 border-t border-ink/[0.08]">
              <Link
                href="/children"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full rounded-full bg-ink text-cream font-body font-semibold py-3.5 text-base hover:bg-tangerine hover:text-ink transition-colors duration-200"
              >
                Sponsor a Child
              </Link>
            </div>
      </motion.div>
    </div>
    </>
  );
}

export default SiteNav;
