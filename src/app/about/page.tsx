// Session 17.5 Part B — /about page, brand-aligned with the
// Session 16 design system. Replaces the prior CMS-driven
// (SitePageRenderer) version with a hand-built page that
// reuses the homepage AboutSection's pattern (eyebrow +
// dual-font headline + linked partner card + tilted PhotoBlob)
// and extends it across four blocks: Hero / Why we exist /
// How we work / Who we are / Closing strip.
//
// Tier 1 — public, no auth. Server Component.
//
// Voice rules (consistent with Session 16+ pass): no "platform",
// no GDPR / 501(c)(3), Bangladesh org throughout, the founder
// is referenced as "the founder" (not by name) since Mahmud
// isn't named elsewhere on the live site.

import Image from "next/image";
import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { PhotoBlob } from "@/components/decorations/PhotoBlob";
// Session 64 — see faq/page.tsx for the same migration rationale.
import { buildPageMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  path: "/about",
  title: "About OrphanGive — Bangladesh's verified child sponsorship network",
  description:
    "OrphanGive is a project of Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021) — a verified child sponsorship network for orphaned and vulnerable children in Bangladesh.",
});

// --- Asset constants. URLs match the homepage AboutSection so
// the visual language stays consistent. No new Cloudinary uploads.
const GOODVERSE_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/Goodverse_Logo_draft_wqdolh.png";
const CH_LOGO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778509860/CH_Logo_E_gsehzj.png";
const ABOUT_PHOTO =
  "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778521851/_OrphanGive_CG_V2_10_ppnjjm.png";

const GOODVERSE_URL = "https://www.goodverse.org";
const CH_URL = "https://childrensheaventrust.org/";

// --- "How we work" cards. Operating model, not values — keeps
// this distinct from the homepage Four Principles section.
type Pillar = {
  kind: "verification" | "privacy" | "transparency" | "partnership";
  title: string;
  statement: string;
  detail: string;
};

const PILLARS: Pillar[] = [
  {
    kind: "verification",
    title: "Verification",
    statement:
      "Every child profile is checked in person before publication.",
    detail:
      "Children's Heaven Trust's field team meets each guardian, sees the household, and reviews documentation. Nothing appears on the public site until that visit is signed off.",
  },
  {
    kind: "privacy",
    title: "Privacy protection",
    statement:
      "A three-tier information model that protects what verification reveals.",
    detail:
      "Public visitors see name, division, age, and support need. Authenticated donors see a richer profile. Sponsoring donors with reveal approval can see identifying details for direct contact. Each tier exists because the next would compromise the child if it were public.",
  },
  {
    kind: "transparency",
    title: "Transparency",
    statement:
      "Funds are tagged at checkout, tracked in your dashboard, and reported per quarter.",
    detail:
      "Donations clear through Stripe, settle into OrphanGive's operating account, and move to the field on a regular cadence. Every payment shows in your donor dashboard the moment it clears, with the bucket it funded.",
  },
  {
    kind: "partnership",
    title: "Partnership",
    statement:
      "OrphanGive is the donor-facing service for verified partner charities — never a competitor.",
    detail:
      "We work with Goodverse Foundation (Reg. S-14837/2026) as the operating entity and Children's Heaven Trust (Reg. iv-98/2021) as the field partner. Other Bangladesh charities can apply to list children under the same verification model.",
  },
];

