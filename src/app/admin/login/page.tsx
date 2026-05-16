// Session 51 — Admin Dashboard login page.
//
// Public route (no auth gate). Mirror of /di/login (Session 42). The
// (authed) sibling group at src/app/admin/(authed)/ holds everything
// behind the admin session check; this page sits OUTSIDE that group
// at /admin/login.
//
// The form POSTs to the existing /api/admin/login endpoint
// (Session 46-fix-2). On success we router.push('/admin'), which
// lands in the (authed) layout — that layout calls requireAdminUser()
// + redirects to here on null.

import type { Metadata } from "next";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = {
  title: "Sign in — OrphanGive Admin",
  description:
    "Admin sign-in for OrphanGive. Reviews proposals, moments, " +
    "deliveries, and documents from the Data Inputter team.",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <h1 className="font-display text-[28px] text-ink leading-tight">
            OrphanGive
            <span className="block text-[18px] text-ink-soft font-normal mt-1">
              Admin
            </span>
          </h1>
          <p className="font-script italic text-tangerine-deep text-[18px] mt-2">
            review &amp; approval
          </p>
        </header>

        <AdminLoginForm />

        <p className="mt-8 text-center text-[13px] text-ink-soft">
          Forgotten your password?{" "}
          <a
            href="mailto:support@orphangive.org?subject=Admin%20Dashboard%20password%20reset"
            className="text-tangerine-deeper underline-offset-4 hover:underline"
          >
            Contact us
          </a>
          .
        </p>
      </div>
    </main>
  );
}
