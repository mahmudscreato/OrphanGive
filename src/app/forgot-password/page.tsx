// /forgot-password — donor enters email; we hand off to Directus's
// native password-reset endpoint (`POST /auth/password/request`)
// which sends the reset link by email and gates token issuance on
// the donor's side. Always shows the same success state regardless
// of whether the email is registered, to prevent account
// enumeration. Rate limiting + token expiry + single-use + session
// invalidation all owned by Directus's auth flow.
//
// Session 24 — brand pass to the Session 16 design language
// (eyebrow + dual-font headline + cream canvas + pill CTA). No
// behavioural change.

import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
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
      <div className="px-6 pt-24 pb-24 max-md:pt-16 max-md:pb-16">
        <div className="max-w-[480px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Forgot your password?
          </div>
          <h1 className="mt-3">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              No problem.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)] mt-2">
              Let&apos;s reset it.
            </span>
          </h1>
          <p className="mt-6 text-base text-ink-soft leading-[1.65]">
            Enter the email associated with your OrphanGive account.
            We&rsquo;ll send you a link to set a new password.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
