// Session 37 — /faq rebuilt as a hardcoded page with 33 Q&As across
// 6 groups, brand-aligned with the rest of the site (/about,
// /how-it-works, /transparency).
//
// Why hardcoded: the Session 15a CMS-driven version read from a
// Directus `faq` collection that was never populated, so the page
// shipped showing the empty-state. At OrphanGive's scale, FAQ
// content is reviewed in batches by Mahmud and updated by code
// commit — that round-trip is acceptable and gives us versioning,
// PR review, and easy a11y / styling control. The Directus `faq`
// collection is intentionally NOT removed (other code may still
// reference it), we just stop fetching from it here.
//
// Voice rules (Session 32 onwards):
//   - Bangladesh org. No GDPR, no 501(c)(3) language.
//   - Never the word "platform" — "network", "service", "OrphanGive".
//   - Present-tense, dignified, factual. No "transform lives" /
//     "make a difference" charity-marketing tropes.
//   - Reference Goodverse Foundation + Children's Heaven Trust by
//     name where appropriate.
//   - Registered address + phone + safeguarding lead surface where
//     they answer the question.
//   - All query emails route to support@orphangive.org.
//
// Accessibility: each Q&A is a native HTML `<details>` element so
// the page works without JavaScript. Each `<details>` has an `id`
// matching the question's slug so other pages (/help, /contact)
// can deep-link to a specific question via `/faq#what-is-orphangive`.
// The chevron icon rotates 180° on open via the
// `group-open:rotate-180` Tailwind utility — pure CSS, no client JS.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export const dynamic = "force-dynamic";

// Session 64 — switched to buildPageMetadata so the og:image flows
// through. The inline {title, description}-only openGraph block above
// was overriding the layout's file-convention images via Next.js's
// shallow metadata merge, leaving no og:image meta tag at all on this
// page. See src/lib/page-metadata.ts for the why.
import { buildPageMetadata } from "@/lib/page-metadata";

export const metadata = buildPageMetadata({
  path: "/faq",
  title: "FAQ — OrphanGive",
  description:
    "Answers to common questions about sponsoring a child through OrphanGive — payments, updates, the organisation, and your account.",
});

// ─── Data ────────────────────────────────────────────────────────────

type FaqItem = {
  /** Slug used in the deep-link anchor (`/faq#<id>`). */
  id: string;
  question: string;
  /** Plain-text answer; rendered with `whitespace-pre-line` so
   * paragraph breaks come from `\n\n` in the string. */
  answer: string;
};

