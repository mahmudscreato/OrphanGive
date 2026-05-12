// Session 19 — FAQ page, brand-aligned with the Session 16 design
// system. Replaces the prior CMS-driven (Directus `faq` collection)
// version with 28 hand-written questions across 5 groups. Each
// group carries a stable `id` anchor so the /help page can deep-
// link to it (e.g. /faq#payments).
//
// If/when Mahmud wants editable FAQ content, the prior `getActiveFaqs`
// pattern can be reintroduced; the `faq` collection schema in
// Directus is unchanged.

import Link from "next/link";
import { EyebrowIcon } from "@/components/ui/EyebrowIcon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to common questions about sponsoring a child through OrphanGive — verification, payments, privacy, account, and the organisation behind the network.",
  openGraph: {
    title: "Frequently asked questions — OrphanGive",
    description:
      "Common questions about sponsorship, verification, payments, privacy, and your account.",
  },
};

type Faq = { q: string; a: string };
type FaqGroup = {
  id: string;
  title: string;
  faqs: Faq[];
};

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "about-orphangive",
    title: "About OrphanGive",
    faqs: [
      {
        q: "What is OrphanGive?",
        a: "OrphanGive is a child sponsorship network for verified orphaned and vulnerable children in Bangladesh. We connect donors with individual children whose profiles have been verified on the ground by our partner field team, and we run the donor-facing service that handles payments, reporting, and ongoing updates.",
      },
      {
        q: "Who runs OrphanGive?",
        a: "OrphanGive is a project of Goodverse Foundation in collaboration with Children's Heaven Trust. Goodverse oversees governance and financial accountability; Children's Heaven Trust handles ground verification and field delivery in Bangladesh. Both organisations are named on every page.",
      },
      {
        q: "Where do you operate?",
        a: "Bangladesh, exclusively. Children's Heaven Trust's existing field network is what makes deep verification possible, and that depth would be hard to replicate in another country. Other regions are not on the near-term roadmap.",
      },
      {
        q: "Are you a registered charity?",
        a: "Yes. Children's Heaven Trust is registered with the NGO Affairs Bureau of Bangladesh (Reg. iv-98/2021), and Goodverse Foundation is the operating entity. Detailed regulatory information is on the Transparency page.",
      },
      {
        q: "How are you different from other child sponsorship organizations?",
        a: "Most child sponsorship organisations operate as a single charity that handles everything end-to-end. OrphanGive is the donor-facing service for verified partner charities — we don't compete with them, we route donors to them. The result: more donor visibility into individual children, less administrative overhead at the charity level.",
      },
    ],
  },
  {
    id: "sponsorship-donation",
    title: "Sponsorship & Donation",
    faqs: [
      {
        q: "How does monthly sponsorship work?",
        a: "You choose a child, choose a monthly amount, and complete checkout. The first payment clears immediately; subsequent payments run automatically each month. Funds are tagged to that child's profile and deployed by the field team — schooling, clothing, healthcare, or general care depending on need.",
      },
      {
        q: "What's the minimum monthly amount?",
        a: "Sponsorships start at BDT 1,500 per month — roughly USD 13 at current rates. That's the floor that lets us deliver meaningful, sustained support; below it, the per-child overhead doesn't make sense.",
      },
      {
        q: "Is my donation Zakat-eligible?",
        a: "Most of OrphanGive's monthly sponsorship structures are configured to be Zakat-eligible — the children listed are orphans or vulnerable in the categories Zakat traditionally serves. We don't issue a sharia ruling on your behalf. Please consult your own scholar before designating funds as Zakat.",
      },
      {
        q: "Can I make a one-time donation instead?",
        a: "Yes. One-time gifts can be tagged to specific funds (clothing, healthcare, schooling, general care) and deployed without a recurring commitment. They're welcome alongside or instead of monthly sponsorship.",
      },
      {
        q: "Can I sponsor more than one child?",
        a: "Yes. There's no cap. Each sponsorship is tracked separately in your donor dashboard, so you can see exactly which child each contribution is funding.",
      },
      {
        q: "Can I cancel my sponsorship?",
        a: "Yes, anytime. Monthly sponsorships can be paused or cancelled from your donor dashboard with one click. The child re-enters the waiting pool — no friction, no penalty.",
      },
      {
        q: "What happens to my donation if a child is no longer in need?",
        a: "If a sponsored child's circumstances change — they're adopted, the family becomes self-sufficient, schooling is no longer the support need — the field team flags it and your sponsorship is paused. You're notified, and you can choose to redirect to another waiting child or pause the contribution entirely.",
      },
      {
        q: "Can I get a tax receipt?",
        a: "Receipts are issued by Children's Heaven Trust as the registered charity. Whether the receipt qualifies for tax relief depends on your jurisdiction and your local tax rules — we aren't able to advise on tax law in your country. Please check with a local accountant.",
      },
    ],
  },
  {
    id: "children-privacy",
    title: "Children & Privacy",
    faqs: [
      {
        q: "How are children verified?",
        a: "Children's Heaven Trust's field team visits each candidate in person — meets the guardian, sees the household, reviews documents. Identity, guardian status, school enrolment, household situation, and specific support need are all checked before a profile is approved. The full verification process is detailed on the How It Works page.",
      },
      {
        q: "Why are last names hidden?",
        a: "Last names used to be truncated on public profiles. As of 2026, full display names are shown on the public site — this was a deliberate policy decision after consultation with our partner organisations. Other identifying details (school name, exact address, guardian name) remain protected on the public surface.",
      },
      {
        q: "Can I see photos of the child I sponsor?",
        a: "Yes — you can see whatever photos the guardian has consented to publish, both on the public profile and in the richer sponsor view inside your donor dashboard. Quarterly reports often include additional photos, again only with consent.",
      },
      {
        q: "Can I meet the child I sponsor?",
        a: "In-person meetings happen only with explicit guardian consent and are arranged by Children's Heaven Trust's field team. Most sponsorships develop through written quarterly updates and the donor dashboard, but the path exists if both sides want it.",
      },
      {
        q: "What if a child no longer needs sponsorship?",
        a: "When a child's circumstances change for the better — adoption, family stability, completed schooling — their profile is retired from the active list. The field team flags the change first, and we coordinate with you on whether to redirect or pause your contribution.",
      },
      {
        q: "How do you protect children's privacy?",
        a: "OrphanGive uses a three-tier information model. Public visitors see name, division, age, and support need. Authenticated donors see a richer profile including more photos and support history. Sponsoring donors with reveal approval can see identifying details for direct contact. Each tier exists because the next one would compromise the child if it were public.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    faqs: [
      {
        q: "What payment methods do you accept?",
        a: "Credit and debit cards through Stripe — Visa, Mastercard, American Express. Local Bangladesh payment methods (bKash, Nagad) are on the roadmap but not live yet. International cards work for donors based outside Bangladesh.",
      },
      {
        q: "Is my payment secure?",
        a: "Card details are processed by Stripe and never touch OrphanGive's servers. Stripe is PCI-DSS compliant — the same security infrastructure used by most large internet businesses. We don't see, store, or have access to your card number at any point.",
      },
      {
        q: "Will my card be saved?",
        a: "For monthly sponsorships, yes — Stripe stores a tokenized reference to your card so future payments run automatically. The actual card number stays with Stripe; we only see the token. You can update or remove the saved card from your donor dashboard at any time.",
      },
      {
        q: "When am I charged?",
        a: "The first payment clears at checkout. Subsequent monthly payments run on the same calendar day each month — if you sign up on the 14th, future payments run on the 14th. The charge appears on your card statement as 'OrphanGive' or 'CH Trust'.",
      },
      {
        q: "Can I get a refund?",
        a: "Yes, within reasonable bounds. If a payment was made in error or you change your mind shortly after donating, contact support and we'll process a refund. After funds have been deployed on the ground, refunds aren't possible — but we'll work with you to redirect to another need.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    faqs: [
      {
        q: "How do I sign in?",
        a: "Sign in is at /signin — donors authenticate with their email address and either a password or a magic-link sent to their inbox. If you've donated before, an account was created automatically; the magic-link flow is the easiest way to access it for the first time.",
      },
      {
        q: "I forgot my password",
        a: "Use the 'Forgot password' link on the sign-in page — we'll email you a reset link. If you originally signed up via the magic-link flow without setting a password, just use the magic-link option again; no password reset needed.",
      },
      {
        q: "How do I update my payment method?",
        a: "From your donor dashboard, go to Billing and select 'Update payment method'. Stripe handles the secure card update inline. The new card replaces the saved one for all your active monthly sponsorships in a single step.",
      },
      {
        q: "How do I delete my account?",
        a: "Email support@orphangive.org with the request. We'll cancel any active sponsorships, delete personal data within 30 days, and send confirmation when complete. Your donation history is retained in aggregate form for the required regulatory period.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="bg-cream">
      {/* Page header. */}
      <header className="px-6 pt-20 pb-12 max-md:pt-14 max-md:pb-10">
        <div className="max-w-[860px] mx-auto text-center">
          <div className="inline-flex items-center text-script-md text-tangerine-deep">
            <EyebrowIcon />
            Frequently asked questions
          </div>
          <h1 className="mt-4">
            <span className="block font-display font-normal text-ink leading-[1.05] tracking-[-0.025em] text-[clamp(2.25rem,5vw,4rem)]">
              Common questions.
            </span>
            <span className="block font-script italic text-tangerine-deep leading-[0.95] tracking-[-0.005em] text-[clamp(2.75rem,6vw,5rem)] mt-2">
              Real answers.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-ink-soft leading-[1.65]">
            Twenty-eight of the questions donors ask most often.
            Grouped by topic so you can scan to the part that matters.
          </p>
        </div>
      </header>

      {/* FAQ groups. Each group has an `id` anchor so /help can
          deep-link (e.g. /faq#payments). */}
      <section className="px-6 pb-12 max-md:pb-8">
        <div className="max-w-[860px] mx-auto space-y-12 max-md:space-y-10">
          {FAQ_GROUPS.map((group) => (
            <section
              key={group.id}
              id={group.id}
              className="scroll-mt-24"
              aria-labelledby={`${group.id}-heading`}
            >
              <h2
                id={`${group.id}-heading`}
                className="font-display font-semibold text-2xl max-md:text-xl text-ink mb-5 tracking-[-0.01em]"
              >
                {group.title}
              </h2>
              <div className="space-y-3">
                {group.faqs.map((faq) => (
                  <details
                    key={faq.q}
                    className="group rounded-2xl bg-white border border-ink/[0.06] px-6 py-5 max-md:px-5 max-md:py-4 transition-shadow hover:shadow-md open:shadow-md"
                  >
                    <summary className="cursor-pointer list-none flex justify-between items-center gap-4 font-display font-semibold text-lg max-md:text-base text-ink">
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
            </section>
          ))}
        </div>
      </section>

      {/* Closing strip. */}
      <section className="px-6 py-12 max-md:py-10">
        <div className="max-w-[860px] mx-auto text-center">
          <p className="text-base text-ink-soft leading-relaxed">
            Still have questions?{" "}
            <Link
              href="/contact"
              className="text-tangerine-deep font-medium border-b border-tangerine/40 hover:border-tangerine transition-colors duration-200"
            >
              Get in touch →
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
