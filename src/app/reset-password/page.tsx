// /reset-password?token=<from-email> — donor lands here from the
// link in the password-reset email Directus sends. Renders a
// new-password form that posts to /api/auth/reset-password.
// Token validation lives server-side in Directus (we just hand
// it through); invalid/expired tokens surface as a friendly
// error after the donor submits.

import Link from "next/link";
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
    <div className="bg-cream min-h-screen">
      <div className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <div className="max-w-[480px] mx-auto">
          <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)] m-0">
            Set a new password
          </h1>
          {token ? (
            <>
              <p className="mt-5 text-[16px] text-slate leading-[1.65]">
                Choose a new password for your OrphanGive account.
                Use at least 8 characters.
              </p>
              <div className="mt-8">
                <ResetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[18px] bg-[#FEEFEF] border border-[#F4C7C7] px-5 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[#A02B2B] mb-2">
                Missing token
              </div>
              <p className="text-[15px] text-ink leading-[1.65] m-0">
                This page only works when opened from the link in
                your password-reset email. If you came here directly,{" "}
                <Link
                  href="/forgot-password"
                  className="text-tangerine-deep underline-offset-4 hover:underline"
                >
                  request a new reset link
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