type FaqGroup = {
  /** Group's URL-safe id, used on the section element so groups can
   * be linked to as section anchors too (e.g. `/faq#submitting`). */
  id: string;
  eyebrow: string;
  heading: string;
  items: FaqItem[];
};

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "about",
    eyebrow: "About OrphanGive",
    heading: "About OrphanGive",
    items: [
      {
        id: "what-is-orphangive",
        question: "What is OrphanGive?",
        answer:
          "OrphanGive is a child-sponsorship service operated by Goodverse Foundation (Reg. S-14837/2026) in partnership with Children's Heaven Trust (Reg. iv-98/2021). We connect donors with verified orphan children in Bangladesh through transparent, dignified sponsorship — monthly or prepaid, with regular updates.",
      },
      {
        id: "who-runs-orphangive",
        question: "Who runs OrphanGive?",
        answer:
          "OrphanGive is operated by Goodverse Foundation (Reg. S-14837/2026), a Bangladesh-registered organisation, in partnership with Children's Heaven Trust (Reg. iv-98/2021). Children's Heaven Trust handles on-ground verification, family visits, and the delivery of sponsorship support. Our registered address is Ta 135/B, Gulshan Badda Link Road, Dhaka 1212, Bangladesh.",
      },
      {
        id: "where-do-you-operate",
        question: "Where do you operate?",
        answer:
          "OrphanGive operates exclusively in Bangladesh. Children listed on the service live across all 8 divisions (Dhaka, Chittagong, Khulna, Rajshahi, Barisal, Sylhet, Rangpur, Mymensingh). Our field team works directly with guardians and local communities to verify each child's situation before publication.",
      },
      {
        id: "registered-charity",
        question: "Are you a registered charity?",
        answer:
          "OrphanGive is operated by Goodverse Foundation (Reg. S-14837/2026), registered in Bangladesh, in partnership with Children's Heaven Trust (Reg. iv-98/2021), our partner organisation handling field verification, registered with the NGO Affairs Bureau of Bangladesh. We are subject to Bangladesh charity and tax law.",
      },
      {
        id: "how-different",
        question:
          "How are you different from other child sponsorship organisations?",
        answer:
          "Three differences: we are Bangladesh-specific (not a global network with thin local presence), we use a three-tier privacy model that protects each child's identity (public listings show only a first name — which may be shortened or changed for protection — never a full legal name; addresses, schools, and guardian information stay private), and every donation is tracked with transparent reporting. We also publish field updates only with explicit guardian consent.",
      },
    ],
  },
  {
    id: "sponsorship",
    eyebrow: "Sponsorship & donation",
    heading: "Sponsorship & donation",
    items: [
      {
        id: "monthly-sponsorship",
        question: "How does monthly sponsorship work?",
        answer:
          "Once you sponsor a child, your card is charged monthly on the same day. The funds go directly to that child's support — education, food, clothing, healthcare, or general care, depending on their needs. You can cancel anytime through your donor dashboard; we don't charge cancellation fees.",
      },
      {
        id: "minimum-monthly",
        question: "What's the minimum monthly amount?",
        answer:
          "The minimum monthly sponsorship is BDT 1,500 per child. This covers each child's core support costs. You can sponsor more if you wish to contribute additional support; the extra goes into that child's general care fund.",
      },
      {
        id: "zakat-eligible",
        question: "Is my donation Zakat-eligible?",
        answer:
          "Yes. Donations to OrphanGive support orphan children, a Zakat-eligible category under Islamic jurisprudence. You can specify Zakat-only donations during checkout, and we direct those funds to the most Zakat-eligible needs (orphan support, education, healthcare). We provide annual giving summaries for your records.",
      },
      {
        id: "one-time-donation",
        question: "Can I make a one-time donation instead?",
        answer:
          "Yes. In addition to monthly sponsorship, you can make a one-time gift toward a specific child or toward general OrphanGive operations. One-time gifts are available from the child's profile page or from the general donation page.",
      },
      {
        id: "sponsor-multiple",
        question: "Can I sponsor more than one child?",
        answer:
          "Yes. There's no limit. Each sponsorship is independent, so you can sponsor monthly for one child and a prepaid period for another. All your sponsorships appear in your donor dashboard.",
      },
      {
        id: "cancel-sponsorship",
        question: "Can I cancel my sponsorship?",
        answer:
          "Yes. You can cancel anytime from your donor dashboard. Cancellations take effect at the end of your current billing cycle (we don't charge after cancellation, but we honour the current month). If you've prepaid for several months, see our refund policy for unused-month handling.",
      },
      {
        id: "child-no-longer-needs",
        question: "What happens to my donation if a child is no longer in need?",
        answer:
          "If a child's situation changes and they no longer need sponsorship (e.g., adopted into a family, situation stabilised, or aged out of the programme), we notify you immediately. You can transfer your sponsorship to another waiting child, receive a refund for unused prepaid months, or convert to a general OrphanGive contribution.",
      },
      {
        id: "tax-receipt",
        question: "Can I get a tax receipt?",
        answer:
          "We provide donation receipts on request via support@orphangive.org. For international donors: whether your donation is tax-deductible in your country depends on your local tax law and Goodverse Foundation's registration status in your jurisdiction (currently Bangladesh only). Consult your local tax advisor.",
      },
    ],
  },
  {
    id: "children-privacy",
    eyebrow: "Children & privacy",
    heading: "Children & privacy",
    items: [
      {
        id: "verification",
        question: "How are children verified?",
        answer:
          "Children's Heaven Trust verifies every child profile before publication. The process includes household visits, document review (birth records, guardian identification, school enrolment where applicable), and conversations with the child's guardians. Profiles take approximately 7–14 days from referral to publication.",
      },
      {
        id: "last-names",
        question: "Why are last names hidden?",
        answer:
          "We use a three-tier privacy model. Tier 1 (public, on this site): a first name (which may be shortened or changed to protect the child), age in years, Bangladesh division, and a guardian-consented photo are visible — never a full legal name. Tier 2 (authenticated donors): slightly more context. Tier 3 (sponsoring donors with approved reveal): limited additional progress information, viewed through OrphanGive only. Identifying details — school name, exact address, full date of birth, guardian contact, precise location — are never shown to donors at any tier, and we never share contact details or broker direct contact with the child or family. This protects each child's safety and dignity.",
      },
      {
        id: "see-photos",
        question: "Can I see photos of the child I sponsor?",
        answer:
          "Yes, where guardian consent is in place. Each child's photo on the public profile is published only after explicit guardian permission. Sponsoring donors receive additional approved photographs over time as part of the progress updates.",
      },
      {
        id: "meet-child",
        question: "Can I meet the child I sponsor?",
        answer:
          "In-person meetings are not currently part of OrphanGive's service. Children's Heaven Trust handles on-ground field interactions; we don't facilitate donor-child meetings to protect the child's safety, privacy, and routine. We do facilitate written and visual updates approved by the guardian.",
      },
      {
        id: "child-no-longer-sponsored",
        question: "What if a child no longer needs sponsorship?",
        answer:
          "We notify you immediately if a child's situation changes — adoption, situation stabilised, or transition out of the programme. You can transfer your sponsorship to another waiting child, receive a refund for unused prepaid months, or convert your sponsorship to a general OrphanGive contribution.",
      },
      {
        id: "protect-privacy",
        question: "How do you protect children's privacy?",
        answer:
          "Children's identifying information is encrypted at rest and accessible only to authorised OrphanGive and Children's Heaven Trust personnel. We never publish school names, addresses, guardian contact details, or precise locations. Photographs are published only with explicit guardian consent. Our designated safeguarding lead is Sarmin Sultana at Children's Heaven Trust, reachable at safeguarding@orphangive.org, and we operate under Bangladesh law including the Children Act 2013 and applicable child protection laws.",
      },
    ],
  },
  {
    id: "payments",
    eyebrow: "Payments",
    heading: "Payments",
    items: [
      {
        id: "payment-methods",
        question: "What payment methods do you accept?",
        answer:
          "We currently accept Visa, Mastercard, and American Express via Stripe. bKash and Nagad support is planned; card payments via Stripe are available now.",
      },
      {
        id: "payment-secure",
        question: "Is my payment secure?",
        answer:
          "Yes. Payments are processed by Stripe, a globally recognised payment processor (PCI-DSS Level 1 certified). OrphanGive never sees or stores your full card details — we receive only a payment token from Stripe. All transactions use 256-bit SSL encryption.",
      },
      {
        id: "card-saved",
        question: "Will my card be saved?",
        answer:
          "Stripe stores your card details securely so you can update or cancel a sponsorship without re-entering them. You can remove saved cards anytime from your donor dashboard.",
      },
      {
        id: "when-charged",
        question: "When am I charged?",
        answer:
          "For monthly sponsorships: on the same date each month from the day you signed up. For prepaid sponsorships: a single charge at checkout. For one-time gifts: a single charge at checkout. Your statement descriptor will show OrphanGive.",
      },
      {
        id: "refund",
        question: "Can I get a refund?",
        answer:
          "Refunds are available for duplicate or accidental charges (within 48 hours), demonstrable fraud, or OrphanGive's failure to deliver promised support. Pro-rated refunds for unused prepaid months are issued at OrphanGive's discretion, subject to verification that the funds have not yet been deployed. See our refund policy for complete details.",
      },
    ],
  },
  {
    id: "account",
    eyebrow: "Account",
    heading: "Account",
    items: [
      {
        id: "sign-in",
        question: "How do I sign in?",
        answer:
          "Visit /signin and enter your email and password. If you don't have an account yet, create one at /signup. After signing in, you'll see your donor dashboard with all your sponsorships, payment history, and account settings.",
      },
      {
        id: "forgot-password",
        question: "I forgot my password.",
        answer:
          "Visit /forgot-password and enter the email associated with your account. We'll send you a reset link valid for one hour. If you don't receive the email within a few minutes, check your spam folder or email support@orphangive.org.",
      },
      {
        id: "update-payment",
        question: "How do I update my payment method?",
        answer:
          "Sign in to your donor dashboard, go to Billing, and update your card details. The new card will be used for your next sponsorship payment. You can also remove old cards from the same screen.",
      },
      {
        id: "delete-account",
        question: "How do I delete my account?",
        answer:
          "Email support@orphangive.org with your account email and request deletion. Note that we retain donor records for seven years after account closure for tax and audit purposes (per Bangladesh law), but your account will no longer be accessible after deletion. Active sponsorships must be cancelled separately before deletion.",
      },
    ],
  },
  {
    id: "submitting",
    eyebrow: "Submitting an orphan profile",
    heading: "Submitting an orphan profile",
    items: [
      {
        id: "submit-profile",
        question: "I know an orphan who needs support. How can I submit their profile?",
        answer:
          "We welcome referrals from guardians, relatives, community members, and partner organisations. Visit /contact and select “I know an orphan who needs support” — fill in the form with the child's basic information. Our team will review every submission and contact you to discuss next steps within 7 business days.",
      },
      {
        id: "who-can-submit",
        question: "Who can submit an orphan profile?",
        answer:
          "Profiles can only be submitted by the child's guardian or with the guardian's explicit consent. Community members, relatives, and partner organisations can refer a case, but the guardian must give consent before we begin formal verification. This protects the child's interests and ensures we're working with authorised representatives.",
      },
      {
        id: "after-submit",
        question: "What happens after I submit a profile?",
        answer:
          "Our team at Children's Heaven Trust reviews each submission. We'll contact you to schedule an initial conversation, gather more details, and discuss what's needed for verification. If the situation fits OrphanGive's scope, we begin formal verification — a process that includes household visits, document review, and guardian consent for publication. The full process typically takes 14–28 days.",
      },
      {
        id: "verification-info-needed",
        question: "What information do you need to start verification?",
        answer:
          "For initial review: the child's first name, approximate age, Bangladesh division, the guardian's name and contact information, and a brief description of the child's situation. For formal verification: birth records or supporting documentation, guardian identification, school enrolment records (where applicable), and a household visit by our field team.",
      },
      {
        id: "guardian-tracking",
        question: "Will the guardian be able to track the profile after submission?",
        answer:
          "Yes. Once a profile is approved and published, we provide the guardian with a dedicated account to track sponsorship status, view donor updates (anonymised by default), upload progress moments, and communicate with our team. Guardian portal access is part of OrphanGive's ongoing partnership with each family.",
      },
    ],
  },
];

