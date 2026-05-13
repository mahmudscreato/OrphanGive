// /reset-password?token=<from-email> — donor lands here from the
// link in the password-reset email Directus sends. Renders a
// new-password form that posts to /api/auth/reset-password.
// Token validation lives server-side in Directus (we just hand
// it through); invalid/expired tokens surface as a friendly
// error after the donor submits.
//
// Session 24 — brand pass to the Session 16 design language
// (eyebrow + dual-font headline + cream canvas + pill CTA).
// Behaviour unchanged.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reset password — OrphanGive",
  description: "Set a new password for your OrphanGive account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";

  return (
    <main className="bg-cream min-h-screen">
      <div className="px-6 pt-24 pb-24 max-md:pt-16 max-md:pb-16">
        <div className="max-w-[480px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Set a new password
          </div>
          <h1 className="mt-3">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              Almost there.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)] mt-2">
              One last step.
            </span>
          </h1>
          {token ? (
            <>
              <p className="mt-6 text-base text-ink-soft leading-[1.65]">
                Choose a new password for your OrphanGive account.
                Use at least 8 characters.
              </p>
              <div className="mt-8">
                <ResetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-3xl bg-[#FEEFEF] border border-[#F4C7C7] px-6 py-6">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[#A02B2B] mb-2">
                Missing token
              </div>
              <p className="text-[15px] text-ink leading-[1.65] m-0">
                This page only works when opened from the link in
                your password-reset email. If you came here directly,{" "}
                <Link
                  href="/forgot-password"
                  className="text-tangerine-deep underline-offset-4 hover:underline font-medium"
                >
                  request a new reset link
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
