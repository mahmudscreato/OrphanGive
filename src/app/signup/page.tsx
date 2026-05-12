import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata = {
  title: "Create a donor account — OrphanGive",
  description: "Sign up to sponsor a verified orphan child in Bangladesh.",
};

export default function SignUpPage() {
  return (
    <div className="bg-cream">
      <section className="px-6 pt-32 pb-20 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[640px] mx-auto">
          <div className="eyebrow-tag">Create your donor account</div>
          <h1 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.5rem)]">
            Walk with a child for the long term.
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            We collect a small amount of information so our safeguarding team
            can verify donors. Your account becomes active after we approve it
            — usually within 1–2 business days.
          </p>

          <div className="mt-10">
            <SignUpForm />
          </div>

          <p className="mt-8 text-sm text-slate">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="text-tangerine-deep font-medium border-b-[1.5px] border-tangerine pb-0.5"
            >
              Sign in →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
