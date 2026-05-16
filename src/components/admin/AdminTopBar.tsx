// Session 51 — Admin Dashboard desktop top bar.
//
// Mirrors DiTopBar (Session 48a) with admin's identity rendered
// instead of the notification bell. Sits inside the main column
// (right of the fixed sidebar) so the admin sees who they're
// signed in as on every page — important when one human juggles
// multiple admin accounts (founder + ops vs founder personal).

import { Shield } from "lucide-react";
import type { AdminSession } from "@/lib/admin-auth";

export function AdminTopBar({ session }: { session: AdminSession }) {
  const name =
    [session.firstName, session.lastName]
      .filter((s) => s && s.trim().length > 0)
      .join(" ")
      .trim() || session.email;

  return (
    <div className="hidden md:flex items-center justify-end gap-3 px-10 lg:px-12 pt-6">
      <div className="inline-flex items-center gap-2 rounded-full bg-white border border-stone-200 px-3 py-1.5 shadow-sm">
        <Shield
          className="w-3.5 h-3.5 text-tangerine-deeper stroke-[2]"
          aria-hidden="true"
        />
        <span className="text-[13px] text-ink font-medium leading-none">
          {name}
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-soft leading-none">
          {session.roleName}
        </span>
      </div>
    </div>
  );
}
