// Sign-out button for the DI profile page. Reuses the EXACT same
// mechanism the sidebar uses: POST /api/di/logout to clear the session
// cookie, then client-side redirect to /di/login (the (authed) layout
// also guards this, so the push lands cleanly).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function ProfileSignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/di/logout", { method: "POST" });
    } catch {
      // ignore — we still redirect to login below
    }
    router.push("/di/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={signingOut}
      className="inline-flex items-center gap-2 rounded-lg border border-ink/[0.12] bg-white px-4 py-2.5 text-[14px] font-medium text-ink-soft hover:bg-tangerine-mist/50 hover:text-tangerine-deeper transition-colors disabled:opacity-50"
    >
      <LogOut className="w-4 h-4 stroke-[1.75]" aria-hidden="true" />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
