// Session 32 — /volunteer page. Replaces the prior placeholder
// (footer link routed to /about as a stop-gap). Server Component
// shell; the form lives in a small client island.
//
// Hero + 4-card "What we need" + form + closing strip. Form
// submissions route via /api/contact (kind="volunteer") to
// support@orphangive.org.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";
import { VolunteerForm } from "./VolunteerForm";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/volunteer",
  title: "Volunteer with OrphanGive",
  description:
    "Lend your time and skills to OrphanGive. Field verification visits, content and translation, design, photography, event coordination, fundraising, and more.",
});

type Need = {
  kind: "field" | "content" | "design" | "events";
  title: string;
  description: string;
  commitment: string;
};

const NEEDS: Need[] = [
  {
    kind: "field",
    title: "Field verification visits",
    description:
      "Join Children's Heaven Trust's field team in Bangladesh for in-person child + household verification. Volunteer requires being based in Bangladesh.",
    commitment: "Project-based, monthly visits",
  },
  {
    kind: "content",
    title: "Content & translation",
    description:
      "Help us write, edit, and translate site copy, donor reports, and quarterly updates between Bangla, English, and Arabic.",
    commitment: "2–4 hours / week",
  },
  {
    kind: "design",
    title: "Design & development",
    description:
      "Web design, illustration, frontend code, accessibility audits. Remote OK. Pair with our small engineering team.",
    commitment: "Flexible, project-based",
  },
  {
    kind: "events",
    title: "Event coordination",
    description:
      "Help organise donor events, awareness drives, and partner outreach in Dhaka and abroad.",
    commitment: "Event-by-event basis",
  },
];

function NeedIcon({ kind }: { kind: Need["kind"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "w-6 h-6",
  };
  if (kind === "field") {
    return (
      <svg {...common}>
        <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    );
  }
  if (kind === "content") {
    return (
      <svg {...common}>
        <path d="M4 5h16M4 12h16M4 19h10" />
      </svg>
    );
  }
  if (kind === "design") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 8 L 16 16 M 16 8 L 8 16" />
      </svg>
    );
  }
  // events
  return (
    <svg {...common}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

export default function VolunteerPage() {
  return (
    <div className="bg-cream">
      {/* Hero */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Volunteer
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Lend your time.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Lend your skills.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Volunteers help with verification visits in Bangladesh,
            content and translation across Bangla, English, and Arabic,
            design and development work, and outreach across the
            global OrphanGive community. If any of that fits your
            time, we&apos;d love to hear from you.
          </p>
        </div>
      </header>

      {/* What we need — 4-card grid */}
      <section className="px-6 py-10 max-md:py-8">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-8 max-md:mb-6">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              What we need
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Where you can help.
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-4 max-lg:grid-cols-2 max-md:grid-cols-1 gap-5">
            {NEEDS.map((n) => (
              <div
                key={n.kind}
                className="bg-white rounded-2xl border border-ink/[0.06] px-6 py-6 shadow-sm"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep mb-4">
                  <NeedIcon kind={n.kind} />
                </div>
                <div className="font-display font-semibold text-base text-ink leading-tight">
                  {n.title}
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                  {n.description}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] tracking-[0.14em] uppercase font-mono text-tangerine-deep">
                  {n.commitment}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[760px] mx-auto bg-white rounded-3xl px-8 py-8 max-md:px-6 max-md:py-7 border border-ink/[0.06] shadow-md">
          <h2 className="font-display font-semibold text-2xl text-ink mb-1">
            Apply to volunteer
          </h2>
          <p className="text-sm text-ink-soft mb-6 leading-relaxed">
            Tell us a bit about you and how you&apos;d like to help.
            Our team will reach out within a few business days.
          </p>
          <VolunteerForm />
        </div>
      </section>

      {/* Closing strip */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Other ways to help?{" "}
            <Link
              href="/how-it-works"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              See how it works →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
