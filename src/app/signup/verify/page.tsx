import Link from "next/link";
import { VerifyForm } from "./verify-form";

export const metadata = {
  title: "Verify your email — OrphanGive",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const emailParam = sp.email;
  const email =
    typeof emailParam === "string"
      ? emailParam
      : Array.isArray(emailParam)
        ? emailParam[0] ?? ""
        : "";

  return (
    <main className="bg-cream">
      <section className="px-6 pt-32 pb-20 max-md:pt-28 max-md:pb-16">
        <div className="max-w-[520px] mx-auto">
          <div className="eyebrow-tag">Verify your email</div>
          <h1 className="font-display font-normal mt-5 text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2rem,4vw,3rem)]">
            Enter the 6-digit code we just sent.
          </h1>
          <p className="mt-5 text-[16px] text-slate leading-[1.65]">
            We emailed a code to{" "}
            {email ? (
              <span className="text-ink font-medium">{email}</span>
            ) : (
              "your address"
            )}
            . It expires in 10 minutes.
          </p>

          <div className="mt-10">
            <VerifyForm initialEmail={email} />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
            <Link
              href={`/signup${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="text-slate hover:text-tangerine-deep transition-colors"
            >
              ← Use a different email
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
