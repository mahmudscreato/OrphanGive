// Session 20 — For Charities page, brand-aligned with Session 16
// design. Replaces the previous CMS-driven `SitePageRenderer`
// version with a hand-built, structured page covering the full
// partnership value-prop, process, commitments, CTA, and existing
// partners. If Mahmud later wants to A/B copy via Directus, the
// `getSitePage("for-charities")` helper still exists in lib/.
//
// Voice: institutional. Audience: NGO directors, charity ops
// leads, community-org founders. Tier 1 (public, no auth).

import Image from "next/image";
import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { buildPageMetadata } from "@/lib/page-metadata";
// P4 — partnership reach-out form. Replaces the mailto-only CTA so
// inquiries land in a queryable Directus collection instead of a
// support@ inbox blob.
import { PartnershipInquiryForm } from "@/components/charities/PartnershipInquiryForm";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/for-charities",
  title: "For charities & NGOs",
  description:
    "Verified-donor reach, privacy-first child profile management, transparent operations — built for charities operating in Bangladesh.",
});

const GOODVERSE_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/Goodverse_Logo_draft_wqdolh.png";
const CH_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/CH_Logo_E_gsehzj.png";
const GOODVERSE_URL = "https://www.goodverse.org";
const CH_URL = "https://childrensheaventrust.org/";

// Launch-audit #5 — partnership enquiries now route to the dedicated
// partners@ inbox (reverses the Session 32 collapse to support@).
// NOTE: partners@orphangive.org must exist + route (founder to confirm).
const PARTNERSHIPS_MAILTO = "mailto:partners@orphangive.org";

type ValueProp = {
  kind: "verified" | "privacy" | "transparent";
  title: string;
  body: string;
};

const VALUE_PROPS: ValueProp[] = [
  {
    kind: "verified",
    title: "Verified reach",
    body: "Access donors who already trust the verification model. Every child profile carries the OrphanGive verification mark — donors don't need to do their own due diligence.",
  },
  {
    kind: "privacy",
    title: "Privacy-first",
    body: "Child data is protected by default. No race-to-the-bottom photo exploitation, no exposed identifying details. Dignity is the floor, not the ceiling.",
  },
  {
    kind: "transparent",
    title: "Transparent operations",
    body: "Every donation is tracked, reported, and accountable to both donors and partner organizations. Financial flows are visible end-to-end.",
  },
];

type Step = { num: string; title: string; body: string };

const PARTNERSHIP_STEPS: Step[] = [
  {
    num: "01",
    title: "Initial conversation",
    body: "You reach out. We talk about your work, your beneficiaries, and whether OrphanGive's verification model fits how your organization already operates.",
  },
  {
    num: "02",
    title: "Verification of your organization",
    body: "We verify your charity / NGO registration in Bangladesh, request references from existing partners or beneficiaries, and arrange an on-ground visit to your operations.",
  },
  {
    num: "03",
    title: "Onboarding",
    body: "Your team learns the platform — child profile creation, donor reporting, payout requests. We add your organization as a tenant with your own admin access.",
  },
  {
    num: "04",
    title: "Child profile creation",
    body: "We work alongside your field team on the guardian consent process and the privacy review for each profile. Profiles enter draft state until both teams sign off.",
  },
  {
    num: "05",
    title: "Going live",
    body: "Verified profiles become visible to donors. Sponsorships start flowing through OrphanGive's payment infrastructure with quarterly reporting back to your team.",
  },
];

const PARTNER_COMMITMENTS = [
  "Verified registration as a charity / NGO in Bangladesh",
  "Real on-ground presence and field workers",
  "Guardian consent process documented for each child",
  "Commitment to dignity-first communication (no exploitative imagery, no oversharing of identifying details)",
  "Quarterly reporting on funds received and how they were deployed",
  "Cooperation with OrphanGive's verification team during audits and on-ground visits",
];

