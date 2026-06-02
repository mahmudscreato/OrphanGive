// Public safeguarding report page — /safeguarding/report.
//
// Anyone can reach this without logging in. It hosts the report form
// (client component). Tier-1 public surface; no auth, no data fetch.

import type { Metadata } from "next";
import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { SafeguardingReportForm } from "@/components/safeguarding/SafeguardingReportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report a safeguarding concern — OrphanGive",
  description:
    "Raise a safeguarding concern about a child on OrphanGive. Reports are reviewed in confidence by our safeguarding lead. You may report anonymously.",
  robots: { index: false, follow: false },
};

export default function SafeguardingReportPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-[760px] mx-auto px-6 py-16 max-md:py-12">
        <div className="inline-flex items-center text-script-md text-tangerine-deep">
          <EyebrowIcon />
          Safeguarding
        </div>
        <h1 className="mt-4 font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2rem,4.5vw,3rem)]">
          Report a concern.
        </h1>
        <p className="mt-5 text-lg text-ink-soft leading-[1.65]">
          If something about a child on OrphanGive worries you, tell us. Your report
          goes straight to our safeguarding lead and is handled in confidence. You can
          report anonymously — none of your details are required.
        </p>
        <p className="mt-3 text-sm text-ink-soft leading-[1.6]">
          This form records your concern for review; it is{" "}
          <strong className="text-ink">not</strong> monitored around the clock. For the
          full policy, see{" "}
          <Link href="/safeguarding" className="text-tangerine-deep underline-offset-4 hover:underline">
            our safeguarding policy
          </Link>
          .
        </p>

        <div className="mt-8">
          <SafeguardingReportForm />
        </div>
      </div>
    </div>
  );
}
