"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { CartIconButton } from "@/components/cart/CartIconButton";

const NAV_LINKS = [
  { href: "/children", label: "Children" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/stories", label: "Stories" },
  { href: "/for-charities", label: "For charities" },
  { href: "/about", label: "About" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between rounded-full border border-ink/[0.06] py-3 pl-7 pr-4 max-md:w-[calc(100%-24px)] max-md:py-2 max-md:pl-5 max-md:pr-2"
      style={{
        width: "calc(100% - 48px)",
        maxWidth: "1320px",
        background: "rgba(255, 250, 242, 0.85)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-2.5 font-display text-[22px] font-medium text-ink tracking-[-0.01em]"
      >
        <Image
          src="/logo-mark.png"
          alt="OrphanGive"
          width={32}
          height={32}
          priority
          className="w-8 h-8"
        />
        OrphanGive
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
        <CartIconButton />
        <Link
          href="/sign-in"
          className="text-sm font-medium text-slate hover:text-ink px-4 py-2.5 max-md:hidden"
        >
          Sign in
        </Link>
        <Button href="/sponsor" variant="primary">
          Sponsor a Child
        </Button>
      </div>
    </nav>
  );
}

export default SiteNav;
