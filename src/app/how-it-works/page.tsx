// Session 18 — How It Works deep-dive page, brand-aligned with the
// Session 16 design system. Replaces the prior SitePageRenderer
// (CMS-driven) version with a hand-built, structured page that
// extends the homepage `HowItWorks` component into the full story:
// 5 steps with deep-dive copy + alternating photo placement,
// verification deep-dive, transparency block, FAQ teaser,
// closing strip.
//
// Tier 1 (public, no auth). Server Component. The FAQ uses native
// HTML <details>/<summary> so it works without JavaScript.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";
import { PhotoBlob, type BlobPathKey } from "@/components/decorations/PhotoBlob";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How OrphanGive works",
  description:
    "From verification to delivery, the full story of how OrphanGive sponsorships work — five steps, the verification model, transparent fund flow, and the most-asked questions.",
  openGraph: {
    title: "How OrphanGive works",
    description:
      "Five steps from verification to delivery. The full story of how sponsorships work, who verifies, and how funds flow.",
  },
};

// --- 5-step content. Each step picks one Cloudinary asset that
// already lives in the homepage components — no new assets added,
// per the no-new-Cloudinary-assets rule established in Session 17.
type Step = {
  num: string;
  title: string;
  paragraphs: string[];
  photo: string;
  alt: string;
  pathKey: BlobPathKey;
};

const STEPS: Step[] = [
  {
    num: "01",
    title: "Identify & Verify",
    paragraphs: [
      "Profiles begin with our partner field teams in Bangladesh — community elders, school principals, local imams. Children's Heaven Trust visits in person, meets the guardian, sees the household. Nothing about a child appears on this site until that visit has happened.",
      "Each candidate is then checked against documented criteria: identity, guardian status, household income, schooling, healthcare access, and the specific support need. We don't list a child until every box is signed off by a CH Trust field worker who has met the family.",
      "It's deliberately slow. The verification floor is what lets donors trust the listing without doing their own due diligence — and it's what keeps the network from drifting toward exploitation.",
    ],
    photo:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490184/_OrphanGive_CG_V1__30_rkztod.png",
    alt: "Field worker with a child during a verification visit",
    pathKey: "story1",
  },
  {
    num: "02",
    title: "Safe Profile",
    paragraphs: [
      "Once a child is verified, we work with the guardian on the public profile together. The display name appears on the page; everything else — exact address, school name, household details, family circumstances — stays on the protected side of the schema.",
      "Photos are only published with explicit guardian consent, and that consent is documented per-photo. If a guardian withdraws consent, the photo comes down within 24 hours. The \"Privacy protected\" badge on every card is not decorative — it's a contract.",
      "The information you can see is tiered. Public visitors see name, division, age, and support need. Authenticated donors see the richer profile. Sponsoring donors, with reveal approval, can see identifying details for direct contact. Each tier exists because the next one would compromise the child if it were public.",
    ],
    photo:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490174/_OrphanGive_CG_V2_14_glfz6v.png",
    alt: "Child whose profile has just been verified",
    pathKey: "story2",
  },
  {
    num: "03",
    title: "Choose a Package",
    paragraphs: [
      "Most donors choose monthly sponsorship — predictable, durable, and the model that lets us plan a child's support over years instead of weeks. One-time gifts are welcome too; they top up specific funds (clothing, healthcare, schooling) without committing to a recurring relationship.",
      "Each contribution can be tagged to a bucket: schooling, clothing, healthcare, general care. Tags determine how the funds are deployed on the ground; the totals show up in your donor dashboard so you can see exactly what your money funded.",
      "Many of OrphanGive's payment structures are configured to be Zakat-eligible. We don't make a sharia ruling on your behalf — see the FAQ below for the structural details, then check with your scholar before designating funds as Zakat.",
    ],
    photo:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490184/_OrphanGive_CG_V1__9_s75ylm.png",
    alt: "A child whose sponsorship has just been confirmed",
    pathKey: "story3",
  },
  {
    num: "04",
    title: "Deliver Support",
    paragraphs: [
      "Donations clear through Stripe, settle to OrphanGive's operating account, and then move to Children's Heaven Trust on a regular cadence for ground delivery. The handoff is logged; nothing leaves the operating account untracked.",
      "CH Trust's field team handles the actual delivery. School fees go to the school directly. Clothing is sized, fitted, and delivered seasonally. Healthcare is coordinated with local clinics or hospitals. Where possible, the guardian receives a delivery receipt that gets uploaded back to the child's profile.",
      "Sometimes delivery doesn't land cleanly — a school changes its fees mid-term, a child moves district, a clinic appointment slips. We keep a small operating buffer and report variance honestly in the quarterly update. Better to over-disclose than to over-promise.",
    ],
    photo:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778521851/_OrphanGive_CG_V2_10_ppnjjm.png",
    alt: "Field delivery of school supplies to a sponsored child",
    pathKey: "story1",
  },
  {
    num: "05",
    title: "Donor Updates",
    paragraphs: [
      "Every payment shows in your donor dashboard the moment it clears, with a clean ledger of which child it was tagged to and which bucket it funded. No waiting for an end-of-month statement — the source of truth is live.",
      "Once a quarter, the field team writes a short report on the child you support: schooling, growth, family circumstances, anything worth sharing. You receive it by email and on your dashboard. Reports are short, factual, and never use stock charity-marketing language.",
      "Once a year, OrphanGive publishes a network-wide annual report covering totals raised, totals deployed, allocation by bucket, and the outcomes those funds enabled. Public to anyone — donor or not.",
    ],
    photo:
      "https://res.cloudinary.com/dh9w1apsk/image/upload/q_auto/f_auto/v1778490177/_OrphanGive_CG_V1__17_p3q5wv.png",
    alt: "A child reading a letter from their sponsor",
    pathKey: "story2",
  },
];