// ─── Render helpers ──────────────────────────────────────────────────

function ChevronIcon() {
  // Down-chevron, rotates 180° on open. We use the closest `group`
  // selector on the surrounding `<details>` so a single icon
  // declaration handles both states.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="w-4 h-4 shrink-0 text-tangerine-deeper transition-transform duration-200 group-open:rotate-180"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FaqItemView({ item }: { item: FaqItem }) {
  return (
    <details
      id={item.id}
      // `group` lets the chevron's `group-open:` modifier flip it on
      // open. `[&_summary]:list-none` strips the default disclosure
      // marker triangle on Safari + Firefox; we provide our own.
      className="group rounded-2xl border border-ink/[0.06] bg-white px-6 py-5 transition-colors duration-200 hover:border-ink/[0.12] open:border-ink/[0.12]"
    >
      <summary className="cursor-pointer list-none flex items-baseline justify-between gap-4 font-display font-medium text-[18px] text-ink leading-snug max-md:text-[17px]">
        <span>{item.question}</span>
        <span className="self-center mt-0.5">
          <ChevronIcon />
        </span>
      </summary>
      {/* Answer body. `whitespace-pre-line` so any `\n` inside the
          string becomes a real line break — useful if a long answer
          is broken into paragraphs later. `max-w-[68ch]` caps the
          measure for readability without constraining the card. */}
      <div className="mt-4 text-[15.5px] text-ink-soft leading-[1.7] max-w-[68ch] whitespace-pre-line">
        {item.answer}
      </div>
    </details>
  );
}