function PillarIcon({ kind }: { kind: Pillar["kind"] }) {
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
  if (kind === "verification") {
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
  if (kind === "transparency") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }
  // partnership
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 21 v-2 c 0 -3 3 -5 6 -5 c 3 0 6 2 6 5 v2" />
      <path d="M15 21 v-1 c 0 -2 2 -3 4 -3 s 4 1 4 3 v1" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <div className="bg-cream">
      {/* HERO BLOCK — eyebrow + dual-font headline + sub-copy +
          partner card + tilted PhotoBlob on the right. Mirrors
          the homepage AboutSection but scaled up for the
          dedicated page. */}
      <header className="px-6 pt-20 pb-16 max-md:pt-14 max-md:pb-12">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-16 items-center max-lg:gap-12">
          {/* Left column — eyebrow, headline, sub-copy, partner card. */}
          <div>
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              About OrphanGive
            </div>
            <h1 className="mt-4">
              <span className="block font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.5rem)]">
                A bridge of hope.
              </span>
              <span
                className="block font-script italic text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.75rem,5.5vw,4rem)]"
                style={{ marginTop: 6 }}
              >
                A future of dignity.
              </span>
            </h1>
            <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-[520px]">
              OrphanGive is a verified child sponsorship network for
              orphaned and vulnerable children in Bangladesh. A
              project of Goodverse Foundation in partnership with
              Children&apos;s Heaven Trust, we connect donors
              directly to individual children — verified on the
              ground, protected by a tiered privacy model, and
              supported by transparent fund tracking.
            </p>

            {/* Partner card — same pattern as the homepage
                AboutSection. Logos linked, hover-scaled. */}
            <div className="mt-10 inline-block bg-white rounded-3xl px-10 py-8 max-md:px-6 max-md:py-6 border border-ink/[0.06] shadow-md">
              <div className="text-[12px] uppercase tracking-[0.18em] text-ink-soft mb-5 font-medium">
                A project by
              </div>
              <div className="flex items-center gap-10 max-md:gap-6">
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
                    className="h-[90px] max-md:h-[64px] w-auto"
                  />
                </a>
                <div
                  className="h-[80px] max-md:h-[60px] w-px bg-ink/15"
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
                    className="h-[90px] max-md:h-[64px] w-auto"
                  />
                </a>
              </div>
            </div>
          </div>

          {/* Right column — tilted PhotoBlob. Same girl photo URL
              from the homepage AboutSection. Server Component
              friendly: no motion wrapper. */}
          <div
            className="relative w-full max-lg:max-w-[560px] max-lg:mx-auto"
            style={{ height: 540 }}
          >
            <div
              className="absolute"
              style={{ top: 30, right: 60, bottom: 30, left: 40 }}
            >
              <PhotoBlob
                pathKey="tilted"
                src={ABOUT_PHOTO}
                alt="A glimpse of OrphanGive's work in Bangladesh"
                ringColor="#ED8B3F"
                outerStrokeWidth={12}
                innerStrokeWidth={7}
                objectPosition="center 15%"
                sizes="(max-width: 1024px) 100vw, 600px"
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      </header>

      {/* WHY WE EXIST BLOCK — single-column narrative. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Why we exist
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                The need is real. The verified channel is rare.
              </span>
            </h2>
          </div>

          <div className="space-y-5 text-base text-ink-soft leading-[1.7]">
            <p>
              Bangladesh has roughly 4.8 million orphaned children.
              Most live with extended family — a grandmother, an
              aunt, an older sibling — but the household income
              doesn&apos;t stretch far enough to cover school fees,
              decent clothing, or a doctor&apos;s visit when one is
              needed. The children stay alive; their futures
              quietly compress.
            </p>
            <p>
              The international donor pool that wants to help is
              real and generous. The bottleneck has always been
              trust: which child is genuinely in need, who is
              verifying that, and what happens to the money after
              checkout. Most general charity giving solves these
              questions with a brand. OrphanGive solves them with a
              verification floor.
            </p>
            <p>
              The tiered privacy model is the other half of the
              answer. A child needs to be specific enough to a
              donor that the relationship feels real, but not so
              specific that the child becomes findable, exploitable,
              or stripped of dignity by the act of being listed. So
              the public surface is deliberately spare; richer
              detail unlocks for authenticated donors; identifying
              details only ever appear with reveal approval and the
              guardian&apos;s consent.
            </p>
          </div>
        </div>
      </section>

      {/* HOW WE WORK BLOCK — 4 cards. Operating model, NOT the
          homepage's value statements. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              How we work
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                The operating model.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-5 max-md:gap-4">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.kind}
                className="bg-white rounded-2xl border border-ink/[0.06] px-6 py-6 shadow-sm"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-pale text-tangerine-deep mb-4">
                  <PillarIcon kind={pillar.kind} />
                </div>
                <h3 className="font-display font-semibold text-lg text-ink leading-tight">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm text-tangerine-deep font-medium leading-snug">
                  {pillar.statement}
                </p>
                <p className="mt-3 text-sm text-ink-soft leading-[1.6]">
                  {pillar.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO WE ARE BLOCK — Goodverse + CH Trust as 2 cards. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Who we are
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                The people behind OrphanGive.
              </span>
            </h2>
            <p className="mt-5 max-w-2xl mx-auto text-base text-ink-soft leading-[1.6]">
              OrphanGive was built by the founder in collaboration
              with two organisations whose names appear on every
              page — and whose work made the verification floor
              possible in the first place.
            </p>
          </div>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-6 max-md:gap-5">
            {/* Goodverse Foundation card. */}
            <div className="bg-white rounded-3xl border border-ink/[0.06] shadow-md px-8 py-8 max-md:px-6 max-md:py-7">
              <a
                href={GOODVERSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Goodverse Foundation"
                className="inline-flex transition-transform duration-200 hover:scale-[1.03]"
              >
                <Image
                  src={GOODVERSE_LOGO}
                  alt="Goodverse Foundation"
                  width={360}
                  height={180}
                  unoptimized
                  className="h-[110px] max-md:h-[80px] w-auto"
                />
              </a>
              <h3 className="mt-5 font-display font-semibold text-xl text-ink leading-tight">
                Goodverse Foundation
              </h3>
              <p className="mt-3 text-base text-ink-soft leading-[1.65]">
                The operating entity behind OrphanGive — a registered
                Bangladesh organisation (Reg. S-14837/2026). Goodverse
                Foundation oversees governance, financial
                accountability, and the donor-facing service.
                Goodverse holds the technology, the donor data, and
                the relationships with international partners.
              </p>
              <a
                href={GOODVERSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1 text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
              >
                Visit Goodverse Foundation →
              </a>
            </div>

            {/* Children's Heaven Trust card. */}
            <div className="bg-white rounded-3xl border border-ink/[0.06] shadow-md px-8 py-8 max-md:px-6 max-md:py-7">
              <a
                href={CH_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Children's Heaven Trust"
                className="inline-flex transition-transform duration-200 hover:scale-[1.03]"
              >
                <Image
                  src={CH_LOGO}
                  alt="Children's Heaven Trust"
                  width={360}
                  height={180}
                  unoptimized
                  className="h-[110px] max-md:h-[80px] w-auto"
                />
              </a>
              <h3 className="mt-5 font-display font-semibold text-xl text-ink leading-tight">
                Children&apos;s Heaven Trust
              </h3>
              <p className="mt-3 text-base text-ink-soft leading-[1.65]">
                The field partner — a registered Bangladesh charity
                (Reg. iv-98/2021) that handles
                ground verification, guardian relationships, and
                on-the-ground delivery of every sponsored child&apos;s
                support. CH Trust is what makes the verification
                floor real.
              </p>
              <a
                href={CH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1 text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
              >
                Visit Children&apos;s Heaven Trust →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING STRIP — quiet pattern, same as /children's
          BrowseClosingStrip (Session 17). */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Want to understand more?{" "}
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