// --- Verification deep-dive — what each verification visit covers.
const VERIFICATION_ITEMS = [
  {
    title: "Identity",
    body: "The child's name, age, family composition, and the documents that establish each.",
  },
  {
    title: "Guardian status",
    body: "Who has legal custody, what their relationship to the child is, and how they came to be the guardian.",
  },
  {
    title: "School enrolment",
    body: "Current grade, school name, class teacher contact, attendance pattern, any active barriers to schooling.",
  },
  {
    title: "Household situation",
    body: "Income source, dependents, housing security, the broader context the child lives in.",
  },
  {
    title: "Support need",
    body: "What specifically the child needs — schooling, clothing, healthcare, general care — and what each costs.",
  },
  {
    title: "Photo consent",
    body: "Explicit, documented, and recorded per-photo. Withdrawable at any time, honoured within 24 hours.",
  },
];

// --- Transparency block — payment buckets we accept tags for.
const PAYMENT_BUCKETS = [
  "Schooling",
  "Clothing",
  "Healthcare",
  "General care",
  "Zakat-designated",
];

// --- FAQ teaser. Voice: Bangladesh org, no GDPR / no 501(c)(3),
// never the word "platform".
type Faq = { q: string; a: string };
const FAQS: Faq[] = [
  {
    q: "Is my donation Zakat-eligible?",
    a: "Most of OrphanGive's monthly sponsorship structures are configured to be Zakat-eligible — the children listed are orphans or vulnerable in the categories Zakat traditionally serves. We don't issue a sharia ruling on your behalf. Please see the structural details on the full FAQ and consult your own scholar before designating funds as Zakat.",
  },
  {
    q: "Can I cancel my sponsorship?",
    a: "Yes, anytime. Monthly sponsorships can be paused or cancelled from your donor dashboard with one click. The child whose sponsorship you cancel re-enters the waiting pool — there's no friction and no penalty.",
  },
  {
    q: "Can I meet the child I sponsor?",
    a: "In-person meetings happen only with explicit guardian consent and are arranged by Children's Heaven Trust's field team. Most sponsorships develop through written quarterly updates and the donor dashboard rather than in-person visits, but the path exists if both sides want it.",
  },
  {
    q: "Why is the network Bangladesh-only?",
    a: "OrphanGive runs on the ground through Children's Heaven Trust's existing field network in Bangladesh. Verification depth is what makes the listings trustworthy, and that depth requires real on-the-ground operations — which we have here, today. Other countries are not on the near-term roadmap; we'd rather do one country well than many countries thinly.",
  },
  {
    q: "How is this different from a regular charity donation?",
    a: "A regular charity donation typically goes into a general pool. With OrphanGive, you sponsor an individual verified child by name — funds are tagged to that child's profile and reported back to you per-quarter. OrphanGive is also a service for partner charities; we don't compete with them, we route donors to them.",
  },
];