function FaqGroupView({ group }: { group: FaqGroup }) {
  return (
    <section
      id={group.id}
      className="border-t border-ink/[0.08] pt-12 mt-12 first:border-t-0 first:pt-0 first:mt-0"
    >
      <header className="mb-7 max-md:mb-6">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-tangerine-deeper font-medium">
          {group.eyebrow}
        </div>
        <h2 className="mt-2 font-display font-normal text-ink leading-tight tracking-[-0.015em] text-[clamp(1.5rem,2.4vw,1.75rem)]">
          {group.heading}
        </h2>
      </header>
      <div className="space-y-3">
        {group.items.map((item) => (
          <FaqItemView key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function FaqPage() {
  return (
    <div className="bg-cream">
      {/* Hero — same eyebrow + dual-font headline + sub-copy pattern
          as /about, /how-it-works, /transparency. Centred. */}
      <header className="px-6 pt-20 pb-14 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[820px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Frequently asked questions
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.1] tracking-[-0.025em] text-[clamp(2.25rem,4.5vw,3.5rem)]">
              Common questions.
            </span>
            <span
              className="block font-script italic text-tangerine-deep leading-[1] tracking-[-0.005em] text-[clamp(2.75rem,5.5vw,4rem)]"
              style={{ marginTop: 6 }}
            >
              Real answers.
            </span>
          </h1>
          <p className="mt-6 text-lg text-ink-soft leading-[1.65] max-w-[640px] mx-auto">
            Answers to the questions donors ask most often. If yours
            isn&rsquo;t here,{" "}
            <Link
              href="/contact"
              className="text-tangerine-deeper underline-offset-4 hover:underline font-medium"
            >
              get in touch
            </Link>
            {" "}— we respond within a few business days.
          </p>
        </div>
      </header>

      {/* Grouped Q&As. The `<section>` per group also surfaces an id
          so links like `/faq#submitting` jump to the section header. */}
      <main className="px-6 pb-16 max-md:pb-12">
        <div className="max-w-[820px] mx-auto">
          {FAQ_GROUPS.map((group) => (
            <FaqGroupView key={group.id} group={group} />
          ))}
        </div>
      </main>

      {/* Closing strip — quiet end-note linking to /contact. Not a
          conversion moment; mirrors the pattern used by /children
          (BrowseClosingStrip). */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[820px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Still have questions?{" "}
            <Link
              href="/contact"
              className="text-tangerine-deeper font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Get in touch →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