function ValueIcon({ kind }: { kind: ValueProp["kind"] }) {
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
  if (kind === "verified") {
    return (
      <svg {...common}>
        <path d="M12 2L4 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === "privacy") {
    return (
      <svg {...common}>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  // transparent — bar chart
  return (
    <svg {...common}>
      <path d="M3 3v18h18" />
      <rect x="7" y="13" width="3" height="5" rx="0.5" />
      <rect x="12" y="9" width="3" height="9" rx="0.5" />
      <rect x="17" y="6" width="3" height="12" rx="0.5" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function ForCharitiesPage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            For charities & NGOs
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Reach donors.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Keep your dignity.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            OrphanGive is the donor-facing infrastructure your work
            deserves — not a competitor for the field work, but the
            service that lets donors find, trust, and support the
            children you already serve.
          </p>
        </div>
      </header>

      {/* Value proposition — 3 columns. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-3 max-lg:grid-cols-1 gap-10 max-lg:gap-8">
            {VALUE_PROPS.map((vp) => (
              <div key={vp.kind} className="text-center max-lg:text-left">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-pale text-tangerine-deep mb-5">
                  <ValueIcon kind={vp.kind} />
                </div>
                <h3 className="font-display font-semibold text-xl text-ink mb-3">
                  {vp.title}
                </h3>
                <p className="text-base text-ink-soft leading-[1.65]">
                  {vp.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How partnership works — 5 numbered steps. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-12 max-md:mb-10">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              How partnership works
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Five steps to a working partnership.
              </span>
            </h2>
          </div>

          <ol className="space-y-8 max-md:space-y-7">
            {PARTNERSHIP_STEPS.map((step) => (
              <li
                key={step.num}
                className="flex gap-6 max-md:gap-5 items-start"
              >
                <div
                  className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full font-display font-semibold text-base text-white"
                  style={{
                    background: "var(--orange-solid)",
                    boxShadow: "0 4px 12px rgba(237,139,63,0.30)",
                  }}
                >
                  {step.num}
                </div>
                <div>
                  <h3 className="font-display font-semibold text-xl text-ink leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-base text-ink-soft leading-[1.6]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What we ask of partners — bullet list. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              What we ask of partners
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                A short list. All non-negotiable.
              </span>
            </h2>
          </div>

          <ul className="space-y-4 max-w-[680px] mx-auto">
            {PARTNER_COMMITMENTS.map((commitment) => (
              <li key={commitment} className="flex gap-4 items-start">
                <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                  <CheckIcon className="w-4 h-4" />
                </span>
                <span className="text-base text-ink leading-[1.55]">
                  {commitment}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Application CTA — full-bleed orange band wrapping the
          P4 partnership-inquiry form. The form persists to the
          Directus `partnership_inquiry` collection (see
          /api/partnership-inquiry); admin reviews queue at
          /admin/partnerships. The email fallback link is preserved
          beneath the form so users who prefer email can still
          reach support@. */}
      <section className="px-6 py-16 max-md:py-12 bg-orange-solid text-white">
        <div className="max-w-[720px] mx-auto text-center">
          <h2>
            <span className="block font-display font-normal text-white leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,4vw,2.75rem)]">
              Interested in partnering?
            </span>
            <span className="block font-script text-white leading-[0.95] tracking-[-0.005em] text-[clamp(2rem,4.5vw,3.25rem)] mt-2">
              We&apos;d love to hear from you.
            </span>
          </h2>
          <p className="mt-5 max-w-md mx-auto text-base text-white/90 leading-[1.6]">
            Send us a note about your organization, who you serve,
            and what you&apos;re hoping a partnership could unlock.
          </p>

          <PartnershipInquiryForm />

          <p className="mt-6 text-[12.5px] text-white/85 leading-relaxed">
            Prefer email?{" "}
            <a
              href={PARTNERSHIPS_MAILTO}
              className="underline-offset-2 underline hover:opacity-90"
            >
              Write to us directly
            </a>
            .
          </p>
        </div>
      </section>

      {/* Existing partners footer card. */}
      <section className="px-6 py-14 max-md:py-10">
        <div className="max-w-[760px] mx-auto bg-white rounded-3xl px-10 py-8 max-md:px-6 max-md:py-6 border border-ink/[0.06] shadow-md text-center">
          <div className="text-[12px] uppercase tracking-[0.18em] text-ink-soft mb-5 font-medium">
            Currently in partnership with
          </div>
          <div className="flex items-center justify-center gap-10 max-md:gap-6 flex-wrap">
            <a
              href={GOODVERSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Goodverse Foundation"
              className="inline-flex transition-transform duration-200 hover:scale-[1.04]"
            >
              <Image
                src={GOODVERSE_LOGO}
                alt="Goodverse Foundation"
                width={360}
                height={180}
                unoptimized
                className="h-[72px] max-md:h-[56px] w-auto"
              />
            </a>
            <div
              className="h-[60px] max-md:h-[48px] w-px bg-ink/15"
              aria-hidden="true"
            />
            <a
              href={CH_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Children's Heaven Trust"
              className="inline-flex transition-transform duration-200 hover:scale-[1.04]"
            >
              <Image
                src={CH_LOGO}
                alt="Children's Heaven Trust"
                width={360}
                height={180}
                unoptimized
                className="h-[72px] max-md:h-[56px] w-auto"
              />
            </a>
          </div>
        </div>
      </section>

      {/* Closing strip. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Questions about how partnership works?{" "}
            <Link
              href="/help"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Visit our Help Centre →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