// Wobbly hand-drawn arrow pointing down, used between step
// sections for visual rhythm. Vertical orientation of the
// horizontal `StepArrow` from the homepage `HowItWorks` component.
function StepDownArrow() {
  return (
    <svg
      viewBox="0 0 24 60"
      fill="none"
      aria-hidden="true"
      className="w-6 h-12 mx-auto opacity-70"
    >
      <g stroke="#ED8B3F" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* Wobbly shaft. */}
        <path d="M 12 4 Q 14 18 11 32 T 12 50" strokeWidth="3" />
        {/* Arrowhead — two strokes meeting at a point. */}
        <path d="M 5 44 L 12 54 L 19 44" strokeWidth="3" />
      </g>
    </svg>
  );
}

export default function HowItWorksPage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            How OrphanGive works
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Simple steps.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Lasting change.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            From verification to delivery, the journey is short and
            accountable. Here&apos;s the full story.
          </p>
        </div>
      </header>

      {/* The 5 steps — alternating left/right photo placement. */}
      <section className="px-6 py-10 max-md:py-6">
        <div className="max-w-[1200px] mx-auto">
          {STEPS.map((step, i) => {
            // Odd-indexed (steps 02, 04) flip the photo to the right.
            const photoOnRight = i % 2 === 1;
            return (
              <div key={step.num}>
                <div
                  className={`grid grid-cols-2 max-lg:grid-cols-1 gap-12 max-lg:gap-8 items-center py-12 max-md:py-8 ${
                    photoOnRight ? "" : ""
                  }`}
                >
                  {/* Photo column. CSS order swap on lg+ so mobile
                      always renders photo first regardless of
                      desktop placement. */}
                  <div
                    className={`relative aspect-square max-w-[480px] mx-auto w-full ${
                      photoOnRight ? "lg:order-2" : ""
                    }`}
                  >
                    <PhotoBlob
                      pathKey={step.pathKey}
                      src={step.photo}
                      alt={step.alt}
                      ringColor="#ED8B3F"
                      objectPosition="center 20%"
                      sizes="(max-width: 1024px) 100vw, 480px"
                      className="w-full h-full"
                    />
                  </div>

                  {/* Copy column. */}
                  <div className={photoOnRight ? "lg:order-1" : ""}>
                    {/* Numbered badge. */}
                    <div
                      className="inline-flex items-center justify-center w-12 h-12 rounded-full font-display font-semibold text-base text-white"
                      style={{
                        background: "var(--orange-solid)",
                        boxShadow: "0 4px 12px rgba(237,139,63,0.30)",
                      }}
                    >
                      {step.num}
                    </div>
                    <h2 className="mt-4 font-display font-semibold text-3xl max-md:text-2xl text-ink leading-tight tracking-[-0.01em]">
                      {step.num}. {step.title}
                    </h2>
                    <div className="mt-4 space-y-4 max-md:space-y-3">
                      {step.paragraphs.map((p, j) => (
                        <p
                          key={j}
                          className="text-base text-ink-soft leading-[1.7]"
                        >
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Wobbly down-arrow between steps (skipped after the
                    last). Hidden on the smallest screens where
                    vertical rhythm already reads. */}
                {i < STEPS.length - 1 ? (
                  <div className="py-4 max-md:hidden">
                    <StepDownArrow />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Verification deep-dive. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Verification, in detail
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                What &quot;verified&quot; actually means.
              </span>
            </h2>
          </div>

          <p className="text-base text-ink-soft leading-[1.7] max-w-[680px] mx-auto">
            OrphanGive&apos;s verification has two parts: ground-truth
            checks done by Children&apos;s Heaven Trust&apos;s field
            team in Bangladesh, and the privacy-tiered information
            architecture that protects what those checks reveal. The
            first makes the listing trustworthy; the second keeps it
            from harming the child.
          </p>

          <h3 className="mt-10 font-display font-semibold text-xl text-ink mb-5 text-center">
            What gets checked on every visit
          </h3>
          <ul className="grid grid-cols-2 max-md:grid-cols-1 gap-x-8 gap-y-5">
            {VERIFICATION_ITEMS.map((item) => (
              <li key={item.title} className="flex gap-3 items-start">
                <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-pale text-tangerine-deep mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <div className="font-display font-semibold text-base text-ink">
                    {item.title}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft leading-[1.55]">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Privacy tier model — three small stacked rows. */}
          <h3 className="mt-12 font-display font-semibold text-xl text-ink mb-5 text-center">
            What each viewer can see
          </h3>
          <div className="space-y-3 max-w-[680px] mx-auto">
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-4 flex gap-4 items-start">
              <span className="shrink-0 font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mt-0.5">
                Tier 1
              </span>
              <span className="text-sm text-ink-soft leading-[1.6]">
                <strong className="font-semibold text-ink">
                  Public, no sign-in:
                </strong>{" "}
                name, Bangladesh division, age in years, support need.
              </span>
            </div>
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-4 flex gap-4 items-start">
              <span className="shrink-0 font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mt-0.5">
                Tier 2
              </span>
              <span className="text-sm text-ink-soft leading-[1.6]">
                <strong className="font-semibold text-ink">
                  Authenticated donors:
                </strong>{" "}
                richer profile — more photos, support history, sponsor
                queue state.
              </span>
            </div>
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-4 flex gap-4 items-start">
              <span className="shrink-0 font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mt-0.5">
                Tier 3
              </span>
              <span className="text-sm text-ink-soft leading-[1.6]">
                <strong className="font-semibold text-ink">
                  Sponsoring donor with reveal approval:
                </strong>{" "}
                identifying details for direct contact with the
                guardian.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Transparency block. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[860px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Transparency
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Where every taka goes.
              </span>
            </h2>
          </div>

          <p className="text-base text-ink-soft leading-[1.7] max-w-[680px] mx-auto">
            Funds clear through Stripe into OrphanGive&apos;s
            operating account, then move to Children&apos;s Heaven
            Trust on a regular cadence for ground delivery. Every
            handoff is logged. Nothing leaves the operating account
            untracked.
          </p>
          <p className="mt-4 text-base text-ink-soft leading-[1.7] max-w-[680px] mx-auto">
            Each contribution can be tagged to one of these buckets at
            checkout. The tag determines how the funds are deployed on
            the ground; bucket totals appear in your donor dashboard.
          </p>

          <div className="mt-7 flex flex-wrap gap-2 max-w-[680px] mx-auto justify-center">
            {PAYMENT_BUCKETS.map((bucket) => (
              <span
                key={bucket}
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-orange-pale text-tangerine-deep text-sm font-medium"
              >
                {bucket}
              </span>
            ))}
          </div>

          <h3 className="mt-12 font-display font-semibold text-xl text-ink mb-5 text-center">
            Reporting cadence
          </h3>
          <div className="grid grid-cols-3 max-md:grid-cols-1 gap-5 max-md:gap-4">
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-2">
                Real-time
              </div>
              <div className="font-display font-semibold text-base text-ink leading-tight">
                Donor dashboard
              </div>
              <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                Every payment visible the moment it clears.
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-2">
                Quarterly
              </div>
              <div className="font-display font-semibold text-base text-ink leading-tight">
                Per-child reports
              </div>
              <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                Field-team update on schooling, growth, family.
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-ink/[0.06] px-5 py-5">
              <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-tangerine-deep mb-2">
                Annually
              </div>
              <div className="font-display font-semibold text-base text-ink leading-tight">
                Public annual report
              </div>
              <p className="mt-2 text-sm text-ink-soft leading-[1.55]">
                Network-wide totals, allocation, outcomes.
              </p>
            </div>
          </div>

          <p className="mt-10 text-base text-ink-soft leading-[1.7] max-w-[680px] mx-auto text-center">
            Stories from the children themselves are coming soon —
            published only with explicit guardian consent. Until then,
            the dashboard and the quarterly reports are the source of
            truth for how your sponsorship is unfolding.
          </p>
        </div>
      </section>

      {/* FAQ teaser — native HTML <details> for no-JS accessibility. */}
      <section className="px-6 py-16 max-md:py-12">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-10 max-md:mb-8">
            <div className="inline-flex items-center text-script-md text-tangerine-deep">
              <EyebrowIcon />
              Most-asked questions
            </div>
            <h2 className="mt-3">
              <span className="font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(1.75rem,3.5vw,2.5rem)]">
                A few things worth knowing.
              </span>
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl bg-white border border-ink/[0.06] px-6 py-5 transition-shadow hover:shadow-md open:shadow-md"
              >
                <summary className="cursor-pointer list-none flex justify-between items-center gap-4 font-display font-semibold text-lg text-ink">
                  <span>{faq.q}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-pale text-tangerine-deep transition-transform duration-200 group-open:rotate-45 text-xl leading-none"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 text-base text-ink-soft leading-[1.65]">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/faq"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              More questions? See the full FAQ →
            </Link>
          </div>
        </div>
      </section>

      {/* Closing strip — same quiet pattern as /children, /about. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Ready to support a child?{" "}
            <Link
              href="/children"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Browse verified profiles →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
