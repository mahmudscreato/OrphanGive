// DI "My profile" page (Step 3 of the dashboard revamp).
//
// The sidebar + bottom nav already link to /di/profile but the route
// 404'd. Minimal view-only profile: name, email, role from the DI
// session (requireDiUser). Password changes fall back to "contact
// admin" — there is no DI-facing change-password endpoint in the app
// (api/di/me is GET-only; the only password path is login), so we do
// NOT build a new auth surface here. Sign-out reuses the existing
// /api/di/logout flow via ProfileSignOutButton.

import { requireDiUser } from "@/lib/di-auth";
import { ProfileSignOutButton } from "@/components/di/ProfileSignOutButton";

export const dynamic = "force-dynamic";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4 py-3 border-b border-ink/[0.06] last:border-0">
      <dt className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-slate font-medium sm:w-28 shrink-0 mb-1 sm:mb-0">
        {label}
      </dt>
      <dd className="text-[15px] text-ink break-words">{value}</dd>
    </div>
  );
}

export default async function DiProfilePage() {
  const session = await requireDiUser();
  const fullName =
    [session.firstName, session.lastName]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <div className="px-5 md:px-10 lg:px-12 py-6 md:py-10 max-w-3xl mx-auto">
      <header className="mb-6 md:mb-8">
        <h1 className="font-display text-[28px] md:text-[36px] text-ink leading-tight tracking-tight">
          My profile
        </h1>
        <p className="mt-2 text-[14px] md:text-[15px] text-ink-soft leading-relaxed">
          Your account details. Contact your admin to change your name,
          email, or assigned divisions.
        </p>
      </header>

      {/* Account details — view only */}
      <section className="rounded-2xl border border-ink/[0.08] bg-white p-5 md:p-6">
        <dl>
          <DetailRow label="Name" value={fullName} />
          <DetailRow label="Email" value={session.email} />
          <DetailRow label="Role" value="Data Inputter" />
        </dl>
      </section>

      {/* Password — no self-service flow; admin reset */}
      <section className="mt-5 rounded-2xl border border-ink/[0.08] bg-cream/60 p-5 md:p-6">
        <h2 className="font-display text-[18px] text-ink leading-tight">
          Password
        </h2>
        <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed">
          For security, password changes are handled by an admin. Contact
          your admin and they will send you a reset.
        </p>
        <a
          href="mailto:support@orphangive.org?subject=DI%20Dashboard%20password%20reset"
          className="mt-3 inline-flex items-center gap-2 text-[13.5px] font-medium text-tangerine-deeper hover:underline underline-offset-4"
        >
          Contact admin to reset your password
        </a>
      </section>

      {/* Sign out */}
      <section className="mt-8">
        <ProfileSignOutButton />
      </section>
    </div>
  );
}
