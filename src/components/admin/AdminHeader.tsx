// Session 51 — Admin Dashboard mobile header.
//
// Mirror of DiHeader. Admin doesn't have a NotificationBell yet
// (in-app notifications are DI-targeted only — see Session 47),
// so the right side is a sign-out button instead of a bell.
//
// Mahmud's call: "OrphanGive · ADMIN" brand mark, same Fraunces +
// mono uppercase byline pattern as the DI header.

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

const FAVICON_URL =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778506582/Fevicon_2_ky8rxa.png";

export function AdminHeader() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="md:hidden bg-cream border-b border-ink/[0.06] px-5 py-3 sticky top-0 z-30 flex items-center justify-between gap-3">
      <Link href="/admin" className="inline-flex items-center gap-2.5">
        <Image
          src={FAVICON_URL}
          alt=""
          width={36}
          height={50}
          unoptimized
          aria-hidden="true"
          className="w-6 h-auto shrink-0"
        />
        <div>
          <div className="font-display text-[16px] text-ink leading-tight">
            OrphanGive
          </div>
          <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-soft -mt-0.5">
            Admin
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        aria-label="Sign out"
        className="inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-soft hover:bg-tangerine-mist/50 hover:text-tangerine-deeper transition-colors disabled:opacity-50"
      >
        <LogOut className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
      </button>
    </header>
  );
}
