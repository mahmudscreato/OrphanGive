// =====================================================================
// Session 20 — /transparency page (Session 32 review applied).
//
//   ⚠️  TODO: confirm with Mahmud BEFORE pushing public.
//
//   Per Session 32 review: TBD-NGOAB and TBD-BB-FXCLEAR removed
//   entirely. Goodverse and Children's Heaven Trust are the
//   regulated parties (referenced in the operating-entity +
//   verification-partner rows of the Regulatory Standing block);
//   OrphanGive itself is not separately regulated. TBD-AUDITOR
//   replaced with stable copy referencing a Bangladesh Chartered
//   Accountant firm (no individual auditor named).
//
//   Remaining items needing sign-off:
//
//     - TBD-ALLOCATION:   85 / 10 / 5 split between child support,
//                         operations, and service infra. Confirm with
//                         the finance team that these numbers reflect
//                         actual fund allocation.
//
//   Until TBD-ALLOCATION is filled in OR the percentages are
//   removed, this page is in draft.
//
// =====================================================================

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/transparency",
  title: "Transparency",
  description:
    "Public commitment to transparency in operations and funds. Fund allocation, reporting cadence, verification model, regulatory standing.",
});

// TBD-ALLOCATION — confirm with finance team before publish.
type Allocation = {
  pct: number;
  label: string;
  description: string;
};
const ALLOCATIONS: Allocation[] = [
  {
    pct: 85,
    label: "Child support",
    description:
      "Sponsorship payouts, clothing, education materials, healthcare — the funds that reach children directly.",
  },
  {
    pct: 10,
    label: "Operations",
    description:
      "Verification of new profiles, on-ground field visits, partner organization support and audits.",
  },
  {
    pct: 5,
    label: "Service infrastructure",
    description:
      "Technology, payment processing fees, hosting, security, and the systems that keep donations moving.",
  },
];

type ReportingCadence = {
  cadence: string;
  title: string;
  body: string;
};
const REPORTING: ReportingCadence[] = [
  {
    cadence: "Real-time",
    title: "Donor dashboard",
    body: "Every payment is visible to the donor the moment it clears — no waiting for an end-of-month statement.",
  },
  {
    cadence: "Quarterly",
    title: "Per-child reports",
    body: "Each sponsor receives a quarterly progress report on the child they support — schooling, health, family circumstances.",
  },
  {
    cadence: "Annually",
    title: "Public annual report",
    body: "A full report covering the network — total funds raised, deployed, and the outcomes those funds enabled.",
  },
];

function ChartIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="13" width="3" height="5" rx="0.5" />
      <rect x="12" y="9" width="3" height="9" rx="0.5" />
      <rect x="17" y="6" width="3" height="12" rx="0.5" />
    </svg>
  );
}

export default function TransparencyPage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Transparency
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Every taka tracked.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Every donor informed.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Trust is earned by being checkable. The numbers, processes,
            and regulatory standing on this page are the floor — not
            the marketing line.
          </p>
        </div>
      </header>

      {/* Where your money goes — horizontal CSS bar chart. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[920px] mx-auto">
          <div className="text-center mb-12 max-md:mb-10">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Where your money goes
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                The split between programs and platform.
              </span>
            </h2>
          </div>

          {/* TBD-ALLOCATION — placeholder figures. */}
          <div className="space-y-7 max-md:space-y-6">
            {ALLOCATIONS.map((a) => (
              <div key={a.label}>
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="font-display font-semibold text-ink text-lg">
                    {a.label}
                  </div>
                  <div className="font-display font-bold text-tangerine-deep text-2xl tracking-tight">
                    {a.pct}%
                  </div>
                </div>
                <div
                  className="h-3 rounded-full bg-ink/[0.06] overflow-hidden"
                  role="progressbar"
                  aria-valuenow={a.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${a.label}: ${a.pct} percent of funds`}
                >
                  <div
                    className="h-full rounded-full bg-orange-solid"
                    style={{ width: `${a.pct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {a.description}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-ink-soft/80 italic">
            Figures shown are the target allocation as agreed with our
            partner foundations. Variance is reported in the annual
            report.
          </p>
        </div>
      </section>

      {/* Reporting cadence — 3 cards. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-12 max-md:mb-10">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Reporting cadence
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Three rhythms of accountability.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-6 max-lg:gap-5">
            {REPORTING.map((r) => (
              <div
                key={r.cadence}
                className="bg-white rounded-2xl px-7 py-7 border border-ink/[0.06] shadow-md"
              >
                <div className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-tangerine-deep mb-3">
                  {r.cadence}
                </div>
                <h3 className="font-display font-semibold text-xl text-ink leading-tight">
                  {r.title}
                </h3>
                <p className="mt-3 text-base text-ink-soft leading-[1.6]">
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verification & accountability. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Verification & accountability
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Who checks the work.
              </span>
            </h2>
          </div>

          <ul className="space-y-5 max-w-[680px] mx-auto">
            <li className="flex gap-4 items-start">
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                <ChartIcon className="w-4 h-4" />
              </span>
              <span className="text-base text-ink leading-[1.6]">
                <strong className="font-semibold">
                  Children&apos;s Heaven Trust
                </strong>{" "}
                verifies every child profile before publication —
                guardian consent, household circumstances, on-ground
                field check.
              </span>
            </li>
            <li className="flex gap-4 items-start">
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                <ChartIcon className="w-4 h-4" />
              </span>
              <span className="text-base text-ink leading-[1.6]">
                <strong className="font-semibold">
                  Goodverse Foundation
                </strong>{" "}
                oversees governance, financial accountability, and
                annual reporting.
              </span>
            </li>
            <li className="flex gap-4 items-start">
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                <ChartIcon className="w-4 h-4" />
              </span>
              <span className="text-base text-ink leading-[1.6]">
                <strong className="font-semibold">External audit:</strong>{" "}
                OrphanGive&apos;s annual financial accounts are
                reviewed by a Bangladesh-based Chartered Accountant
                firm. Audit findings inform our annual transparency
                report.
              </span>
            </li>
            <li className="flex gap-4 items-start">
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                <ChartIcon className="w-4 h-4" />
              </span>
              <span className="text-base text-ink leading-[1.6]">
                All financial records are available on request to
                verified press, regulators, and partner organizations.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Regulatory standing. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[760px] mx-auto bg-white rounded-3xl px-10 py-8 max-md:px-6 max-md:py-7 border border-ink/[0.06] shadow-md">
          <div className="text-[12px] uppercase tracking-[0.18em] text-ink-soft mb-5 font-medium text-center">
            Regulatory standing
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-x-10 md:gap-y-5">
            <div>
              <dt className="font-display font-semibold text-base text-ink">
                Operating entity
              </dt>
              <dd className="mt-1 text-base text-ink-soft leading-[1.55]">
                Goodverse Foundation, registered in Bangladesh.
              </dd>
            </div>
            {/* Session 32 — NGOAB + BB-FXCLEAR rows removed per
                Mahmud's review. Goodverse and Children's Heaven
                Trust are the regulated parties; OrphanGive surfaces
                them via the operating-entity + verification-partner
                rows below rather than re-stating their registration
                numbers as if they were OrphanGive's own. */}
            <div>
              <dt className="font-display font-semibold text-base text-ink">
                Verification partner
              </dt>
              <dd className="mt-1 text-base text-ink-soft leading-[1.55]">
                Children&apos;s Heaven Trust (Reg. iv-98/2021).
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Closing strip. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            More questions about transparency?{" "}
            <Link
              href="/faq"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Visit our FAQ →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
