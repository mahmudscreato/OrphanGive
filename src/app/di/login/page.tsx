// Session 42 — DI Dashboard login page.
//
// Public route (no auth gate). The (authed) sibling route group at
// src/app/di/(authed)/ holds everything that requires a DI session;
// this page sits OUTSIDE that group at /di/login.
//
// The form POSTs to /api/di/login. On success we router.push('/di'),
// which lands in the (authed) layout — that layout calls requireDiUser()
// which re-reads the freshly-set cookie and resolves the session.
//
// Design notes:
//   - Brand voice: "OrphanGive · Data Inputter" Fraunces; "field team
//     access" Caveat italic — same Caveat-as-byline pattern from
//     Session 16's homepage redesign.
//   - bg-cream / tangerine button / ink text matches the donor /signin.
//   - No "create account" link — DI accounts are admin-provisioned.

import type { Metadata } from "next";
import { DiLoginForm } from "./DiLoginForm";

export const metadata: Metadata = {
  title: "Sign in — OrphanGive Data Inputter",
  description:
    "Field-team sign-in for OrphanGive's Data Inputter dashboard. " +
    "Admin-provisioned accounts only.",
  robots: { index: false, follow: false },
};

export default function DiLoginPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <h1 className="font-display text-[28px] text-ink leading-tight">
            OrphanGive
            <span className="block text-[18px] text-ink-soft font-normal mt-1">
              Data Inputter
            </span>
          </h1>
          <p className="font-script italic text-tangerine-deep text-[18px] mt-2">
            field team access
          </p>
        </header>

        <DiLoginForm />

        <p className="mt-8 text-center text-[13px] text-ink-soft">
          Forgotten your password?{" "}
          <a
            href="mailto:support@orphangive.org?subject=DI%20Dashboard%20password%20reset"
            className="text-tangerine-deeper underline-offset-4 hover:underline"
          >
            Contact admin
          </a>
          .
        </p>
      </div>
    </main>
  );
}
