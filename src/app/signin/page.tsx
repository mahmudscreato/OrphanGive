// Session 24 — brand pass for the sign-in page to match the
// /forgot-password + /reset-password auth-page family. Behaviour
// unchanged — the SignInForm still wires to `signInAction` from
// (auth)/actions.ts. Only the surrounding chrome changes.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { SignInForm } from "./sign-in-form";

type SearchParams = Promise<{
  next?: string | string[];
  registered?: string | string[];
  verified?: string | string[];
}>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export const metadata = {
  title: "Sign in — OrphanGive",
  description: "Sign in to your OrphanGive donor account.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = asString(params.next);
  const registered = asString(params.registered) === "1";
  const verified = asString(params.verified) === "1";

  return (
    <div className="bg-cream min-h-screen">
      <div className="px-6 pt-24 pb-24 max-md:pt-16 max-md:pb-16">
        <div className="max-w-[480px] mx-auto">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Sign in
          </div>
          <h1 className="mt-3">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
              Welcome back.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.5rem,5vw,3.75rem)] mt-2">
              Good to see you.
            </span>
          </h1>

          {verified ? (
            <p className="mt-6 rounded-2xl bg-moss-soft/60 border border-moss/30 px-4 py-3 text-sm text-moss-deep">
              Email verified. You can sign in now.
            </p>
          ) : null}
          {registered ? (
            <p className="mt-6 rounded-2xl bg-orange-pale/60 border border-tangerine-soft px-4 py-3 text-sm text-tangerine-deep">
              Account created. Check your inbox to verify your email.
            </p>
          ) : null}

          <div className="mt-8">
            <SignInForm next={next} />
          </div>

          <p className="mt-6 text-sm text-ink-soft">
            Need an account?{" "}
            <Link
              href="/signup"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Create one →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
