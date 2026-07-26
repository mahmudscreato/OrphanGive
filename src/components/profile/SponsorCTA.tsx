import { Button } from "@/components/ui/Button";
import Link from "next/link";
import type { ChildProfile, ViewerTier } from "@/lib/child-profile-data";

const TRUST_PILLS = [
  "Verified profile",
  "Secure payment",
  "48-hour review",
  "Cancel anytime",
];

export function SponsorCTA({
  child,
  tier,
}: {
  child: ChildProfile;
  tier: ViewerTier;
}) {
  const firstName = child.display_name.split(" ")[0];
  // OG-orange band (was near-black). A DEEP tangerine gradient
  // (#C2680D→#9A5207) so cream text stays AA-readable on it.
  return (
    <section className="relative overflow-hidden px-6 py-20 max-md:py-16 bg-gradient-to-br from-[#C2680D] to-[#9A5207] text-cream text-center">
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(255,224,184,0.16) 0%, transparent 60%)",
        }}
      />
      <div
        className="logo-motif"
        aria-hidden="true"
        style={{
          bottom: -100,
          right: -100,
          width: 400,
          height: 400,
          opacity: 0.06,
          transform: "rotate(15deg)",
        }}
      />

      <div className="relative max-w-[720px] mx-auto">
        <div
          className="eyebrow-tag justify-center"
          style={{ color: "var(--tangerine-soft)" }}
        >
          Become {firstName}&apos;s sponsor
        </div>
        <h2 className="font-display font-normal mt-6 text-cream leading-[0.98] tracking-[-0.03em] text-[clamp(2.75rem,5.5vw,5rem)]">
          Walk with{" "}
          <em className="italic text-white">{firstName}</em>
          <br />
          for the next year.
        </h2>
        <p className="mt-7 text-[18px] text-cream/70 leading-[1.65]">
          Sponsorships start at BDT 1,500 a month — covering education, books,
          meals, and care. Your contribution is zakat-eligible and structured
          as ongoing sadaqah. Cancel any time.
        </p>

        <div className="mt-10 flex flex-col gap-4 items-center">
          {/* White pill on the orange band (a tangerine button would
              blend into the background). */}
          {tier === "public" ? (
            <>
              {/* fix/child-profile-support-cta — no sign-in wall. The primary
                  action gives now (guest one-time, account optional after);
                  monthly/recurring genuinely needs an account, offered as the
                  clear secondary. */}
              <Button
                href={`/support/${child.id}`}
                variant="white"
                size="lg"
              >
                Support {firstName} →
              </Button>
              <Link
                href={`/signin?next=/sponsor/${child.id}`}
                className="text-[14px] text-cream/80 hover:text-white underline-offset-4 hover:underline"
              >
                Or sign in to sponsor monthly
              </Link>
            </>
          ) : (
            <Button
              href={`/sponsor/${child.id}`}
              variant="white"
              size="lg"
            >
              Begin a sponsorship →
            </Button>
          )}
        </div>

        <div className="mt-9 flex justify-center gap-6 flex-wrap font-mono text-[11px] tracking-[0.1em] text-cream/75">
          {TRUST_PILLS.map((p) => (
            <span key={p} className="inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-moss" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SponsorCTA;
