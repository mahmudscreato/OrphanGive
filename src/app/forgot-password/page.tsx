// /forgot-password — donor enters email; we hand off to Directus's
// native password-reset endpoint (`POST /auth/password/request`)
// which sends the reset link by email and gates token issuance on
// the donor's side. Always shows the same success state regardless
// of whether the email is registered, to prevent account
// enumeration. Rate limiting is owned by Directus's reset endpoint.

import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Forgot password — OrphanGive",
  description:
    "Reset your OrphanGive password via the link we'll email you.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="px-6 pt-32 pb-24 max-md:pt-24 max-md:pb-16">
        <div className="max-w-[480px] mx-auto">
          <h1 className="font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)] m-0">
            Forgot your password?
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            Enter the email associated with your OrphanGive account.
            We&rsquo;ll send you a link to reset your password.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
